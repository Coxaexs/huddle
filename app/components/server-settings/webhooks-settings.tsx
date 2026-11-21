"use client";

import { useEffect, useState } from "react";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { apiFetch } from "../../lib/client";
import { useI18n } from "../../lib/i18n-context";
import type { MessageKey } from "@/lib/i18n";

interface Webhook {
  id: string;
  channelId: string;
  name: string;
  avatar: string;
  path: string;
  createdAt: string;
  lastUsedAt: string | null;
  uses: number;
  source?: string | null;
}

interface ListResponse {
  webhooks: Webhook[];
  channels: Array<{ id: string; name: string }>;
  max: number;
}

/** The full URL a webhook lives at; the API answers it under the base path. */
function fullUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}/hangout${path}`;
}

/**
 * Server Settings → Integrations: incoming webhooks. Each is a secret URL
 * that posts into one channel, for GitHub, CI, uptime checks or scripts.
 * Hidden for people without Manage Channels (the list answers 403).
 */
export function WebhooksPanel({
  serverId,
  onNotice,
  onRequestConfirm,
}: {
  serverId: string;
  onNotice: (text: string) => void;
  onRequestConfirm: (options: { title: string; message?: string; isDanger?: boolean; confirmText?: string; onConfirm: () => void }) => void;
}) {
  const { t } = useI18n();
  const tk = (key: string, vars?: Record<string, string | number>) => t(key as MessageKey, vars);
  const [data, setData] = useState<ListResponse | null>(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("🪝");
  const [channelId, setChannelId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ListResponse>(`/api/webhooks?serverId=${encodeURIComponent(serverId)}`)
      .then((result) => {
        if (cancelled) return;
        // The Discord bridge's own webhooks are run from its panel, not here.
        setData({ ...result, webhooks: result.webhooks.filter((hook) => hook.source !== "discord-bridge") });
        setChannelId((current) => current || result.channels[0]?.id || "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  if (!data) return null;

  const channelName = (id: string) => data.channels.find((c) => c.id === id)?.name ?? tk("intg.feeds.deletedChannel");

  function replace(hook: Webhook) {
    setData((current) =>
      current ? { ...current, webhooks: current.webhooks.map((w) => (w.id === hook.id ? hook : w)) } : current,
    );
  }

  async function create() {
    setBusy(true);
    try {
      const result = await apiFetch<{ webhook: Webhook }>("/api/webhooks", {
        method: "POST",
        body: JSON.stringify({ serverId, channelId, name, avatar }),
      });
      setData((current) => (current ? { ...current, webhooks: [...current.webhooks, result.webhook] } : current));
      setName("");
      await copy(result.webhook, tk("intg.hooks.created"));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : tk("intg.hooks.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function update(hook: Webhook, patch: Record<string, unknown>, notice?: string) {
    try {
      const result = await apiFetch<{ webhook: Webhook }>("/api/webhooks", {
        method: "PATCH",
        body: JSON.stringify({ id: hook.id, ...patch }),
      });
      replace(result.webhook);
      if (notice) onNotice(notice);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : tk("intg.hooks.saveFailed"));
    }
  }

  async function remove(hook: Webhook) {
    try {
      await apiFetch(`/api/webhooks?id=${encodeURIComponent(hook.id)}`, { method: "DELETE" });
      setData((current) => (current ? { ...current, webhooks: current.webhooks.filter((w) => w.id !== hook.id) } : current));
      onNotice(tk("intg.hooks.deleted", { name: hook.name }));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : tk("intg.hooks.deleteFailed"));
    }
  }

  async function copy(hook: Webhook, notice = tk("intg.hooks.copied")) {
    try {
      await navigator.clipboard.writeText(fullUrl(hook.path));
      onNotice(notice);
    } catch {
      onNotice(fullUrl(hook.path));
    }
  }

  return (
    <section className="integration-section webhooks-settings" id="integration-webhooks">
      <header className="integration-section-head">
        <h2>
          {tk("intg.hooks.title")} <span className="integration-count">{data.webhooks.filter((hook) => !hook.source).length}/{data.max}</span>
        </h2>
        <p>
          {tk("intg.hooks.descA")} <code>/github</code>, <code>/gitlab</code> {tk("intg.hooks.descOr")}{" "}
          <code>/gitea</code> {tk("intg.hooks.descB")} <code>/slack</code> {tk("intg.hooks.descC")}
        </p>
      </header>
      {data.channels.length ? (
        <form
          className="integration-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && name.trim() && channelId && data.webhooks.filter((hook) => !hook.source).length < data.max) void create();
          }}
        >
          <input
            className="webhook-avatar-input"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            aria-label={tk("intg.hooks.emoji")}
            maxLength={8}
          />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tk("intg.hooks.namePlaceholder")} maxLength={40} aria-label={tk("intg.hooks.name")} />
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} aria-label={tk("intg.hooks.channel")}>
            {data.channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="discord-btn primary-indigo"
            disabled={busy || !name.trim() || !channelId || data.webhooks.filter((hook) => !hook.source).length >= data.max}
          >
            {tk("intg.hooks.new")}
          </button>
        </form>
      ) : (
        <p className="integration-empty">{tk("intg.feeds.noChannel")}</p>
      )}
      {data.webhooks.length > 0 && <ul className="integration-list">
      {data.webhooks.map((hook) => (
        <li key={hook.id} className="integration-row">
          <span className="integration-row-icon" aria-hidden>
            {hook.avatar}
          </span>
          <div className="integration-row-main">
            <strong>{hook.name}</strong>
            <p>
              {tk("intg.feeds.postsTo")}{" "}
              <select
                value={data.channels.some((c) => c.id === hook.channelId) ? hook.channelId : ""}
                onChange={(e) => void update(hook, { channelId: e.target.value }, tk("intg.hooks.movedTo", { name: hook.name, channel: channelName(e.target.value) }))}
                aria-label={tk("intg.hooks.channelFor", { name: hook.name })}
              >
                {!data.channels.some((c) => c.id === hook.channelId) && <option value="">{tk("intg.feeds.deletedChannel")}</option>}
                {data.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
              {" · "}
              {hook.uses
                ? hook.uses === 1
                  ? tk("intg.hooks.usesOne", { when: new Date(hook.lastUsedAt || hook.createdAt).toLocaleString() })
                  : tk("intg.hooks.uses", { count: hook.uses, when: new Date(hook.lastUsedAt || hook.createdAt).toLocaleString() })
                : tk("intg.hooks.unused")}
            </p>
          </div>
          <div className="integration-row-actions">
            <button type="button" className="discord-btn secondary-gray" onClick={() => void copy(hook)} title={tk("intg.hooks.copyUrl")}>
              <Copy size={14} /> {tk("intg.hooks.copyUrl")}
            </button>
            <button
              type="button"
              className="discord-btn secondary-gray"
              title={tk("intg.hooks.newUrl")}
              aria-label={tk("intg.hooks.newUrlNamed", { name: hook.name })}
              onClick={() =>
                onRequestConfirm({
                  title: tk("intg.hooks.newUrlTitle"),
                  message: tk("intg.hooks.newUrlBody"),
                  confirmText: tk("intg.hooks.newUrl"),
                  onConfirm: () => void update(hook, { rotate: true }, tk("intg.hooks.newUrlDone")),
                })
              }
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              className="discord-btn danger-btn"
              title={tk("intg.delete")}
              aria-label={tk("intg.deleteNamed", { name: hook.name })}
              onClick={() =>
                onRequestConfirm({
                  title: tk("intg.hooks.deleteTitle", { name: hook.name }),
                  message: tk("intg.hooks.deleteBody"),
                  isDanger: true,
                  confirmText: tk("intg.delete"),
                  onConfirm: () => void remove(hook),
                })
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        </li>
      ))}
      </ul>}
    </section>
  );
}
