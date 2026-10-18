"use client";

/**
 * Preview frames for the "Streaming Now" hover card.
 *
 * The streamer's own app grabs a small JPEG of its screen share every two
 * minutes and hands it to the hub (see use-voice). Anyone who hovers the
 * streamer asks the hub for the latest one, so the card has a picture even for
 * people in another room who are not receiving the video at all.
 */

export interface StreamPreviewData {
  /** The streamer's connection id. */
  key: string;
  title: string | null;
  snapshotUrl: string | null;
  /** When the hub got this frame (hub clock ms); 0 when there is none yet. */
  updatedAt: number;
}

/** How often a streamer sends a new frame. */
export const SNAPSHOT_INTERVAL_MS = 2 * 60 * 1000;
/** A hover asks the hub again only when its copy is older than this. */
const REFRESH_AFTER_MS = 30_000;

const PREVIEW_STORE = new Map<string, StreamPreviewData>();
const ASKED_AT = new Map<string, number>();
const LISTENERS = new Set<() => void>();

function notify() {
  for (const listener of LISTENERS) {
    try {
      listener();
    } catch {
      // One broken listener must not stop the rest.
    }
  }
}

export function subscribeStreamPreviews(onChange: () => void): () => void {
  LISTENERS.add(onChange);
  return () => {
    LISTENERS.delete(onChange);
  };
}

export function getStreamPreview(key: string): StreamPreviewData | null {
  return PREVIEW_STORE.get(key) || null;
}

export function setStreamPreview(data: StreamPreviewData): void {
  PREVIEW_STORE.set(data.key, data);
  notify();
}

export function removeStreamPreview(key: string): void {
  ASKED_AT.delete(key);
  if (PREVIEW_STORE.delete(key)) notify();
}

/** Forgets every preview whose streamer is no longer sharing. */
export function pruneStreamPreviews(live: Set<string>): void {
  let changed = false;
  for (const key of PREVIEW_STORE.keys()) {
    if (!live.has(key)) {
      PREVIEW_STORE.delete(key);
      ASKED_AT.delete(key);
      changed = true;
    }
  }
  if (changed) notify();
}

/** Asks the hub for a streamer's latest frame, unless one was asked for recently. */
export function requestStreamPreview(
  connectionId: string,
  send: (event: { t: "stream-preview-get"; connectionId: string }) => void,
): void {
  const now = Date.now();
  if (now - (ASKED_AT.get(connectionId) ?? 0) < REFRESH_AFTER_MS) return;
  ASKED_AT.set(connectionId, now);
  send({ t: "stream-preview-get", connectionId });
}

/** The hub's answer to requestStreamPreview (dispatched by use-hub). */
export const STREAM_PREVIEW_EVENT = "huddle-stream-preview";

if (typeof window !== "undefined") {
  window.addEventListener(STREAM_PREVIEW_EVENT, (event) => {
    const detail = (event as CustomEvent<{ connectionId: string; image: string | null; title: string | null; at: number }>).detail;
    if (!detail?.connectionId) return;
    const old = PREVIEW_STORE.get(detail.connectionId);
    // A frame we already have (or a newer local one) wins over "none yet".
    if (!detail.image && old?.snapshotUrl) return;
    setStreamPreview({
      key: detail.connectionId,
      title: detail.title,
      snapshotUrl: detail.image,
      updatedAt: detail.at,
    });
  });
}

/**
 * Grabs a frame from a video element onto a 320×180 canvas, letterboxed.
 * Returns a compact JPEG data URL (~15-30 KB) or null if there is no picture
 * yet or the video's origin does not allow reading it.
 */
export function captureVideoSnapshot(video: HTMLVideoElement): string | null {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const w = video.videoWidth * scale;
    const h = video.videoHeight * scale;
    ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

/**
 * Captures preview frames of your own screen share: one shortly after it
 * starts, then every SNAPSHOT_INTERVAL_MS. Returns a stop function.
 */
export function startScreenPreviewCapture(
  stream: MediaStream,
  onFrame: (image: string, title: string | null) => void,
): () => void {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream(stream.getVideoTracks());
  void video.play().catch(() => undefined);
  const track = stream.getVideoTracks()[0];
  // Chromium labels a window share with the window's title; a whole screen is just "screen:0:0".
  const label = track?.label?.trim() ?? "";
  const title = label && !/^(screen|window|web-contents-media-stream):/i.test(label) && !/^(screen|entire screen)\b/i.test(label)
    ? label.slice(0, 80)
    : null;
  const snap = () => {
    const image = captureVideoSnapshot(video);
    if (image) onFrame(image, title);
  };
  const first = window.setTimeout(snap, 2500);
  const interval = window.setInterval(snap, SNAPSHOT_INTERVAL_MS);
  return () => {
    window.clearTimeout(first);
    window.clearInterval(interval);
    video.pause();
    video.srcObject = null;
  };
}
