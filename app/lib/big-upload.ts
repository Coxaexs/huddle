"use client";

import { apiFetch, apiUrl } from "./client";

/** Whether this account may send files over 40 MB (lib/big-uploads.ts). */
export interface BigUploadStatus {
  allowed: boolean;
  maxBytes: number;
  partBytes: number;
  lifetimeMs: number;
}

let status: Promise<BigUploadStatus> | null = null;

/** Asked once per page load; an admin's change shows after a reload. */
export function bigUploadStatus(): Promise<BigUploadStatus> {
  if (!status) {
    status = apiFetch<BigUploadStatus>("/api/uploads/big").catch((error) => {
      status = null;
      throw error;
    });
  }
  return status;
}

/** PUTs one part, reporting bytes as they leave so the progress moves inside a part. */
function sendPart(
  key: string,
  partNumber: number,
  blob: Blob,
  onBytes: (sent: number) => void,
): Promise<{ partNumber: number; etag: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", apiUrl(`/api/uploads/big?key=${encodeURIComponent(key)}&part=${partNumber}`));
    xhr.upload.onprogress = (event) => onBytes(event.loaded);
    xhr.onload = () => {
      let data: { partNumber?: number; etag?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // A proxy error page.
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.etag) {
        resolve({ partNumber, etag: data.etag });
      } else {
        const error = new Error(data.error || `Upload failed (${xhr.status}).`) as Error & { status?: number };
        error.status = xhr.status;
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("The connection dropped during the upload."));
    xhr.send(blob);
  });
}

/**
 * Sends a file up to 2 GB in parts and returns its upload key. Each part is
 * retried a few times, so a short drop (or a deploy restarting Hoffle) does
 * not throw away the parts already sent.
 */
export async function uploadBigFile(file: File, onProgress: (sent: number, total: number) => void): Promise<string> {
  const start = await apiFetch<{ key: string; partBytes: number; parts: number }>("/api/uploads/big", {
    method: "POST",
    body: JSON.stringify({ action: "start", name: file.name, size: file.size }),
  });
  const done: Array<{ partNumber: number; etag: string }> = [];
  let finished = 0;
  try {
    for (let partNumber = 1; partNumber <= start.parts; partNumber++) {
      const from = (partNumber - 1) * start.partBytes;
      const blob = file.slice(from, Math.min(file.size, from + start.partBytes));
      for (let attempt = 1; ; attempt++) {
        try {
          done.push(await sendPart(start.key, partNumber, blob, (sent) => onProgress(finished + sent, file.size)));
          break;
        } catch (error) {
          const code = (error as { status?: number }).status ?? 0;
          // 4xx from Hoffle itself (expired, not allowed, bad part) won't get better.
          if (attempt >= 5 || (code >= 400 && code < 500 && code !== 408 && code !== 429)) throw error;
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        }
      }
      finished += blob.size;
      onProgress(finished, file.size);
    }
    await apiFetch("/api/uploads/big", {
      method: "POST",
      body: JSON.stringify({ action: "complete", key: start.key, parts: done }),
    });
  } catch (error) {
    // Free the budget now rather than when the sweep finds it stalled.
    void apiFetch("/api/uploads/big", {
      method: "POST",
      body: JSON.stringify({ action: "abort", key: start.key }),
    }).catch(() => undefined);
    throw error;
  }
  return start.key;
}
