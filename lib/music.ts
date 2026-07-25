import type { Track } from "./protocol";
import { botFetch, botSession } from "./musicbot";
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

interface BotResolvedTrack extends ResolvedTrack {
  resolve_query?: string;
}

async function playableTrack(
  resolved: BotResolvedTrack,
  requestedBy: string,
): Promise<Track> {
  const query = resolved.resolve_query || resolved.page_url || resolved.title || "";
  const response = await fetch(new URL("/resolve", helperBaseUrl()), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(45000),
  });
  const stream = (await response.json().catch(() => ({}))) as ResolvedTrack;
  if (!response.ok || !stream.audio_url) {
    throw new Error(stream.error || `Could not stream ${resolved.title || query}.`);
  }
  return {
    id: crypto.randomUUID(),
    title: resolved.title || stream.title || query,
    artist: resolved.artist || stream.artist || "",
    thumbnail: resolved.thumbnail || stream.thumbnail || null,
    duration: resolved.duration ?? stream.duration ?? null,
    audioUrl: stream.audio_url,
    pageUrl: resolved.page_url || stream.page_url || null,
    requestedBy,
  };
}

/**
 * Resolve with the real Music + Watch bot first, so Spotify, playlists and the
 * local-library preference behave exactly like its Discord /play command.
 */
export async function resolveTracks(
  query: string,
  requestedBy: string,
): Promise<Track[]> {
  try {
    const cookie = await botSession();
    const result = await botFetch("/api/huddle/resolve", cookie, {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    const source = (result.tracks || []) as BotResolvedTrack[];
    const tracks: Track[] = [];
    // Keep lookups bounded while still preserving playlist order.
    for (let offset = 0; offset < source.length; offset += 6) {
      const batch = await Promise.all(
        source
          .slice(offset, offset + 6)
          .map((item) => playableTrack(item, requestedBy)),
      );
      tracks.push(...batch);
    }
    if (tracks.length) return tracks;
  } catch (error) {
    // A stopped dashboard must not break ordinary YouTube playback.
    if (/spotify(?:\.com|:)/i.test(query)) throw error;
  }
  return [await resolveTrackDirect(query, requestedBy)];
}

/**
 * Turns "mor ve ötesi bir derdim var" or a URL into something playable, using
 * the yt-dlp resolver that runs beside Huddle (huddle_music_helper.py).
 */
async function resolveTrackDirect(
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

export async function resolveTrack(
  query: string,
  requestedBy: string,
): Promise<Track> {
  const tracks = await resolveTracks(query, requestedBy);
  return tracks[0];
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
