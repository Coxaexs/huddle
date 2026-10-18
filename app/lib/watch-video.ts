/**
 * Turns what someone typed for Watch Together (a YouTube link, a name to
 * search for, a Jellyfin link, or a direct video link) into a link the room's
 * screen can play and a title for it. Shared by the watch panel, its queue
 * and the /watch command.
 */
import { apiFetch } from "./client";
import { JELLYFIN_NEEDS_KEY, jellyfinLink, jellyfinTitle, parseStreamUrl } from "./stream-url";

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+?&v=))([\w-]{11})/i);
  return match ? match[1] : null;
}

/** A web address (or one of our own uploads), as opposed to words to search for. */
export function looksLikeUrl(raw: string): boolean {
  return /^(https?:)?\/\//i.test(raw) || /^\/hangout\/api\//.test(raw);
}

/** Whether resolving this goes through yt-dlp (slow: the server downloads it first). */
export function needsYouTubeDownload(raw: string): boolean {
  return Boolean(extractYouTubeId(raw)) || !looksLikeUrl(raw);
}

/** Download a YouTube video (or the first result for a search) to the server via yt-dlp. */
export async function downloadYouTubeVideo(urlOrQuery: string): Promise<{ streamUrl: string; title: string }> {
  const result = await apiFetch<{ ok: boolean; streamUrl: string; title: string }>("/api/youtube/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: urlOrQuery }),
  });
  if (!result.ok || !result.streamUrl) {
    throw new Error("Failed to download video from YouTube.");
  }
  return { streamUrl: result.streamUrl, title: result.title };
}

export async function resolveVideo(raw: string): Promise<{ url: string; title: string }> {
  const text = raw.trim();
  if (needsYouTubeDownload(text)) {
    const { streamUrl, title } = await downloadYouTubeVideo(text);
    return { url: streamUrl, title };
  }
  const jelly = jellyfinLink(text);
  if (jelly?.needsKey) throw new Error(JELLYFIN_NEEDS_KEY);
  const parsed = parseStreamUrl(text);
  if (!/^https:\/\//i.test(parsed.url) && !/^\/hangout\/api\//.test(parsed.url)) {
    throw new Error("Only https:// video links can be shared with the room.");
  }
  const title = jelly ? (await jellyfinTitle(jelly)) ?? parsed.title : parsed.title;
  return { url: parsed.url, title };
}
