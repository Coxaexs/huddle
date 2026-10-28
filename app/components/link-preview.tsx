"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Play } from "lucide-react";
import { youtubeId, type LinkPreview as Preview } from "@/lib/unfurl";
import { apiFetch } from "../lib/client";
import { playerFor, type EmbedPlayer } from "../lib/embed-players";

/** One request per URL per page load, shared by every message that links it. */
const previewCache = new Map<string, Promise<Preview | null>>();

function loadPreview(url: string): Promise<Preview | null> {
  let pending = previewCache.get(url);
  if (!pending) {
    pending = apiFetch<{ preview: Preview | null }>(
      `/api/unfurl?url=${encodeURIComponent(url)}`,
    )
      .then((data) => data.preview)
      .catch(() => null);
    previewCache.set(url, pending);
  }
  return pending;
}

/** Start offset in seconds from ?t=90 / ?t=1m30s / &start=90. */
function youtubeStart(raw: string): number {
  try {
    const url = new URL(raw);
    const value = url.searchParams.get("t") || url.searchParams.get("start") || "";
    if (/^\d+$/.test(value)) return Number(value);
    const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!match) return 0;
    return (Number(match[1]) || 0) * 3600 + (Number(match[2]) || 0) * 60 + (Number(match[3]) || 0);
  } catch {
    return 0;
  }
}

function YouTubeEmbed({ url, videoId, preview }: { url: string; videoId: string; preview: Preview | null }) {
  const [playing, setPlaying] = useState(false);
  const start = youtubeStart(url);
  const title = preview?.title || "YouTube video";
  return (
    <div className="link-preview link-preview-video" style={{ borderColor: "#ff0033" }}>
      <span className="link-preview-site">YouTube</span>
      {preview?.author &&
        (preview.authorUrl ? (
          <a className="link-preview-author" href={preview.authorUrl} target="_blank" rel="noreferrer">
            {preview.author}
          </a>
        ) : (
          <span className="link-preview-author">{preview.author}</span>
        ))}
      <a className="link-preview-title" href={url} target="_blank" rel="noreferrer">
        {title}
      </a>
      <div className="link-preview-player">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1${start ? `&start=${start}` : ""}`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="link-preview-play"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${title}`}
          >
            {/* The thumbnail comes through our image proxy with the preview. */}
            {preview?.image && <img src={preview.image} alt="" loading="lazy" />}
            <span>
              <Play size={26} fill="currentColor" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Spotify, SoundCloud, Twitch, Vimeo and friends: the preview card with a play
 * button, swapped for the site's own player when pressed.
 */
function PlayerCard({ url, player, preview }: { url: string; player: EmbedPlayer; preview: Preview | null }) {
  const [playing, setPlaying] = useState(false);
  const title = preview?.title || `${player.site} link`;
  const frameStyle = player.height ? { height: player.height } : undefined;
  return (
    <div
      className={`link-preview link-preview-video link-preview-embed shape-${player.shape}`}
      style={{ borderColor: player.color, "--player-color": player.color } as CSSProperties}
    >
      <span className="link-preview-site">{player.site}</span>
      {preview?.author && <span className="link-preview-author">{preview.author}</span>}
      <a className="link-preview-title" href={url} target="_blank" rel="noreferrer">
        {title}
      </a>
      {playing ? (
        <div className={`link-preview-player shape-${player.shape}`} style={frameStyle}>
          <iframe src={player.src} title={title} allow={player.allow} allowFullScreen />
        </div>
      ) : player.shape === "audio" ? (
        <div className="link-preview-audio">
          {preview?.image && <img src={preview.image} alt="" loading="lazy" />}
          <div className="link-preview-audio-text">
            {preview?.description && <p className="link-preview-description">{preview.description}</p>}
            <button type="button" className="link-preview-listen" onClick={() => setPlaying(true)}>
              <Play size={14} fill="currentColor" /> Play here
            </button>
          </div>
        </div>
      ) : (
        <div className={`link-preview-player shape-${player.shape}`}>
          <button
            type="button"
            className="link-preview-play"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${title}`}
          >
            {preview?.image && <img src={preview.image} alt="" loading="lazy" />}
            <span>
              <Play size={26} fill="currentColor" />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A message that is only a Tenor/Giphy page link: just the GIF, like Discord.
 * Until the preview arrives (or if it has no GIF) it stays a plain link.
 */
export function GifPageEmbed({ url, onImage }: { url: string; onImage?: (src: string) => void }) {
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let live = true;
    void loadPreview(url).then((result) => {
      if (live) setPreview(result);
    });
    return () => {
      live = false;
    };
  }, [url]);

  const src = preview?.gif && !broken ? preview.image : undefined;
  if (!src) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
    );
  }
  return (
    <img
      className="message-image message-gif"
      src={src}
      alt={preview?.title || ""}
      onClick={() => onImage?.(src)}
      onError={() => setBroken(true)}
    />
  );
}

/** A Discord-style embed card for one link: site, title, description, image. */
export function LinkPreviewCard({ url }: { url: string }) {
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const videoId = youtubeId(url);
  const player = videoId ? null : playerFor(url, typeof window === "undefined" ? "" : window.location.hostname);

  useEffect(() => {
    let live = true;
    void loadPreview(url).then((result) => {
      if (live) setPreview(result);
    });
    return () => {
      live = false;
    };
  }, [url]);

  if (videoId) return <YouTubeEmbed url={url} videoId={videoId} preview={preview || null} />;
  if (player) return <PlayerCard url={url} player={player} preview={preview || null} />;
  if (!preview) return null;
  // A GIF site's link in a longer message: the GIF, not a card about it.
  if (preview.gif && preview.image) {
    return <img className="message-image message-gif" src={preview.image} alt={preview.title} loading="lazy" />;
  }

  const image = preview.image ? (
    <img
      className={preview.largeImage ? "link-preview-image" : "link-preview-thumb"}
      src={preview.image}
      alt=""
      loading="lazy"
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
    />
  ) : null;

  return (
    <div
      className={`link-preview ${preview.largeImage ? "" : "has-thumb"}`}
      style={preview.themeColor ? { borderColor: preview.themeColor } : undefined}
    >
      <div className="link-preview-text">
        <span className="link-preview-site">{preview.siteName}</span>
        {preview.author && <span className="link-preview-author">{preview.author}</span>}
        <a className="link-preview-title" href={url} target="_blank" rel="noreferrer">
          {preview.title}
        </a>
        {preview.description && (
          <p className="link-preview-description">{preview.description}</p>
        )}
        {preview.largeImage && image}
      </div>
      {!preview.largeImage && image}
    </div>
  );
}
