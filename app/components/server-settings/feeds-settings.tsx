"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { FeedKind, PublicFeed } from "@/lib/feeds";
import { apiFetch } from "../../lib/client";

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
  { label: "A YouTube channel", value: "https://www.youtube.com/@veritasium" },
  { label: "A subreddit", value: "https://www.reddit.com/r/boardgames" },
  { label: "A Bluesky account", value: "https://bsky.app/profile/bsky.app" },
  { label: "GitHub releases", value: "https://github.com/godotengine/godot" },
  { label: "Any blog or news site", value: "https://www.theverge.com" },
];

function ago(iso: string | null): string {
  if (!iso) return "nothing yet";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)}h ago`;
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
  const channelName = (id: string) => data.channels.find((c) => c.id === id)?.name ?? "deleted channel";
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
      onNotice(`#${channelName(channelId)} now follows ${result.feed.title}.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not follow that.");
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
      onNotice(`${feed.title} now posts to #${channelName(nextChannel)}.`);
    } catch (failure) {
      onNotice(failure instanceof Error ? failure.message : "Could not move the feed.");
    }
  }

  async function remove(feed: PublicFeed) {
    try {
      await apiFetch(`/api/feeds?id=${encodeURIComponent(feed.id)}`, { method: "DELETE" });
      setData((current) => (current ? { ...current, feeds: current.feeds.filter((f) => f.id !== feed.id) } : current));
      onNotice(`Stopped following ${feed.title}.`);
    } catch (failure) {
      onNotice(failure instanceof Error ? failure.message : "Could not remove the feed.");
    }
  }

  return (
    <section className="integration-section" id="integration-feeds">
      <header className="integration-section-head">
        <h2>
          Feeds <span className="integration-count">{data.feeds.length}/{data.max}</span>
        </h2>
        <p>New videos, posts and articles show up in a channel by themselves, checked every 15 minutes.</p>
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
            placeholder="Paste a link: YouTube channel, subreddit, blog, Bluesky…"
            aria-label="Link to follow"
            inputMode="url"
          />
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} aria-label="Post into">
            {data.channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="discord-btn primary-indigo" disabled={busy || !url.trim() || !channelId || full}>
            {busy ? "Looking…" : "Follow"}
          </button>
        </form>
      ) : (
        <p className="integration-empty">This server has no text channel to post into yet.</p>
      )}
      {error && (
        <p className="integration-error" role="alert">
          <AlertTriangle size={14} /> {error}
        </p>
      )}
      {!data.feeds.length && (
        <div className="integration-examples">
          <span>Try</span>
          {EXAMPLES.map((example) => (
            <button key={example.value} type="button" onClick={() => setUrl(example.value)}>
              {example.label}
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
                  Posts to{" "}
                  <select
                    value={data.channels.some((c) => c.id === feed.channelId) ? feed.channelId : ""}
                    onChange={(e) => void move(feed, e.target.value)}
                    aria-label={`Channel for ${feed.title}`}
                  >
                    {!data.channels.some((c) => c.id === feed.channelId) && <option value="">deleted channel</option>}
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
                    <>last post {ago(feed.lastPostAt)}</>
                  )}
                </p>
              </div>
              <div className="integration-row-actions">
                <a className="discord-btn secondary-gray" href={feed.sourceUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
                <button
                  type="button"
                  className="discord-btn danger-btn"
                  aria-label={`Stop following ${feed.title}`}
                  title="Stop following"
                  onClick={() =>
                    onRequestConfirm({
                      title: `Stop following ${feed.title}?`,
                      message: "Nothing new will be posted. What it already posted stays.",
                      isDanger: true,
                      confirmText: "Stop following",
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
