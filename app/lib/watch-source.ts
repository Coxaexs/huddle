"use client";

import { basePath } from "./client";
import { jellyfinLink, type JellyfinLink } from "./stream-url";
import type { WatchQuality } from "@/lib/lounge-shared";

/**
 * Puts a watch-party link into a <video>.
 *
 * Most links are plain files and just become its `src`. A Jellyfin film is
 * often something browsers cannot play as it is (an .mkv, HEVC video, AC-3 or
 * DTS sound: about three in four of the library), so Jellyfin converts it to
 * HLS (H.264 + AAC) on the fly, played through hls.js where the browser has no
 * HLS of its own.
 *
 * The whole room shares one conversion, at the quality whoever started the
 * film picked: it comes through this server (lib/jellyfin-proxy.ts), which
 * asks Jellyfin for it as a single client. Only a Jellyfin the server does not
 * proxy falls back to a conversion per viewer.
 */

export interface WatchSourceOptions {
  /** Seconds to start at, so a late joiner's conversion starts where the room is. */
  startAt?: number;
  /**
   * Nothing could play it. Every failure reaches the viewer through here, and
   * only once the fallbacks are used up, so callers need no error handler of
   * their own on the element.
   */
  onProblem?: (message: string) => void;
  /**
   * A plain link that fails while asking for CORS is tried once more without.
   * Off for the living room, whose 3D screen can only show a CORS-readable video.
   */
  retryWithoutCors?: boolean;
  /** The room's choice for a Jellyfin film, and the hub's name for its shared conversion. */
  quality?: WatchQuality;
  session?: string;
}

interface MediaStreamInfo {
  Type?: string;
  Codec?: string;
  CodecTag?: string;
  Profile?: string;
  Level?: number;
  BitDepth?: number;
}
interface MediaSourceInfo { Id?: string; Container?: string; MediaStreams?: MediaStreamInfo[] }

export const UNPLAYABLE =
  "This video could not be played: the link may not allow other sites to use it, or it is not a video file.";

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/**
 * The exact codec string for a video stream, so the browser answers for this
 * file and not for its codec in general: plenty of browsers decode 8-bit HEVC
 * but not the 10-bit ("Main 10") most x265 releases use. Null: never direct.
 */
export function videoCodecString(stream: MediaStreamInfo): string | null {
  const codec = (stream.Codec || "").toLowerCase();
  const profile = (stream.Profile || "").toLowerCase();
  const level = stream.Level && stream.Level > 0 ? stream.Level : 0;
  if (codec === "h264") {
    if ((stream.BitDepth ?? 8) > 8 || /high 10|4:2:2|4:4:4/.test(profile)) return null;
    const idc = /baseline/.test(profile) ? "42" : /main/.test(profile) ? "4d" : "64";
    const constraint = /constrained/.test(profile) ? "e0" : "00";
    return `avc1.${idc}${constraint}${hex2(level || 40)}`;
  }
  if (codec === "hevc" || codec === "h265") {
    const tag = (stream.CodecTag || "").toLowerCase() === "hev1" ? "hev1" : "hvc1";
    const tenBit = (stream.BitDepth ?? 8) > 8 || /main 10/.test(profile);
    if (/rext|4:2:2|4:4:4/.test(profile)) return null;
    return tenBit ? `${tag}.2.4.L${level || 120}.B0` : `${tag}.1.6.L${level || 120}.B0`;
  }
  if (codec === "vp9") return (stream.BitDepth ?? 8) > 8 ? "vp09.02.10.10" : "vp09.00.10.08";
  if (codec === "av1") return (stream.BitDepth ?? 8) > 8 ? "av01.0.08M.10" : "av01.0.08M.08";
  return null;
}

const AUDIO_CODECS: Record<string, string> = {
  aac: "mp4a.40.2",
  mp3: "mp4a.69",
  opus: "opus",
  flac: "flac",
};

/**
 * Whether this browser says it can play the file exactly as Jellyfin stores
 * it. Only a confident "probably" counts; and even then playing it directly
 * falls back to a conversion if it fails (see attachWatchSource).
 */
export function canPlayDirectly(video: Pick<HTMLVideoElement, "canPlayType">, source: MediaSourceInfo): boolean {
  const container = (source.Container || "").toLowerCase();
  const mime = /\b(mp4|mov|m4v)\b/.test(container) ? "video/mp4" : /\bwebm\b/.test(container) ? "video/webm" : null;
  if (!mime) return false;
  const streams = source.MediaStreams || [];
  const videoStream = streams.find((s) => s.Type === "Video");
  const audioStream = streams.find((s) => s.Type === "Audio");
  const videoCodec = videoStream ? videoCodecString(videoStream) : "";
  if (videoCodec === null) return false;
  const audioCodec = audioStream ? AUDIO_CODECS[(audioStream.Codec || "").toLowerCase()] : "";
  if (audioCodec === undefined) return false;
  if (!videoCodec && !audioCodec) return false;
  const codecs = [videoCodec, audioCodec].filter(Boolean).join(", ");
  return video.canPlayType(`${mime}; codecs="${codecs}"`) === "probably";
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

/** One id per browser, so Jellyfin's dashboard shows a viewer as one device. */
function deviceId(): string {
  try {
    const saved = localStorage.getItem("huddle-jellyfin-device");
    if (saved) return saved;
    const id = `huddle-${randomId()}`;
    localStorage.setItem("huddle-jellyfin-device", id);
    return id;
  } catch {
    return `huddle-${randomId()}`;
  }
}

/** Jellyfin's HLS conversion of an item: H.264 + AAC stereo, up to 1080p. */
export function jellyfinHlsUrl(link: JellyfinLink, mediaSourceId: string, session: { playSessionId: string; deviceId: string }): string {
  const params = new URLSearchParams({
    api_key: link.apiKey,
    MediaSourceId: mediaSourceId,
    PlaySessionId: session.playSessionId,
    DeviceId: session.deviceId,
    VideoCodec: "h264",
    AudioCodec: "aac",
    TranscodingMaxAudioChannels: "2",
    SegmentContainer: "ts",
    VideoBitrate: "8000000",
    AudioBitrate: "192000",
    MaxWidth: "1920",
    MaxHeight: "1080",
  });
  return `${link.base}/Videos/${link.itemId}/master.m3u8?${params}`;
}

/** The file itself, with seeking, for a browser that can play it. */
export function jellyfinDirectUrl(link: JellyfinLink, mediaSourceId: string): string {
  const params = new URLSearchParams({ static: "true", MediaSourceId: mediaSourceId, api_key: link.apiKey });
  return `${link.base}/Videos/${link.itemId}/stream?${params}`;
}

const sourceCache = new Map<string, Promise<MediaSourceInfo | "refused" | null>>();

/** What Jellyfin says the film holds (asked once per film; the player and the subtitle menu share it). */
export function jellyfinSource(link: JellyfinLink): Promise<MediaSourceInfo | "refused" | null> {
  const key = `${link.base}|${link.itemId}|${link.apiKey}`;
  let pending = sourceCache.get(key);
  if (!pending) {
    pending = fetchJellyfinSource(link);
    sourceCache.set(key, pending);
    // A failed lookup may work next time.
    void pending.then((result) => { if (!result) sourceCache.delete(key); });
  }
  return pending;
}

async function fetchJellyfinSource(link: JellyfinLink): Promise<MediaSourceInfo | "refused" | null> {
  try {
    const response = await fetch(
      `${link.base}/Items/${link.itemId}/PlaybackInfo?api_key=${encodeURIComponent(link.apiKey)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    if (response.status === 401 || response.status === 403) return "refused";
    if (!response.ok) return null;
    const data = (await response.json()) as { MediaSources?: MediaSourceInfo[] };
    return data.MediaSources?.[0] ?? null;
  } catch {
    return null;
  }
}

/** The room's shared conversion, through this server. */
export function sharedConversionUrl(link: JellyfinLink, mediaSourceId: string, session: string, quality: "8" | "4"): string {
  const params = new URLSearchParams({ api_key: link.apiKey, MediaSourceId: mediaSourceId, b: link.base });
  return `${basePath}/api/watch/jellyfin/${link.itemId}/${session}/${quality}/master.m3u8?${params}`;
}

/**
 * Starts `url` playing in `video` and returns a function that stops it. Safe
 * to call again with a new link after that.
 *
 * Jellyfin films go down a ladder until one plays: the file itself (when the
 * room chose "original" and this browser says it can play it), the room's
 * shared conversion, and a conversion of this viewer's own as a last resort;
 * each HLS step is tried natively and then through hls.js. A step that errors,
 * or plays sound with no picture (a codec the browser only half supports),
 * moves on to the next.
 */
export function attachWatchSource(video: HTMLVideoElement, url: string, options: WatchSourceOptions = {}): () => void {
  let stopped = false;
  /** What to do when the current source fails; replaced at each step. */
  let onFail: () => void = () => options.onProblem?.(UNPLAYABLE);
  const onError = () => { if (!stopped) onFail(); };
  /** Sound but no picture: the browser could not decode the video track. */
  const onLoaded = () => {
    if (!stopped && video.videoWidth === 0 && video.videoHeight === 0) onFail();
  };
  video.addEventListener("error", onError);
  video.addEventListener("loadeddata", onLoaded);
  const unlisten = () => {
    video.removeEventListener("error", onError);
    video.removeEventListener("loadeddata", onLoaded);
  };

  const link = jellyfinLink(url);
  if (!link || link.needsKey) {
    let retried = false;
    onFail = () => {
      if (options.retryWithoutCors && !retried && video.crossOrigin) {
        // Asking for CORS lets a frame be read; a site that does not allow it still plays when asked plainly.
        retried = true;
        video.removeAttribute("crossorigin");
        video.src = url;
        return;
      }
      options.onProblem?.(UNPLAYABLE);
    };
    video.src = url;
    return () => {
      stopped = true;
      unlisten();
      video.removeAttribute("src");
      video.load();
    };
  }

  let hls: { destroy(): void } | null = null;
  /** A conversion of this viewer's own, stopped when they stop watching. */
  let ownSession: { playSessionId: string; deviceId: string } | null = null;
  /** Start where the room is rather than at the beginning (hls.js does this itself). */
  const seekOnLoad = () => {
    const at = options.startAt ?? 0;
    if (at <= 1) return;
    video.addEventListener("loadedmetadata", () => {
      if (!stopped && video.currentTime < at - 1) video.currentTime = at;
    }, { once: true });
  };
  const reset = () => {
    hls?.destroy();
    hls = null;
    video.removeAttribute("src");
    video.load();
  };

  /** Plays an HLS link natively if the browser can, else through hls.js; `next` when neither works. */
  const playHls = (hlsUrl: string, next: () => void) => {
    const viaHlsJs = async () => {
      onFail = next;
      reset();
      const { default: Hls } = await import("hls.js");
      if (stopped) return;
      if (!Hls.isSupported()) {
        next();
        return;
      }
      const player = new Hls({
        startPosition: options.startAt && options.startAt > 1 ? options.startAt : -1,
        maxBufferLength: 30,
      });
      let recoveries = 0;
      player.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || stopped) return;
        // A refused playlist is not worth retrying (another Jellyfin, or the key was turned down).
        const code = data.response?.code ?? 0;
        const refused = code >= 400 && code < 500;
        if (!refused && recoveries++ < 3) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) player.recoverMediaError();
          else player.startLoad();
          return;
        }
        next();
      });
      player.loadSource(hlsUrl);
      player.attachMedia(video);
      hls = player;
    };
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari, the iOS app and newer Chrome play HLS themselves.
      onFail = () => void viaHlsJs();
      reset();
      seekOnLoad();
      video.src = hlsUrl;
      return;
    }
    void viaHlsJs();
  };

  const ownConversion = (mediaSourceId: string) => {
    ownSession ??= { playSessionId: randomId(), deviceId: deviceId() };
    playHls(jellyfinHlsUrl(link, mediaSourceId, ownSession), () =>
      options.onProblem?.("Jellyfin could not convert this video for the browser."));
  };

  const sharedConversion = (mediaSourceId: string, quality: "8" | "4") => {
    if (!options.session) {
      ownConversion(mediaSourceId);
      return;
    }
    playHls(sharedConversionUrl(link, mediaSourceId, options.session, quality), () => ownConversion(mediaSourceId));
  };

  void (async () => {
    const source = await jellyfinSource(link);
    if (stopped) return;
    if (source === "refused") {
      options.onProblem?.("Jellyfin refused this link's access key. Copy a fresh stream link from Jellyfin.");
      return;
    }
    const mediaSourceId = source?.Id || link.itemId;
    const quality = options.quality;
    // "8"/"4": the room converts, whatever this browser could play. Otherwise
    // ("original", or nobody chose) the file itself when this browser can.
    if (quality !== "8" && quality !== "4" && source && canPlayDirectly(video, source)) {
      onFail = () => sharedConversion(mediaSourceId, "8");
      seekOnLoad();
      video.src = jellyfinDirectUrl(link, mediaSourceId);
      return;
    }
    sharedConversion(mediaSourceId, quality === "4" ? "4" : "8");
  })();

  return () => {
    stopped = true;
    unlisten();
    reset();
    if (ownSession) {
      // Frees this viewer's own conversion rather than waiting for it to time out.
      // The shared one is the hub's to stop (when the film changes or the party ends).
      const params = new URLSearchParams({ DeviceId: ownSession.deviceId, PlaySessionId: ownSession.playSessionId, api_key: link.apiKey });
      void fetch(`${link.base}/Videos/ActiveEncodings?${params}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
    }
  };
}
