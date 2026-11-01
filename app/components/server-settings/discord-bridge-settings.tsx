"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Lock, RefreshCw, Unlink, Wand2 } from "lucide-react";
import { apiFetch } from "../../lib/client";
import { proxiedImage } from "../../lib/image-proxy";

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
  };
}

const OPTIONS: Array<{ key: keyof BridgeSettings; label: string; hint: string }> = [
  { key: "reactions", label: "Reactions", hint: "Each Discord person's reaction shows here under their name; Hoffle reactions show on Discord." },
  { key: "edits", label: "Edits and deletes", hint: "Changing or deleting a message changes it on the other side too." },
  { key: "files", label: "Files and pictures", hint: "Copied across, so they still work after Discord's links expire." },
  { key: "threads", label: "Threads", hint: "A thread on one side opens the same thread on the other." },
  { key: "typing", label: "Typing", hint: "\"Someone is typing…\" crosses over." },
  {
    key: "mirrorDeletes",
    label: "Deletes go both ways",
    hint: "Deleting the copy of a message on either side deletes the original too. On Discord the bot needs Manage Messages.",
  },
  {
    key: "voice",
    label: "Voice chat",
    hint: "A voice room paired with a Discord voice channel carries the call: each Discord person shows here as their own seat, and everyone here is heard on Discord through the bot.",
  },
];

/** Discord's permission names, in words. */
const PERMISSION_WORDS: Record<string, string> = {
  ViewChannel: "see the channel",
  SendMessages: "send messages",
  ReadMessageHistory: "read message history",
  ManageWebhooks: "manage webhooks",
  AddReactions: "add reactions",
  AttachFiles: "attach files",
  EmbedLinks: "embed links",
  ManageMessages: "manage messages",
  CreatePublicThreads: "create threads",
  SendMessagesInThreads: "send in threads",
  Connect: "join the voice channel",
  Speak: "speak in the voice channel",
};

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
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
        setError(err instanceof Error ? err.message : "That didn't save.");
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
      onNotice("No more channels with the same name on both sides.");
      return;
    }
    void send(
      { method: "PATCH", body: JSON.stringify({ pairs: [...next].map(([c, d]) => ({ channelId: c, discordChannelId: d })) }) },
      `Paired ${added} channel${added === 1 ? "" : "s"} by name.`,
    );
  };

  const light = !service.online
    ? { tone: "off", text: service.lastSeen ? `Bridge service offline since ${ago(service.lastSeen)}` : "Bridge service not running" }
    : !service.discordConnected
      ? { tone: "bad", text: service.error ? `Can't reach Discord: ${service.error}` : "Reconnecting to Discord…" }
      : !service.hoffleConnected
        ? { tone: "bad", text: "Reconnecting to Hoffle…" }
        : bridge?.linked && discord && !discord.present
          ? { tone: "bad", text: "The bot isn't in that Discord server any more" }
          : bridge?.linked && (discord?.missing.length || discord?.channels.some((c) => data.pairs.some((p) => p.discordChannelId === c.id) && c.missing?.length))
            ? { tone: "warn", text: "Running, but missing some permissions on Discord" }
            : { tone: "ok", text: bridge?.linked ? "Running" : "Ready" };

  const pairedMissing = (discord?.channels || []).filter(
    (c) => data.pairs.some((p) => p.discordChannelId === c.id) && c.missing?.length,
  );

  return (
    <section className="integration-section discord-bridge" id="integration-discord-bridge">
      <header className="integration-section-head">
        <h2>
          Discord Bridge
          {bridge?.linked && <span className="integration-count">{data.pairs.length} paired</span>}
        </h2>
        <p>
          Mirror channels with a Discord server, both ways: messages with each person&apos;s name and picture, replies,
          edits, deletes, reactions, files and threads. Handy while people move over, or to keep both going.
        </p>
      </header>

      <p className={`bridge-status bridge-status-${light.tone}`} role="status">
        <span className="bridge-light" aria-hidden />
        {light.text}
        {service.online && bridge?.linked && service.activity?.lastRelayAt && (
          <span className="bridge-status-sub"> · last message {ago(service.activity.lastRelayAt)}</span>
        )}
        {service.activity?.lastError && <span className="bridge-status-sub"> · {service.activity.lastError}</span>}
      </p>

      {!service.online && (
        <p className="integration-empty">
          The bridge runs as its own small service next to Hoffle. Whoever runs this Hoffle starts it once (see{" "}
          <code>docs/self-hosting.md</code> → Discord bridge); after that every server sets itself up here.
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
            Set up the bridge
          </button>
        </div>
      )}

      {bridge && !bridge.linked && (
        <ol className="bridge-steps">
          <li>
            <strong>Add the bot to your Discord server.</strong>
            <span>You need Manage Server there.</span>
            {service.inviteUrl ? (
              <a className="discord-btn primary-indigo" href={service.inviteUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink size={14} /> Add {service.app?.name || "the bot"} to Discord
              </a>
            ) : (
              <span className="integration-warn">Waiting for the bridge service to start…</span>
            )}
          </li>
          <li>
            <strong>In any channel of that Discord server, type:</strong>
            {bridge.code ? (
              <span className="bridge-code-row">
                <code className="bridge-code">/hoffle link {bridge.code}</code>
                <button
                  type="button"
                  className="discord-btn secondary-gray"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(`/hoffle link ${bridge.code}`)
                      .then(() => onNotice("Copied. Paste it into Discord."))
                      .catch(() => onNotice(`/hoffle link ${bridge.code}`));
                  }}
                >
                  <Copy size={14} /> Copy
                </button>
              </span>
            ) : (
              <span className="integration-warn">That code expired.</span>
            )}
            <span>
              {bridge.code && bridge.codeExpiresAt
                ? `Works for ${Math.max(1, Math.round((Date.parse(bridge.codeExpiresAt) - Date.now()) / 60000))} more minutes. `
                : ""}
              <button type="button" className="bridge-link-btn" disabled={busy} onClick={() => void send({ method: "POST" })}>
                <RefreshCw size={12} /> New code
              </button>
            </span>
          </li>
          <li>
            <strong>Pick the channels to mirror.</strong>
            <span>This page updates by itself once Discord answers.</span>
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
                Linked {bridge.linkedBy ? `by ${bridge.linkedBy} ` : ""}
                {ago(bridge.linkedAt)}
              </span>
            </div>
          </div>

          {discord?.missing.length ? (
            <p className="integration-warn">
              On Discord the bot can&apos;t {discord.missing.map((m) => PERMISSION_WORDS[m] || m).join(", ")}. Give its role those
              permissions, or add it again with the button below.
            </p>
          ) : null}
          {pairedMissing.map((channel) => (
            <p key={channel.id} className="integration-warn">
              In #{channel.name} the bot can&apos;t {(channel.missing || []).map((m) => PERMISSION_WORDS[m] || m).join(", ")}.
            </p>
          ))}

          <div className="bridge-pairs-head">
            <h3>Channels</h3>
            <button type="button" className="discord-btn secondary-gray" disabled={busy || !discord?.channels.length} onClick={matchByName}>
              <Wand2 size={14} /> Pair same names
            </button>
          </div>
          {discord && !discord.channels.length ? (
            <p className="integration-empty">
              {discord.present
                ? "The bot can't see any text channel there yet. Check its role can view the channels you want to mirror."
                : "The bot isn't in that Discord server. Add it again, then link once more."}
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
                          <span className="integration-badge off" title="Private channel">
                            <Lock size={10} /> private
                          </span>
                        )}
                      </strong>
                      {paired && channel.private && (
                        <p className="integration-warn">Everyone in the Discord channel will read this private channel.</p>
                      )}
                    </div>
                    <span className="bridge-arrow" aria-hidden>
                      ⇄
                    </span>
                    <select
                      value={paired}
                      disabled={busy}
                      aria-label={`Discord channel for #${channel.name}`}
                      onChange={(e) => setPair(channel.id, e.target.value)}
                    >
                      <option value="">Not mirrored</option>
                      {paired && !discord?.channels.some((d) => d.id === paired) && <option value={paired}>(channel gone)</option>}
                      {(discord?.channels || [])
                        .filter((d) => fits(channel.kind, d.type))
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {DISCORD_VOICE.has(d.type) ? "🔊 " : "#"}
                            {d.name}
                            {d.parent ? ` · ${d.parent}` : ""}
                            {DISCORD_VOICE.has(d.type) ? " (call + chat)" : ""}
                          </option>
                        ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="bridge-subhead">What crosses over</h3>
          <ul className="bridge-options">
            {OPTIONS.map((option) => (
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

          <div className="integration-form bridge-actions">
            {service.inviteUrl && (
              <a className="discord-btn secondary-gray" href={service.inviteUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink size={14} /> Add the bot again (fixes permissions)
              </a>
            )}
            <button
              type="button"
              className="discord-btn secondary-gray"
              disabled={busy}
              onClick={() => void send({ method: "POST" }, "New link code made. Run /hoffle link in the other Discord server.")}
            >
              <RefreshCw size={14} /> Link a different Discord server
            </button>
            <button
              type="button"
              className="discord-btn danger-btn"
              disabled={busy}
              onClick={() =>
                onRequestConfirm({
                  title: "Turn off the Discord bridge?",
                  message: `Messages stop crossing between ${serverName} and ${bridge.guild?.name || "Discord"}. Nothing already sent is deleted on either side.`,
                  isDanger: true,
                  confirmText: "Turn off",
                  onConfirm: () => void send({ method: "DELETE" }, "The Discord bridge is off."),
                })
              }
            >
              <Unlink size={14} /> Turn off
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
            onClick={() => void send({ method: "DELETE" }, "Cancelled.")}
          >
            Cancel setup
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
          Saving…
        </p>
      )}
    </section>
  );
}
