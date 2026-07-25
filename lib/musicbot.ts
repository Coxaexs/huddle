/**
 * Talking to the music bot's dashboard API.
 *
 * Huddle plays music itself, but the bot still owns things Huddle has no copy
 * of — the lyrics database, the Discord voice connection, listening history —
 * so those commands are proxied here with the dashboard password.
 */

import { bindings } from "./storage";

export function baseUrl(): URL {
  return new URL(
    bindings().MUSICWATCH_BASE_URL?.trim() || "https://deeppixel.online",
  );
}

/** Logs into the dashboard and returns its session cookie. */
export async function botSession(): Promise<string> {
  const password = bindings().MUSICWATCH_PASSWORD;
  if (!password) throw new Error("Music dashboard access is not configured.");

  const response = await fetch(new URL("/api/session", baseUrl()), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error("Music dashboard login failed.");

  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Music dashboard returned no session.");
  return cookie;
}

export async function botFetch(
  path: string,
  cookie: string,
  init?: RequestInit,
): Promise<Record<string, any>> {
  const response = await fetch(new URL(path, baseUrl()), {
    ...init,
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  const raw = await response.text();
  let data: Record<string, any> = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = {};
  }

  if (!response.ok) {
    const detail =
      typeof data.error === "string" && data.error.trim()
        ? data.error
        : raw.trim() || `Music bot returned ${response.status}.`;
    throw new Error(detail);
  }
  return data;
}

export interface Lyrics {
  track: string | null;
  artist?: string | null;
  /** [seconds, text] pairs when the source has timings. */
  lines: Array<[number, string]>;
  lyrics?: string | null;
  synced?: boolean;
}

/** Lyrics for any track, not only whatever Discord is playing. */
export async function fetchLyrics(
  title: string,
  artist?: string | null,
  duration?: number | null,
): Promise<Lyrics> {
  const cookie = await botSession();
  const params = new URLSearchParams({ q: title });
  if (artist) params.set("artist", artist);
  if (duration) params.set("duration", String(Math.round(duration)));
  const data = await botFetch(`/api/lyrics/search?${params}`, cookie);
  return {
    track: (data.track as string) || null,
    artist: (data.artist as string) || null,
    lines: (data.lines || []) as Array<[number, string]>,
    lyrics: (data.lyrics as string) || null,
    synced: Boolean(data.synced),
  };
}

/** The line that should be on screen at this moment. */
export function lineAt(lines: Array<[number, string]>, seconds: number): string {
  let current = "";
  for (const [at, text] of lines) {
    if (at <= seconds) current = text;
    else break;
  }
  return current;
}
