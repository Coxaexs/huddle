"use client";

import { useEffect, useState } from "react";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { apiFetch } from "../../lib/client";

interface Webhook {
  id: string;
  channelId: string;
  name: string;
  avatar: string;
  path: string;
  createdAt: string;
  lastUsedAt: string | null;
  uses: number;
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
        setData(result);
        setChannelId((current) => current || result.channels[0]?.id || "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  if (!data) return null;

  const channelName = (id: string) => data.channels.find((c) => c.id === id)?.name ?? "deleted channel";

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
      await copy(result.webhook, "Webhook created and its URL copied.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not create the webhook.");
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
      onNotice(error instanceof Error ? error.message : "Could not save the webhook.");
    }
  }

  async function remove(hook: Webhook) {
    try {
      await apiFetch(`/api/webhooks?id=${encodeURIComponent(hook.id)}`, { method: "DELETE" });
      setData((current) => (current ? { ...current, webhooks: current.webhooks.filter((w) => w.id !== hook.id) } : current));
      onNotice(`Deleted ${hook.name}. Its URL no longer works.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not delete the webhook.");
    }
  }

  async function copy(hook: Webhook, notice = "Webhook URL copied.") {
    try {
      await navigator.clipboard.writeText(fullUrl(hook.path));
      onNotice(notice);
    } catch {
      onNotice(fullUrl(hook.path));
    }
  }

  return (
    <section className="dnd-settings webhooks-settings">
      <h2>Webhooks ({data.webhooks.length}/{data.max})</h2>
      <div className="dnd-settings-row stacked">
        <p>
          A webhook is a secret URL that posts into one channel. It takes Discord&apos;s webhook format, so GitHub,
          CI, uptime monitors and scripts that post to Discord work here too. Add <code>/github</code> to the URL for
          GitHub&apos;s own events, or <code>/slack</code> for Slack-style tools. Each one can post 30 times a minute.
        </p>
        {data.channels.length ? (
          <div className="webhook-create">
            <input
              className="webhook-avatar-input"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              aria-label="Webhook emoji"
              maxLength={8}
            />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GitHub" maxLength={40} aria-label="Webhook name" />
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)} aria-label="Channel">
              {data.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="discord-btn primary-indigo"
              disabled={busy || !name.trim() || !channelId || data.webhooks.length >= data.max}
              onClick={() => void create()}
            >
              New webhook
            </button>
          </div>
        ) : (
          <p>This server has no text channel to post into yet.</p>
        )}
      </div>
      {data.webhooks.map((hook) => (
        <div key={hook.id} className="dnd-settings-row webhook-row">
          <span className="webhook-avatar" aria-hidden>
            {hook.avatar}
          </span>
          <div className="webhook-main">
            <strong>{hook.name}</strong>
            <p>
              Posts to{" "}
              <select
                value={data.channels.some((c) => c.id === hook.channelId) ? hook.channelId : ""}
                onChange={(e) => void update(hook, { channelId: e.target.value }, `${hook.name} now posts to #${channelName(e.target.value)}.`)}
                aria-label={`Channel for ${hook.name}`}
              >
                {!data.channels.some((c) => c.id === hook.channelId) && <option value="">deleted channel</option>}
                {data.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
              {" · "}
              {hook.uses ? `${hook.uses} post${hook.uses === 1 ? "" : "s"}, last ${new Date(hook.lastUsedAt || hook.createdAt).toLocaleString()}` : "not used yet"}
            </p>
          </div>
          <div className="dnd-settings-toggle">
            <button type="button" className="discord-btn secondary-gray" onClick={() => void copy(hook)} title="Copy URL">
              <Copy size={14} /> Copy URL
            </button>
            <button
              type="button"
              className="discord-btn secondary-gray"
              title="New URL"
              aria-label={`Give ${hook.name} a new URL`}
              onClick={() =>
                onRequestConfirm({
                  title: "Give this webhook a new URL?",
                  message: "The old URL stops working right away. Anything using it has to be given the new one.",
                  confirmText: "New URL",
                  onConfirm: () => void update(hook, { rotate: true }, "New URL issued. Copy it again to use it."),
                })
              }
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              className="discord-btn danger-btn"
              title="Delete"
              aria-label={`Delete ${hook.name}`}
              onClick={() =>
                onRequestConfirm({
                  title: `Delete ${hook.name}?`,
                  message: "Its URL stops working. Messages it already posted stay.",
                  isDanger: true,
                  confirmText: "Delete",
                  onConfirm: () => void remove(hook),
                })
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
