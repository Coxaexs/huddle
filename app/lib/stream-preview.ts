"use client";

/**
 * Stream preview and periodic snapshot manager.
 * Captures a 16:9 preview frame from active streams/screenshares every 2 minutes
 * and exposes them for the Voice Stage grid preview and sidebar hover cards.
 */

export interface StreamPreviewData {
  key: string;
  title: string;
  streamerName: string;
  snapshotUrl: string | null;
  startedAt: number;
  updatedAt: number;
  channelId?: string;
  isGame?: boolean;
}

const PREVIEW_STORE = new Map<string, StreamPreviewData>();
const LISTENERS = new Set<() => void>();

function notify() {
  for (const listener of LISTENERS) {
    try {
      listener();
    } catch {
      // Ignore listener error
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

export function getAllStreamPreviews(): StreamPreviewData[] {
  return Array.from(PREVIEW_STORE.values());
}

export function setStreamPreview(data: StreamPreviewData): void {
  PREVIEW_STORE.set(data.key, data);
  notify();
}

export function removeStreamPreview(key: string): void {
  if (PREVIEW_STORE.delete(key)) {
    notify();
  }
}

/**
 * Grabs a snapshot frame from an HTML video element onto an offscreen canvas.
 * Returns a compact JPEG data URL (~15-30 KB) or null if video is not ready.
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
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    // Cross-origin restrictions might prevent canvas extraction without CORS
    return null;
  }
}

/** 2 minutes snapshot interval */
export const SNAPSHOT_INTERVAL_MS = 2 * 60 * 1000;
