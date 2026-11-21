"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Lock, RefreshCw, Unlink, Wand2 } from "lucide-react";
import { apiFetch } from "../../lib/client";
import { proxiedImage } from "../../lib/image-proxy";
import { useI18n, currentLocale } from "../../lib/i18n-context";
import { createTranslator, type MessageKey } from "@/lib/i18n";

const tx = (key: string, vars?: Record<string, string | number>) => createTranslator(currentLocale())(key as MessageKey, vars);

interface BridgeSettings {
  reactions: boolean;
  edits: boolean;
  files: boolean;
  threads: boolean;
  typing: boolean;
  mirrorDeletes: boolean;
  voice: boolean;
}

/** Discord's voice (2) and stage (13) channel types. */
const DISCORD_VOICE = new Set([2, 13]);
const isVoiceRoom = (kind: string) => kind === "voice" || kind === "stage";
/** What a Hoffle channel can pair with: text with text; a voice room with text, or with voice for the call too. */
const fits = (kind: string, discordType: number) => isVoiceRoom(kind) || !DISCORD_VOICE.has(discordType);

interface Snapshot {
  bridge: {
    linked: boolean;
    guild: { id: string; name: string; icon?: string | null } | null;
    linkedBy: string | null;
    linkedAt: string | null;
    code: string | null;
    codeExpiresAt: string | null;
    settings: BridgeSettings;
  } | null;
  pairs: Array<{ channelId: string; discordChannelId: string }>;
  hoffleChannels: Array<{ id: string; name: string; kind: string; private: boolean }>;
  discord: {
    channels: Array<{ id: string; name: string; type: number; parent?: string | null; missing?: string[] }>;
    missing: string[];
    present: boolean;
  } | null;
  service: {
    online: boolean;
    lastSeen: string | null;
    app: { id: string; name: string; avatarUrl?: string | null } | null;
    inviteUrl: string | null;
    discordConnected: boolean;
    hoffleConnected: boolean;
    error: string | null;
    activity: { lastRelayAt?: string | null; lastError?: string | null; relayed?: number } | null;
    /** Extra Discord bots that show each Hoffle person in a Discord call on their own. */
    voiceHelpers?: Array<{
      id: string;
      name: string;
      avatarUrl: string | null;
      connected: boolean;
      inServer: boolean;
      inviteUrl: string;
    }>;
  };
}

/** What crosses over; labels and hints are catalog keys (intg.br.opt.<key>[.hint]). */
const OPTIONS: Array<keyof BridgeSettings> = ["reactions", "edits", "files", "threads", "typing", "mirrorDeletes", "voice"];

/** Discord's permission names, in words. */
const PERMISSION_KEYS = new Set([
  "ViewChannel", "SendMessages", "ReadMessageHistory", "ManageWebhooks", "AddReactions", "AttachFiles",
  "EmbedLinks", "ManageMessages", "CreatePublicThreads", "SendMessagesInThreads", "Connect", "Speak",
]);
const permissionWords = (missing: string[]) =>
  missing.map((m) => (PERMISSION_KEYS.has(m) ? tx(`intg.br.perm.${m}`) : m)).join(", ");

function ago(iso: string | null | undefined): string {
  if (!iso) return tx("intg.br.never");
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return tx("intg.ago.now");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return tx("intg.br.minAgo", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return tx("intg.br.hAgo", { n: hours });
  return new Date(iso).toLocaleDateString();
}

function plain(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Server Settings → Integrations → Discord Bridge. Three steps: add the
 * bridge's bot to a Discord server, run /hoffle link <code> there, pair
 * channels. Afterwards a status light and the options. Hidden for people
 * without Manage Server (the API answers 403).
 */
export function DiscordBridgePanel({
  serverId,
  serverName,
  onNotice,
  onRequestConfirm,
}: {
  serverId: string;
  serverName: string;
  onNotice: (text: string) => void;
  onRequestConfirm: (options: { title: string; message?: string; isDanger?: boolean; confirmText?: string; onConfirm: () => void }) => void;
}) {
  const { t } = useI18n();
  const tk = (key: string, vars?: Record<string, string | number>) => t(key as MessageKey, vars);
  const [data, setData] = useState<Snapshot | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const path = `/api/servers/${encodeURIComponent(serverId)}/discord-bridge`;

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<Snapshot>(path));
    } catch (err) {
      if (err instanceof Error && /403|Manage Server/i.test(err.message)) setForbidden(true);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  // While waiting for /hoffle link, and every so often after, pick up what the
  // service reports (the link landing, a new channel, the status light).
  const waiting = Boolean(data?.bridge && !data.bridge.linked);
  useEffect(() => {
    if (!data?.bridge) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, waiting ? 3000 : 20000);
    return () => window.clearInterval(timer);
  }, [data?.bridge, waiting, load]);

  const send = useCallback(
    async (init: RequestInit, notice?: string) => {
      setBusy(true);
      setError("");
      try {
        setData(await apiFetch<Snapshot>(path, init));
        if (notice) onNotice(notice);
      } catch (err) {
        setError(err instanceof Error ? err.message : tx("intg.br.saveFailed"));
      } finally {
        setBusy(false);
      }
    },
    [path, onNotice],
  );

  const pairsByHoffle = useMemo(() => new Map((data?.pairs || []).map((p) => [p.channelId, p.discordChannelId])), [data?.pairs]);

  if (forbidden || !data) return null;
  const { bridge, service, discord } = data;

  const setPair = (channelId: string, discordChannelId: string) => {
    const next = new Map(pairsByHoffle);
    if (discordChannelId) {
      // One partner each: taking a Discord channel frees it from elsewhere.
      for (const [hoffle, theirs] of next) if (theirs === discordChannelId) next.delete(hoffle);
      next.set(channelId, discordChannelId);
    } else {
      next.delete(channelId);
    }
    void send({
      method: "PATCH",
      body: JSON.stringify({ pairs: [...next].map(([c, d]) => ({ channelId: c, discordChannelId: d })) }),
    });
  };

  const matchByName = () => {
    if (!discord) return;
    const next = new Map(pairsByHoffle);
    const taken = new Set(next.values());
    let added = 0;
    for (const channel of data.hoffleChannels) {
      if (next.has(channel.id) || channel.private) continue;
      const match = discord.channels.find(
        (d) => !taken.has(d.id) && fits(channel.kind, d.type) && plain(d.name) === plain(channel.name),
      );
      if (match) {
        next.set(channel.id, match.id);
        taken.add(match.id);
        added += 1;
      }
    }
    if (!added) {
      onNotice(tk("intg.br.noSameNames"));
      return;
    }
    void send(
      { method: "PATCH", body: JSON.stringify({ pairs: [...next].map(([c, d]) => ({ channelId: c, discordChannelId: d })) }) },
      added === 1 ? tk("intg.br.pairedByNameOne") : tk("intg.br.pairedByName", { n: added }),
    );
  };

  const light = !service.online
    ? { tone: "off", text: service.lastSeen ? tk("intg.br.offlineSince", { when: ago(service.lastSeen) }) : tk("intg.br.notRunning") }
    : !service.discordConnected
      ? { tone: "bad", text: service.error ? tk("intg.br.cantReach", { error: service.error }) : tk("intg.br.reconnectingDiscord") }
      : !service.hoffleConnected
        ? { tone: "bad", text: tk("intg.br.reconnectingHoffle") }
        : bridge?.linked && discord && !discord.present
          ? { tone: "bad", text: tk("intg.br.botGone") }
          : bridge?.linked && (discord?.missing.length || discord?.channels.some((c) => data.pairs.some((p) => p.discordChannelId === c.id) && c.missing?.length))
            ? { tone: "warn", text: tk("intg.br.missingPerms") }
            : { tone: "ok", text: bridge?.linked ? tk("intg.br.running") : tk("intg.br.ready") };

  const pairedMissing = (discord?.channels || []).filter(
    (c) => data.pairs.some((p) => p.discordChannelId === c.id) && c.missing?.length,
  );
  const helpers = service.voiceHelpers ?? [];
  const helpersIn = helpers.filter((helper) => helper.inServer).length;

  return (
    <section className="integration-section discord-bridge" id="integration-discord-bridge">
      <header className="integration-section-head">
        <h2>
          {tk("intg.br.title")}
          {bridge?.linked && <span className="integration-count">{tk("intg.br.paired", { n: data.pairs.length })}</span>}
        </h2>
        <p>{tk("intg.br.desc")}</p>
      </header>

      <p className={`bridge-status bridge-status-${light.tone}`} role="status">
        <span className="bridge-light" aria-hidden />
        {light.text}
        {service.online && bridge?.linked && service.activity?.lastRelayAt && (
          <span className="bridge-status-sub"> · {tk("intg.br.lastMessage", { when: ago(service.activity.lastRelayAt) })}</span>
        )}
        {service.activity?.lastError && <span className="bridge-status-sub"> · {service.activity.lastError}</span>}
      </p>

      {!service.online && (
        <p className="integration-empty">
          {tk("intg.br.serviceA")} <code>docs/self-hosting.md</code> {tk("intg.br.serviceB")}
        </p>
      )}

      {!bridge && (
        <div className="integration-form">
          <button
            type="button"
            className="discord-btn primary-indigo"
            disabled={busy}
            onClick={() => void send({ method: "POST" })}
          >
            {tk("intg.br.setUp")}
          </button>
        </div>
      )}

      {bridge && !bridge.linked && (
        <ol className="bridge-steps">
          <li>
            <strong>{tk("intg.br.step1")}</strong>
            <span>{tk("intg.br.step1Need")}</span>
            {service.inviteUrl ? (
              <a className="discord-btn primary-indigo" href={service.inviteUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink size={14} /> {tk("intg.br.addBotTo", { name: service.app?.name || tk("intg.br.theBot") })}
              </a>
            ) : (
              <span className="integration-warn">{tk("intg.br.waitingService")}</span>
            )}
          </li>
          <li>
            <strong>{tk("intg.br.step2")}</strong>
            {bridge.code ? (
              <span className="bridge-code-row">
                <code className="bridge-code">/hoffle link {bridge.code}</code>
                <button
                  type="button"
                  className="discord-btn secondary-gray"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(`/hoffle link ${bridge.code}`)
                      .then(() => onNotice(tk("intg.br.copiedPaste")))
                      .catch(() => onNotice(`/hoffle link ${bridge.code}`));
                  }}
                >
                  <Copy size={14} /> {tk("intg.br.copy")}
                </button>
              </span>
            ) : (
              <span className="integration-warn">{tk("intg.br.codeExpired")}</span>
            )}
            <span>
              {bridge.code && bridge.codeExpiresAt
                ? `${tk("intg.br.worksFor", { n: Math.max(1, Math.round((Date.parse(bridge.codeExpiresAt) - Date.now()) / 60000)) })} `
                : ""}
              <button type="button" className="bridge-link-btn" disabled={busy} onClick={() => void send({ method: "POST" })}>
                <RefreshCw size={12} /> {tk("intg.br.newCode")}
              </button>
            </span>
          </li>
          <li>
            <strong>{tk("intg.br.step3")}</strong>
            <span>{tk("intg.br.step3Hint")}</span>
          </li>
        </ol>
      )}

      {bridge?.linked && (
        <>
          <div className="bridge-linked">
            {bridge.guild?.icon ? (
              <img src={proxiedImage(bridge.guild.icon)} alt="" className="bridge-guild-icon" />
            ) : (
              <span className="bridge-guild-icon" aria-hidden>
                {bridge.guild?.name.slice(0, 1) || "D"}
              </span>
            )}
            <div>
              <strong>
                {serverName} <span aria-hidden>⇄</span> {bridge.guild?.name}
              </strong>
              <span>
                {bridge.linkedBy
                  ? tk("intg.br.linkedBy", { name: bridge.linkedBy, when: ago(bridge.linkedAt) })
                  : tk("intg.br.linked", { when: ago(bridge.linkedAt) })}
              </span>
            </div>
          </div>

          {discord?.missing.length ? (
            <p className="integration-warn">
              {tk("intg.br.botCant", { perms: permissionWords(discord.missing) })}
            </p>
          ) : null}
          {pairedMissing.map((channel) => (
            <p key={channel.id} className="integration-warn">
              {tk("intg.br.botCantIn", { channel: channel.name, perms: permissionWords(channel.missing || []) })}
            </p>
          ))}

          <div className="bridge-pairs-head">
            <h3>{tk("intg.br.channels")}</h3>
            <button type="button" className="discord-btn secondary-gray" disabled={busy || !discord?.channels.length} onClick={matchByName}>
              <Wand2 size={14} /> {tk("intg.br.pairSame")}
            </button>
          </div>
          {discord && !discord.channels.length ? (
            <p className="integration-empty">
              {discord.present
                ? tk("intg.br.cantSee")
                : tk("intg.br.notInServer")}
            </p>
          ) : (
            <ul className="integration-list bridge-pairs">
              {data.hoffleChannels.map((channel) => {
                const paired = pairsByHoffle.get(channel.id) || "";
                return (
                  <li key={channel.id} className={`integration-row ${paired ? "" : "is-off"}`}>
                    <div className="integration-row-main">
                      <strong>
                        {channel.kind === "voice" || channel.kind === "stage" ? "🔊 " : "#"}
                        {channel.name}
                        {channel.private && (
                          <span className="integration-badge off" title={tk("intg.br.privateChannel")}>
                            <Lock size={10} /> {tk("intg.br.private")}
                          </span>
                        )}
                      </strong>
                      {paired && channel.private && (
                        <p className="integration-warn">{tk("intg.br.privateWarn")}</p>
                      )}
                    </div>
                    <span className="bridge-arrow" aria-hidden>
                      ⇄
                    </span>
                    <select
                      value={paired}
                      disabled={busy}
                      aria-label={tk("intg.br.discordFor", { channel: channel.name })}
                      onChange={(e) => setPair(channel.id, e.target.value)}
                    >
                      <option value="">{tk("intg.br.notMirrored")}</option>
                      {paired && !discord?.channels.some((d) => d.id === paired) && <option value={paired}>{tk("intg.br.channelGone")}</option>}
                      {(discord?.channels || [])
                        .filter((d) => fits(channel.kind, d.type))
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {DISCORD_VOICE.has(d.type) ? "🔊 " : "#"}
                            {d.name}
                            {d.parent ? ` · ${d.parent}` : ""}
                            {DISCORD_VOICE.has(d.type) ? tk("intg.br.callChat") : ""}
                          </option>
                        ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="bridge-subhead">{tk("intg.br.crosses")}</h3>
          <ul className="bridge-options">
            {OPTIONS.map((key) => ({ key, label: tk(`intg.br.opt.${key}`), hint: tk(`intg.br.opt.${key}.hint`) })).map((option) => (
              <li key={option.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={bridge.settings[option.key]}
                    disabled={busy}
                    onChange={(e) =>
                      void send({ method: "PATCH", body: JSON.stringify({ settings: { [option.key]: e.target.checked } }) })
                    }
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.hint}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {bridge.settings.voice && helpers.length > 0 && (
            <>
              <h3 className="bridge-subhead">{tk("intg.br.voices")}</h3>
              <p className="integration-empty">
                {tk("intg.br.helpersIntro")}{" "}
                {tk("intg.br.helpersInGuild", { in: helpersIn, total: helpers.length, guild: bridge.guild?.name || tk("intg.br.theServer") })}{" "}
                {helpersIn
                  ? tk("intg.br.helpersSome", { n: helpersIn, bot: service.app?.name || tk("intg.br.theBot") })
                  : tk("intg.br.helpersNone", { bot: service.app?.name || tk("intg.br.theBot") })}
              </p>
              {helpers.some((helper) => !helper.inServer) && (
                <div className="integration-form bridge-actions">
                  {helpers
                    .filter((helper) => !helper.inServer)
                    .map((helper) => (
                      <a key={helper.id} className="discord-btn secondary-gray" href={helper.inviteUrl} target="_blank" rel="noreferrer noopener">
                        <ExternalLink size={14} /> {tk("intg.br.addNamed", { name: helper.name })}
                      </a>
                    ))}
                </div>
              )}
            </>
          )}

          <div className="integration-form bridge-actions">
            {service.inviteUrl && (
              <a className="discord-btn secondary-gray" href={service.inviteUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink size={14} /> {tk("intg.br.addAgain")}
              </a>
            )}
            <button
              type="button"
              className="discord-btn secondary-gray"
              disabled={busy}
              onClick={() => void send({ method: "POST" }, tk("intg.br.newLink"))}
            >
              <RefreshCw size={14} /> {tk("intg.br.linkOther")}
            </button>
            <button
              type="button"
              className="discord-btn danger-btn"
              disabled={busy}
              onClick={() =>
                onRequestConfirm({
                  title: tk("intg.br.offTitle"),
                  message: tk("intg.br.offBody", { a: serverName, b: bridge.guild?.name || "Discord" }),
                  isDanger: true,
                  confirmText: tk("intg.br.turnOff"),
                  onConfirm: () => void send({ method: "DELETE" }, tk("intg.br.off")),
                })
              }
            >
              <Unlink size={14} /> {tk("intg.br.turnOff")}
            </button>
          </div>
        </>
      )}

      {bridge && !bridge.linked && bridge.guild === null && data.pairs.length === 0 && (
        <div className="integration-form">
          <button
            type="button"
            className="bridge-link-btn"
            disabled={busy}
            onClick={() => void send({ method: "DELETE" }, tk("intg.br.cancelled"))}
          >
            {tk("intg.br.cancelSetup")}
          </button>
        </div>
      )}

      {error && (
        <p className="integration-error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="bridge-saving" aria-live="polite">
          {tk("intg.br.saving")}
        </p>
      )}
    </section>
  );
}
