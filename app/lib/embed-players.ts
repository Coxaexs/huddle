/**
 * Links that can play right in the chat: the site's own embed player, loaded
 * only when someone presses play (like YouTube's), so nothing from Spotify or
 * Twitch loads until then.
 *
 * `shape` decides the frame: "video" is 16:9, "portrait" is a phone video,
 * "audio" is a fixed-height strip of `height` pixels.
 */

export interface EmbedPlayer {
  site: string;
  src: string;
  shape: "video" | "portrait" | "audio";
  height?: number;
  color: string;
  allow: string;
}

const MEDIA_ALLOW = "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write";

/** Twitch paths that are pages, not channels. */
const TWITCH_RESERVED = new Set([
  "directory", "downloads", "jobs", "p", "search", "settings", "subscriptions", "turbo", "wallet",
  "inventory", "drops", "friends", "messages", "videos", "store", "prime", "login", "signup",
]);

/** The player for a link, or null when it is not one Hoffle can embed. `pageHost` is where Hoffle runs (Twitch asks). */
export function playerFor(raw: string, pageHost: string): EmbedPlayer | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  const path = url.pathname.replace(/\/+$/, "");

  if (host === "open.spotify.com") {
    const match = path.match(/^(?:\/intl-[a-z-]+)?\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{10,32})$/);
    if (!match) return null;
    const compact = match[1] === "track" || match[1] === "episode";
    return {
      site: "Spotify",
      src: `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=hoffle&autoplay=1`,
      shape: "audio",
      height: compact ? 152 : 352,
      color: "#1db954",
      allow: MEDIA_ALLOW,
    };
  }

  if (host === "soundcloud.com") {
    const match = path.match(/^\/([\w-]+)\/(sets\/)?([\w-]+)$/);
    if (!match || ["discover", "stream", "you", "search", "upload", "charts"].includes(match[1])) return null;
    const clean = `https://soundcloud.com${path}`;
    return {
      site: "SoundCloud",
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&color=%23ff5500&auto_play=true&hide_related=true&show_comments=false&visual=false`,
      shape: "audio",
      height: match[2] ? 352 : 166,
      color: "#ff5500",
      allow: "autoplay",
    };
  }

  if (host === "music.apple.com") {
    const match = path.match(/^\/([a-z]{2})\/(album|playlist|song|music-video)\/[^/]+\/([\w.-]+)$/);
    if (!match) return null;
    const single = match[2] === "song" || (match[2] === "album" && url.searchParams.has("i"));
    return {
      site: "Apple Music",
      src: `https://embed.music.apple.com${path}${url.search}`,
      shape: "audio",
      height: single ? 175 : 450,
      color: "#fa243c",
      allow: "autoplay *; encrypted-media *; fullscreen *; clipboard-write",
    };
  }

  if (host === "deezer.com") {
    const match = path.match(/^(?:\/[a-z]{2})?\/(track|album|playlist)\/(\d+)$/);
    if (!match) return null;
    return {
      site: "Deezer",
      src: `https://widget.deezer.com/widget/auto/${match[1]}/${match[2]}?autoplay=true`,
      shape: "audio",
      height: match[1] === "track" ? 152 : 300,
      color: "#a238ff",
      allow: "encrypted-media; clipboard-write; autoplay",
    };
  }

  if (host === "vimeo.com") {
    const match = path.match(/^\/(\d{5,12})(?:\/([0-9a-f]{6,20}))?$/);
    if (!match) return null;
    return {
      site: "Vimeo",
      src: `https://player.vimeo.com/video/${match[1]}?autoplay=1${match[2] ? `&h=${match[2]}` : ""}`,
      shape: "video",
      color: "#1ab7ea",
      allow: MEDIA_ALLOW,
    };
  }

  if (host === "streamable.com") {
    const match = path.match(/^\/([a-z0-9]{4,12})$/i);
    if (!match) return null;
    return { site: "Streamable", src: `https://streamable.com/e/${match[1]}?autoplay=1`, shape: "video", color: "#2c67ff", allow: MEDIA_ALLOW };
  }

  if (host === "tiktok.com") {
    const match = path.match(/^\/@[\w.-]+\/video\/(\d{10,25})$/);
    if (!match) return null;
    return {
      site: "TikTok",
      src: `https://www.tiktok.com/player/v1/${match[1]}?autoplay=1&music_info=1&description=1`,
      shape: "portrait",
      color: "#ff0050",
      allow: MEDIA_ALLOW,
    };
  }

  if (host === "twitch.tv" || host === "clips.twitch.tv") {
    // Twitch only plays inside the page it was told about.
    if (!pageHost || !/^[a-z0-9.-]+$/i.test(pageHost)) return null;
    const parent = `parent=${encodeURIComponent(pageHost)}`;
    const base = { site: "Twitch", shape: "video" as const, color: "#9146ff", allow: MEDIA_ALLOW };
    if (host === "clips.twitch.tv") {
      const slug = path.slice(1);
      return /^[\w-]{4,100}$/.test(slug) ? { ...base, src: `https://clips.twitch.tv/embed?clip=${slug}&${parent}&autoplay=true` } : null;
    }
    const clip = path.match(/^\/[\w]+\/clip\/([\w-]{4,100})$/);
    if (clip) return { ...base, src: `https://clips.twitch.tv/embed?clip=${clip[1]}&${parent}&autoplay=true` };
    const video = path.match(/^\/videos\/(\d{5,15})$/);
    if (video) return { ...base, src: `https://player.twitch.tv/?video=v${video[1]}&${parent}&autoplay=true` };
    const channel = path.match(/^\/(\w{3,25})$/);
    if (channel && !TWITCH_RESERVED.has(channel[1].toLowerCase())) {
      return { ...base, src: `https://player.twitch.tv/?channel=${channel[1]}&${parent}&autoplay=true` };
    }
    return null;
  }

  return null;
}
