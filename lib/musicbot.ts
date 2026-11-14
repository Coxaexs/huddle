/**
 * Talking to the music bot's dashboard API.
 *
 * Huddle plays music itself, but the bot still owns things Huddle has no copy
 * of — the lyrics database, the Discord voice connection, listening history —
 * so those commands are proxied here. With MUSICWATCH_BOT_KEY set they use that
 * key, which only opens what Hoffle needs; without it, the dashboard password.
 */

import { bindings } from "./storage";

export function baseUrl(): URL {
  return new URL(
    bindings().MUSICWATCH_BASE_URL?.trim() || "https://deeppixel.online",
  );
}

function botKey(): string {
  return bindings().MUSICWATCH_BOT_KEY?.trim() || "";
}

let session: { cookie: string; until: number } | null = null;
let signingIn: Promise<string> | null = null;

async function signIn(): Promise<string> {
  const password = bindings().MUSICWATCH_PASSWORD;
  if (!password) throw new Error("Music dashboard access is not configured.");

  const response = await fetch(new URL("/api/session", baseUrl()), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (response.status === 429) {
    throw new Error("Music dashboard is rate-limiting logins; try again in a minute.");
  }
  if (!response.ok) throw new Error("Music dashboard login failed.");

  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Music dashboard returned no session.");
  return cookie;
}

/**
 * The dashboard session cookie. The bot allows only a few logins every few
 * minutes, so one session is reused (and shared by concurrent callers)
 * instead of logging in for every command.
 */
export async function botSession(): Promise<string> {
  if (botKey()) return "";
  if (session && session.until > Date.now()) return session.cookie;
  signingIn ??= signIn()
    .then((cookie) => {
      session = { cookie, until: Date.now() + 6 * 3600_000 };
      return cookie;
    })
    .finally(() => {
      signingIn = null;
    });
  return signingIn;
}

/** The bot's own answer to a request it refused, with its status. */
export class BotError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function botFetch(
  path: string,
  cookie: string,
  init?: RequestInit,
): Promise<Record<string, any>> {
  const key = botKey();
  const send = (cookieValue: string) =>
    fetch(new URL(path, baseUrl()), {
      ...init,
      headers: {
        Accept: "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : { Cookie: cookieValue }),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  let response = await send(cookie);
  if (response.status === 401 && session?.cookie === cookie) {
    // The bot forgot the session (a restart, an expiry): sign in once more.
    session = null;
    response = await send(await botSession());
  }

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
    throw new BotError(detail, response.status);
  }
  return data;
}

/** Transport controls the DJ booth takes over while it is on air ("skip" = mix into the next song, "stop" = end the set). */
export type DjControl = "skip" | "pause" | "resume" | "stop";

/**
 * Send a transport control to a Hoffle room's DJ booth on the bot. While the
 * booth is on air the room's own player is parked, so play/pause/skip have to
 * reach the booth instead.
 */
export async function djControl(channelId: string, op: DjControl): Promise<Record<string, any>> {
  return botFetch(
    `/api/guilds/${encodeURIComponent(`huddle:${channelId}`)}/dj`,
    await botSession(),
    { method: "POST", body: JSON.stringify({ op }) },
  );
}

export interface Lyrics {
  track: string | null;
  artist?: string | null;
  /** [seconds, text] pairs when the source has timings. */
  lines: Array<[number, string]>;
  lyrics?: string | null;
  synced?: boolean;
  /** Matched by song name only (the artist did not line up). */
  loose?: boolean;
  /** "musixmatch" when the bot had to ask Musixmatch. */
  source?: string | null;
  /** Musixmatch only had a cut this many seconds long. */
  versionLength?: number | null;
  /** Musixmatch was already asked about this song (nothing more to find there). */
  musixmatchChecked?: boolean;
  /** A page about these lyrics where they came from (lrclib or Musixmatch). */
  sourceUrl?: string | null;
  /** Someone in this server picked them by hand ("Wrong lyrics?"). */
  picked?: boolean;
  /** lrclib did not answer, so nothing was looked up (no Musixmatch request either). */
  unavailable?: boolean;
  /**
   * Per line of `lines`, when each word is sung: [start s, end s, word, [ms each letter ends, from the
   * word's start]]. Timed on the song's own vocal stem (the bot's words.py), so only for songs with
   * stems, and only once that song has been timed; otherwise absent.
   */
  words?: TimedWord[][] | null;
}

export type TimedWord = [number | null, number | null, string, number[]];

/**
 * Lyrics for any track, not only whatever Discord is playing.
 *
 * `musixmatch` lets the bot fall back to Musixmatch when lrclib has no synced
 * lyrics. That plan has about 300 requests a month, so only /lyricsnow for
 * the song that is playing (and the player's "Find synced lyrics" button)
 * sets it; the bot caches every answer. "cached" reads those answers only,
 * which costs nothing.
 */
export async function fetchLyrics(
  title: string,
  artist?: string | null,
  duration?: number | null,
  options: {
    musixmatch?: boolean | "cached";
    cachedOnly?: boolean;
    pickScope?: string | null;
    /** The track's page URL and query: lets the bot find its stems and add timed words. */
    keys?: Array<string | null | undefined>;
  } = {},
): Promise<Lyrics> {
  const cookie = await botSession();
  const params = new URLSearchParams({ q: title });
  if (artist) params.set("artist", artist);
  if (duration) params.set("duration", String(Math.round(duration)));
  if (options.musixmatch) params.set("musixmatch", options.musixmatch === "cached" ? "cached" : "1");
  // Only lyrics already saved: nothing is looked up (the music player).
  if (options.cachedOnly) params.set("cached_only", "1");
  // Lyrics someone in this Hoffle server picked by hand win (see pickLyrics).
  if (options.pickScope) params.set("pick_scope", options.pickScope);
  for (const key of options.keys ?? []) if (key) params.append("key", key);
  const data = await botFetch(`/api/lyrics/search?${params}`, cookie);
  return {
    track: (data.track as string) || null,
    artist: (data.artist as string) || null,
    lines: (data.lines || []) as Array<[number, string]>,
    lyrics: (data.lyrics as string) || null,
    synced: Boolean(data.synced),
    loose: Boolean(data.loose),
    source: (data.source as string) || null,
    versionLength: Number(data.version_length) || null,
    musixmatchChecked: Boolean(data.musixmatch_checked),
    sourceUrl: typeof data.source_url === "string" ? data.source_url : null,
    picked: Boolean(data.picked),
    unavailable: Boolean(data.lrclib_down),
    words: Array.isArray(data.words) ? (data.words as TimedWord[][]) : null,
  };
}

export interface LyricsCandidate {
  /** lrclib's id for these lyrics. */
  id: number;
  track: string;
  artist: string;
  album: string | null;
  duration: number | null;
  synced: boolean;
  /** The first few lines, to recognise the song by. */
  snippet: string[];
  url: string;
}

/** What Musixmatch would be asked from the picker, and its answer once it has one. */
export interface MusixmatchOffer {
  track: string;
  artist: string | null;
  /** Musixmatch was asked about it already. */
  answered: boolean;
  candidate: {
    track: string;
    artist: string;
    duration: number | null;
    synced: boolean;
    snippet: string[];
    url: string;
  } | null;
  /** Requests that may still go out now. */
  left: number;
}

/** lrclib entries that could be this song (or `query`), for "Wrong lyrics?". */
export async function lyricsCandidates(
  title: string,
  artist?: string | null,
  duration?: number | null,
  query?: string,
): Promise<{ query: string; candidates: LyricsCandidate[]; musixmatch: MusixmatchOffer | null }> {
  const params = new URLSearchParams({ title });
  if (artist) params.set("artist", artist);
  if (duration) params.set("duration", String(Math.round(duration)));
  if (query) params.set("q", query);
  const data = await botFetch(`/api/lyrics/candidates?${params}`, await botSession());
  return {
    query: String(data.query || ""),
    candidates: ((data.candidates || []) as LyricsCandidate[]).slice(0, 5),
    musixmatch: (data.musixmatch as MusixmatchOffer) || null,
  };
}

/**
 * The picker's "Ask Musixmatch": may spend one request (never twice for a
 * song). `query` written "Artist - Song" asks about that instead.
 */
export async function askMusixmatch(
  title: string,
  artist?: string | null,
  duration?: number | null,
  query?: string,
): Promise<MusixmatchOffer | null> {
  const data = await botFetch("/api/lyrics/ask-musixmatch", await botSession(), {
    method: "POST",
    body: JSON.stringify({ title, artist: artist || null, duration: duration || null, q: query || "" }),
  });
  return (data.musixmatch as MusixmatchOffer) || null;
}

/**
 * Saves the lyrics someone picked (an lrclib id) for a song in one Hoffle
 * server, or forgets the pick with `lrclibId: null` (then answers null).
 */
export async function pickLyrics(pick: {
  title: string;
  artist?: string | null;
  duration?: number | null;
  scope: string;
  lrclibId: number | null;
  /** Musixmatch's answer (asked before) instead of an lrclib entry. */
  musixmatch?: { track: string; artist: string | null } | null;
  by: string;
}): Promise<Lyrics | null> {
  const data = await botFetch("/api/lyrics/pick", await botSession(), {
    method: "POST",
    body: JSON.stringify({
      title: pick.title,
      artist: pick.artist || null,
      duration: pick.duration || null,
      scope: pick.scope,
      lrclib_id: pick.lrclibId,
      musixmatch: pick.musixmatch || null,
      by: pick.by,
    }),
  });
  if (data.cleared) return null;
  return {
    track: (data.track as string) || null,
    artist: (data.artist as string) || null,
    lines: (data.lines || []) as Array<[number, string]>,
    lyrics: (data.lyrics as string) || null,
    synced: Boolean(data.synced),
    loose: false,
    source: (data.source as string) || null,
    sourceUrl: typeof data.source_url === "string" ? data.source_url : null,
    picked: true,
  };
}

export interface SongResult {
  title: string;
  artist: string;
  /** Seconds, when known. */
  duration: number | null;
  thumbnail: string | null;
  /** What /play gets when this one is picked. */
  url: string;
  /** Its lyrics light up word by word. */
  words?: boolean;
}

/** Several YouTube matches for the full-screen player's search. */
export async function searchSongs(query: string): Promise<SongResult[]> {
  const data = await botFetch(
    `/api/huddle/search?${new URLSearchParams({ q: query })}`,
    await botSession(),
  );
  return ((data.results || []) as Array<Record<string, unknown>>)
    .filter((item) => typeof item.url === "string" && /^https?:\/\//.test(item.url))
    .slice(0, 10)
    .map((item) => ({
      title: String(item.title || "Unknown"),
      artist: String(item.artist || ""),
      duration: Number(item.duration) || null,
      thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : null,
      url: item.url as string,
      // Its lyrics light up word by word (the bot's words.py: timed on Oracle, or another upload's, shifted).
      ...(item.words === true ? { words: true } : {}),
    }));
}

export interface RoomPlaylist {
  name: string;
  count: number;
  cover: string | null;
  description: string | null;
  /** Kept by the bot for every room ("Stemmed songs", the day's stem mixes). */
  auto: boolean;
  /** The person asking may add songs: they made it, or they are an admin. */
  canEdit: boolean;
  tracks: Array<{ title: string; duration: string | null; thumbnail: string | null }>;
}

/** The person behind a playlist request; the bot decides what they may change. */
export interface PlaylistActor {
  id: string;
  admin: boolean;
}

const roomGuild = (channelId: string) => encodeURIComponent(`huddle:${channelId}`);

function playlistsFrom(data: Record<string, any>): RoomPlaylist[] {
  return ((data.playlists || []) as Array<Record<string, any>>).map((item) => ({
    name: String(item.name || ""),
    count: Number(item.count) || 0,
    cover: typeof item.cover === "string" ? item.cover : null,
    description: typeof item.description === "string" ? item.description : null,
    auto: Boolean(item.auto),
    canEdit: Boolean(item.can_edit) && !item.auto,
    tracks: ((item.tracks || []) as Array<Record<string, any>>).slice(0, 200).map((track) => ({
      title: String(track.title || "Unknown"),
      duration: track.duration && track.duration !== "Unknown" ? String(track.duration) : null,
      thumbnail: typeof track.thumbnail === "string" ? track.thumbnail : null,
    })),
  })).filter((item) => item.name);
}

/** A voice room's saved playlists on the bot: its own, shared and everywhere ones. */
export async function roomPlaylists(channelId: string, actor: PlaylistActor): Promise<RoomPlaylist[]> {
  const params = new URLSearchParams({ by: actor.id });
  if (actor.admin) params.set("admin", "1");
  return playlistsFrom(
    await botFetch(`/api/guilds/${roomGuild(channelId)}/playlists?${params}`, await botSession()),
  );
}

/** Makes a playlist in the room, or adds a song to one, as this person. */
export async function changeRoomPlaylist(
  channelId: string,
  actor: PlaylistActor,
  change: { action: "create"; name: string } | { action: "add_song"; name: string; query: string },
): Promise<{ message: string; playlists: RoomPlaylist[] }> {
  const data = await botFetch(`/api/guilds/${roomGuild(channelId)}/playlists`, await botSession(), {
    method: "POST",
    body: JSON.stringify({ ...change, by: actor.id, admin: actor.admin }),
  });
  return { message: String(data.message || "Done."), playlists: playlistsFrom(data) };
}

/** Plays a saved playlist in the room ("play" replaces what is on, "load" queues it). */
export async function playRoomPlaylist(
  channelId: string,
  name: string,
  action: "play" | "load",
  start = 0,
  startTitle?: string,
): Promise<string> {
  const data = await botFetch(`/api/guilds/${roomGuild(channelId)}/playlists`, await botSession(), {
    method: "POST",
    body: JSON.stringify({ action, name, start, start_title: startTitle }),
  });
  return String(data.message || (action === "play" ? `Playing ${name}.` : `Added ${name}.`));
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
