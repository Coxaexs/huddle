"use client";

/** Huddle is mounted under /hangout, so every request needs the prefix. */
export const basePath = "/hangout";

export const apiUrl = (path: string) => `${basePath}${path}`;

/** How long a request keeps retrying while the server restarts behind the proxy. */
const RESTART_RETRY_MS = 30_000;

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const request = () =>
    fetch(apiUrl(path), {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init?.headers,
      },
    });

  const giveUpAt = Date.now() + RESTART_RETRY_MS;
  let response = await request();
  let data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  // While Hoffle restarts (a deploy), the reverse proxy answers 502, or a
  // bare 503, without the request ever reaching the app, so sending it again
  // cannot double a message. Not 504: that request may have arrived. Hoffle's
  // own 502s and 503s carry an error and are final.
  // Only reads are retried. A POST that reached the server before the proxy
  // gave up would otherwise run twice (a message sent twice after a deploy).
  const method = (init?.method || "GET").toUpperCase();
  const retryable = method === "GET" || method === "HEAD";
  while (
    retryable &&
    (response.status === 502 || response.status === 503) &&
    !data?.error &&
    Date.now() < giveUpAt
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    response = await request();
    data = (await response.json().catch(() => ({}))) as T & { error?: string };
  }
  if (!response.ok) {
    // A 413 from the reverse proxy is an HTML page, not our JSON, so it would
    // otherwise surface as a bare status code.
    if (response.status === 413 && !data?.error) {
      throw new Error(
        "That file is too large to upload. Try a smaller one.",
      );
    }
    throw new Error(data?.error || `Request failed (${response.status}).`);
  }
  return data;
}

export function clockTime(date = new Date()): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "--:--";
  }
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}
