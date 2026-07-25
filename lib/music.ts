import type { Track } from "./protocol";
import { bindings } from "./storage";

function helperBaseUrl(): URL {
  return new URL(
    bindings().MUSIC_HELPER_BASE_URL?.trim() || "http://127.0.0.1:8731",
  );
}

interface ResolvedTrack {
  title?: string;
  artist?: string;
  duration?: number;
  thumbnail?: string;
  page_url?: string;
  audio_url?: string;
  error?: string;
}

/**
 * Turns "mor ve ötesi bir derdim var" or a URL into something playable, using
 * the yt-dlp resolver that runs beside Huddle (huddle_music_helper.py).
 */
export async function resolveTrack(
  query: string,
  requestedBy: string,
): Promise<Track> {
  const response = await fetch(new URL("/resolve", helperBaseUrl()), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(45000),
  });

  const resolved = (await response.json().catch(() => ({}))) as ResolvedTrack;
  if (!response.ok || !resolved.audio_url) {
    throw new Error(resolved.error || "The Huddle music resolver failed.");
  }

  return {
    id: crypto.randomUUID(),
    title: resolved.title || query,
    artist: resolved.artist || "",
    thumbnail: resolved.thumbnail || null,
    duration: resolved.duration ?? null,
    audioUrl: resolved.audio_url,
    pageUrl: resolved.page_url || null,
    requestedBy,
  };
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "--:--";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function trackLabel(track: Track): string {
  return track.artist ? `${track.title} — ${track.artist}` : track.title;
}
