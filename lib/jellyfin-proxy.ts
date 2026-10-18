/**
 * One Jellyfin conversion per watch party, however many people watch.
 *
 * Jellyfin keys a conversion on the session, the device and the client's
 * user agent, and every browser sends its own user agent (and may not change
 * it), so each viewer used to start a conversion of their own. Instead, every
 * viewer loads the film from /api/watch/jellyfin/…, and this server asks
 * Jellyfin for it as one client: the first viewer starts the conversion and
 * everyone else is served the same segments from Jellyfin's cache.
 *
 * Only the Jellyfin this server is configured for is proxied (it reaches it
 * locally); links to any other Jellyfin play per viewer, as before.
 */
import { bindings } from "./storage";
import { jellyfinLink } from "./jellyfin";
import type { WatchQuality, WatchState } from "./lounge-shared";

/** The Jellyfin people paste links to, and where this server reaches the same one. */
export function jellyfinProxyConfig(): { publicBase: string; localBase: string } | null {
  const env = (bindings() ?? {}) as unknown as { JELLYFIN_PUBLIC_URL?: string; JELLYFIN_LOCAL_URL?: string };
  const publicBase = (env.JELLYFIN_PUBLIC_URL?.trim() || "https://deeppixel.online/jellyfin").replace(/\/+$/, "");
  const localBase = (env.JELLYFIN_LOCAL_URL?.trim() || "http://127.0.0.1:8096/jellyfin").replace(/\/+$/, "");
  if (publicBase === "off") return null;
  return { publicBase, localBase };
}

export function isProxiedBase(base: string): boolean {
  const config = jellyfinProxyConfig();
  return Boolean(config && base.replace(/\/+$/, "").toLowerCase() === config.publicBase.toLowerCase());
}

/** What each quality asks Jellyfin for: H.264 + AAC stereo up to 1080p, at 8 or 4 Mbps. */
export const CONVERSION_QUALITY: Record<Exclude<WatchQuality, "original">, Record<string, string>> = {
  "8": { VideoBitrate: "8000000", AudioBitrate: "192000", MaxWidth: "1920", MaxHeight: "1080" },
  "4": { VideoBitrate: "4000000", AudioBitrate: "160000", MaxWidth: "1920", MaxHeight: "1080" },
};

/** The one "client" Jellyfin sees for every watch party. */
export const PARTY_USER_AGENT = "Huddle-WatchParty/1";
export const partyDevice = (session: string) => `huddle-party-${session}`;

export const ITEM_ID = /^[0-9a-f]{32}$/i;
export const SESSION_ID = /^[a-z0-9]{8,32}$/i;
const API_KEY = /^[A-Za-z0-9]{16,64}$/;
const TICKS = /^\d{1,20}$/;

/**
 * Jellyfin's URL for one piece of a shared conversion, rebuilt from scratch so
 * a viewer can neither reach any other Jellyfin endpoint nor change the
 * session or the quality (which would start a conversion of their own).
 * `file` is master.m3u8, main.m3u8 or a segment like hls1/main/12.ts.
 */
export function upstreamUrl(
  parts: { item: string; session: string; quality: string; file: string },
  query: URLSearchParams,
): string | null {
  const config = jellyfinProxyConfig();
  if (!config) return null;
  if (!ITEM_ID.test(parts.item) || !SESSION_ID.test(parts.session)) return null;
  const quality = CONVERSION_QUALITY[parts.quality as "8" | "4"];
  if (!quality) return null;
  const key = query.get("api_key") || query.get("ApiKey") || "";
  if (!API_KEY.test(key)) return null;
  const mediaSource = query.get("MediaSourceId") || parts.item;
  if (!ITEM_ID.test(mediaSource)) return null;
  const segment = /^hls1\/main\/(\d{1,6})\.ts$/.exec(parts.file);
  if (!segment && parts.file !== "master.m3u8" && parts.file !== "main.m3u8") return null;
  const params = new URLSearchParams({
    api_key: key,
    MediaSourceId: mediaSource,
    PlaySessionId: parts.session,
    DeviceId: partyDevice(parts.session),
    VideoCodec: "h264",
    AudioCodec: "aac",
    TranscodingMaxAudioChannels: "2",
    SegmentContainer: "ts",
    ...quality,
  });
  if (segment) {
    for (const name of ["runtimeTicks", "actualSegmentLengthTicks"]) {
      const value = query.get(name);
      if (value && TICKS.test(value)) params.set(name, value);
    }
  }
  return `${config.localBase}/Videos/${parts.item}/${parts.file}?${params}`;
}

/** Fetches one piece of a shared conversion for a viewer. */
export async function proxyConversion(
  parts: { item: string; session: string; quality: string; file: string },
  query: URLSearchParams,
): Promise<Response> {
  // The first request names the Jellyfin it is for; only ours is proxied.
  const base = query.get("b");
  if (base !== null && !isProxiedBase(base)) return new Response("Not this server's Jellyfin", { status: 404 });
  const upstream = upstreamUrl(parts, query);
  if (!upstream) return new Response("Bad watch-party request", { status: 400 });
  let response: Response;
  try {
    response = await fetch(upstream, { headers: { "User-Agent": PARTY_USER_AGENT } });
  } catch {
    return new Response("Jellyfin is not reachable", { status: 502 });
  }
  if (!response.ok) return new Response("Jellyfin refused the conversion", { status: response.status === 401 ? 403 : 502 });
  if (parts.file.endsWith(".m3u8")) {
    // Relative links in the playlists come back here; the trick-play thumbnails are not needed.
    const text = (await response.text())
      .split("\n")
      .filter((line) => !line.startsWith("#EXT-X-IMAGE-STREAM-INF"))
      .join("\n");
    return new Response(text, {
      headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" },
    });
  }
  return new Response(response.body, {
    headers: {
      "content-type": response.headers.get("content-type") || "video/mp2t",
      ...(response.headers.get("content-length") ? { "content-length": response.headers.get("content-length")! } : {}),
      "cache-control": "private, max-age=3600",
    },
  });
}

/** Stops a room's shared conversion (a new film, a new quality, or the party ended). */
export async function stopSharedConversion(watch: Pick<WatchState, "url" | "session">): Promise<void> {
  const config = jellyfinProxyConfig();
  const link = jellyfinLink(watch.url);
  if (!config || !watch.session || !link || link.needsKey || !isProxiedBase(link.base)) return;
  const params = new URLSearchParams({ DeviceId: partyDevice(watch.session), PlaySessionId: watch.session, api_key: link.apiKey });
  await fetch(`${config.localBase}/Videos/ActiveEncodings?${params}`, {
    method: "DELETE",
    headers: { "User-Agent": PARTY_USER_AGENT },
  });
}
