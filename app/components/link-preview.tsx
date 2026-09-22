"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { youtubeId, type LinkPreview as Preview } from "@/lib/unfurl";
import { apiFetch } from "../lib/client";

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

/** A Discord-style embed card for one link: site, title, description, image. */
export function LinkPreviewCard({ url }: { url: string }) {
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const videoId = youtubeId(url);

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
  if (!preview) return null;

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
