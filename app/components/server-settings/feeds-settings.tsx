"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { FeedKind, PublicFeed } from "@/lib/feeds";
import { apiFetch } from "../../lib/client";
import { useI18n, currentLocale } from "../../lib/i18n-context";
import { createTranslator, type MessageKey } from "@/lib/i18n";

const tx = (key: string, vars?: Record<string, string | number>) => createTranslator(currentLocale())(key as MessageKey, vars);

interface ListResponse {
  feeds: PublicFeed[];
  channels: Array<{ id: string; name: string }>;
  max: number;
}

const KIND_ICON: Record<FeedKind, string> = {
  rss: "📰",
  youtube: "▶️",
  reddit: "👽",
  bluesky: "🦋",
  mastodon: "🐘",
  github: "🐙",
};

/** Ideas under the box, each one a working example. */
const EXAMPLES = [
  { label: "intg.feeds.exYoutube", value: "https://www.youtube.com/@veritasium" },
  { label: "intg.feeds.exSubreddit", value: "https://www.reddit.com/r/boardgames" },
  { label: "intg.feeds.exBluesky", value: "https://bsky.app/profile/bsky.app" },
  { label: "intg.feeds.exGithub", value: "https://github.com/godotengine/godot" },
  { label: "intg.feeds.exBlog", value: "https://www.theverge.com" },
];

function ago(iso: string | null): string {
  if (!iso) return tx("intg.ago.never");
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return tx("intg.ago.now");
  if (minutes < 60) return tx("intg.ago.minutes", { n: minutes });
  if (minutes < 48 * 60) return tx("intg.ago.hours", { n: Math.round(minutes / 60) });
  return new Date(iso).toLocaleDateString();
}

/**
 * Server Settings → Integrations: feeds. Paste a link (a YouTube channel, a
 * subreddit, a blog) and pick a channel; new posts show up there. Hidden for
 * people without Manage Channels (the list answers 403).
 */
export function FeedsPanel({
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
  const [url, setUrl] = useState("");
  const [channelId, setChannelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<ListResponse>(`/api/feeds?serverId=${encodeURIComponent(serverId)}`)
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
  const channelName = (id: string) => data.channels.find((c) => c.id === id)?.name ?? tk("intg.feeds.deletedChannel");
  const full = data.feeds.length >= data.max;

  async function follow() {
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ feed: PublicFeed }>("/api/feeds", {
        method: "POST",
        body: JSON.stringify({ serverId, channelId, url }),
      });
      setData((current) => (current ? { ...current, feeds: [...current.feeds, result.feed] } : current));
      setUrl("");
      onNotice(tk("intg.feeds.followed", { channel: channelName(channelId), title: result.feed.title }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : tk("intg.feeds.followFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function move(feed: PublicFeed, nextChannel: string) {
    try {
      const result = await apiFetch<{ feed: PublicFeed }>("/api/feeds", {
        method: "PATCH",
        body: JSON.stringify({ id: feed.id, channelId: nextChannel }),
      });
      setData((current) =>
        current ? { ...current, feeds: current.feeds.map((f) => (f.id === feed.id ? result.feed : f)) } : current,
      );
      onNotice(tk("intg.feeds.moved", { title: feed.title, channel: channelName(nextChannel) }));
    } catch (failure) {
      onNotice(failure instanceof Error ? failure.message : tk("intg.feeds.moveFailed"));
    }
  }

  async function remove(feed: PublicFeed) {
    try {
      await apiFetch(`/api/feeds?id=${encodeURIComponent(feed.id)}`, { method: "DELETE" });
      setData((current) => (current ? { ...current, feeds: current.feeds.filter((f) => f.id !== feed.id) } : current));
      onNotice(tk("intg.feeds.stopped", { title: feed.title }));
    } catch (failure) {
      onNotice(failure instanceof Error ? failure.message : tk("intg.feeds.removeFailed"));
    }
  }

  return (
    <section className="integration-section" id="integration-feeds">
      <header className="integration-section-head">
        <h2>
          {tk("intg.feeds.title")} <span className="integration-count">{data.feeds.length}/{data.max}</span>
        </h2>
        <p>{tk("intg.feeds.desc")}</p>
      </header>
      {data.channels.length ? (
        <form
          className="integration-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && url.trim() && channelId && !full) void follow();
          }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={tk("intg.feeds.placeholder")}
            aria-label={tk("intg.feeds.linkAria")}
            inputMode="url"
          />
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} aria-label={tk("intg.feeds.postInto")}>
            {data.channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="discord-btn primary-indigo" disabled={busy || !url.trim() || !channelId || full}>
            {busy ? tk("intg.feeds.looking") : tk("intg.feeds.follow")}
          </button>
        </form>
      ) : (
        <p className="integration-empty">{tk("intg.feeds.noChannel")}</p>
      )}
      {error && (
        <p className="integration-error" role="alert">
          <AlertTriangle size={14} /> {error}
        </p>
      )}
      {!data.feeds.length && (
        <div className="integration-examples">
          <span>{tk("intg.feeds.try")}</span>
          {EXAMPLES.map((example) => (
            <button key={example.value} type="button" onClick={() => setUrl(example.value)}>
              {tk(example.label)}
            </button>
          ))}
        </div>
      )}
      {data.feeds.length > 0 && (
        <ul className="integration-list">
          {data.feeds.map((feed) => (
            <li key={feed.id} className="integration-row">
              <span className="integration-row-icon" aria-hidden>
                {KIND_ICON[feed.kind] || "📰"}
              </span>
              <div className="integration-row-main">
                <strong>{feed.title}</strong>
                <p>
                  {tk("intg.feeds.postsTo")}{" "}
                  <select
                    value={data.channels.some((c) => c.id === feed.channelId) ? feed.channelId : ""}
                    onChange={(e) => void move(feed, e.target.value)}
                    aria-label={tk("intg.feeds.channelFor", { title: feed.title })}
                  >
                    {!data.channels.some((c) => c.id === feed.channelId) && <option value="">{tk("intg.feeds.deletedChannel")}</option>}
                    {data.channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </select>
                  {" · "}
                  {feed.lastError ? (
                    <span className="integration-warn">
                      <AlertTriangle size={12} /> {feed.lastError}
                    </span>
                  ) : (
                    <>{tk("intg.feeds.lastPost", { when: ago(feed.lastPostAt) })}</>
                  )}
                </p>
              </div>
              <div className="integration-row-actions">
                <a className="discord-btn secondary-gray" href={feed.sourceUrl} target="_blank" rel="noreferrer">
                  {tk("intg.open")}
                </a>
                <button
                  type="button"
                  className="discord-btn danger-btn"
                  aria-label={tk("intg.feeds.stopFollowingNamed", { title: feed.title })}
                  title={tk("intg.feeds.stopFollowing")}
                  onClick={() =>
                    onRequestConfirm({
                      title: tk("intg.feeds.stopConfirmTitle", { title: feed.title }),
                      message: tk("intg.feeds.stopConfirmBody"),
                      isDanger: true,
                      confirmText: tk("intg.feeds.stopFollowing"),
                      onConfirm: () => void remove(feed),
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
