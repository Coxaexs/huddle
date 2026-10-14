/**
 * State a voice room's living room shares: the film everyone is watching, the
 * initiative order, who the game master is, the card floating over the table
 * and each player's character. The hub keeps it for the life of the call and
 * checks its shape (sanitize), so a client can only ever store these.
 */

export type LoungeSharedKey = "watch" | "initiative" | "gm" | "card" | "character" | "hiddenroll" | "house" | "tablemap";

/** A video everyone watches in step. `position` is seconds into it at hub time `at`. */
export interface WatchState {
  url: string;
  title: string;
  position: number;
  /** Hub clock (ms) when `position` was true; the hub stamps it. */
  at: number;
  paused: boolean;
  by: string;
}

/** The cinema's house lights, set from the projection booth: automatic (dim while a film plays) or held at a level. */
export interface HouseLights {
  /** 0..1, used when `auto` is off. */
  level: number;
  auto: boolean;
  /** Hub clock (ms) when it was set; the hub stamps it. */
  at: number;
  by: string;
}

export interface InitiativeEntry {
  id: string;
  name: string;
  value: number;
  /** The seat this entry belongs to, so its chair gets the turn marker; absent for a monster. */
  connectionId?: string;
}

export interface Initiative {
  /** Highest first. */
  entries: InitiativeEntry[];
  /** Index into entries of whose turn it is. */
  turn: number;
  round: number;
}

export interface GameMaster { connectionId: string; name: string }

/** A spell, monster or item floating over the table. */
export interface TableCard {
  title: string;
  subtitle: string;
  facts: Array<{ label: string; value: string }>;
  body: string;
  /** Hub clock (ms) when it was put up; the hub stamps it. */
  at: number;
  by: string;
}

export interface TableCharacter { name: string; portraitUrl: string | null }

/**
 * The battle map on the tabletop, in place of the drawn one: an image uploaded
 * to this server, turned in quarter turns and zoomed into the round table.
 * Only the game master may change it while there is one (the hub checks).
 */
export interface TableMap {
  url: string;
  /** Quarter turns clockwise, 0-3. */
  turns: number;
  /** 1 fills the table; more shows less of the image, larger. */
  zoom: number;
  by: string;
  /** Hub clock (ms) when it was put up; the hub stamps it. */
  at: number;
}

/** Someone rolled behind the screen: everyone sees dice land there, but never the faces. */
export interface HiddenRoll { by: string; dice: Array<{ sides: number; count: number }>; seed: string }

const str = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");
const num = (value: unknown, min: number, max: number, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

/** Where a shared video or portrait may load from: https links, or this server's own uploads. */
export function safeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 600) return null;
  if (/^\/hangout\/api\/uploads\/[\w%.\-]+$/.test(value)) return value;
  // Videos the server downloaded with yt-dlp (the id is YouTube's 11 characters).
  if (/^\/hangout\/api\/youtube\/stream\/[\w\-]{11}\.mp4$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Cleans a value a client sent for `key` into exactly the shape it should
 * have, or null when it is nothing usable. `by` is who sent it (a name the hub
 * knows) and `now` the hub clock; both are the hub's, never the client's.
 */
export function sanitizeShared(key: LoungeSharedKey, raw: unknown, by: string, now: number): unknown | null {
  if (raw === null || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  switch (key) {
    case "watch": {
      const url = safeMediaUrl(value.url);
      if (!url) return null;
      return {
        url,
        title: str(value.title, 100),
        position: num(value.position, 0, 60 * 60 * 24),
        at: now,
        paused: value.paused === true,
        by,
      } satisfies WatchState;
    }
    case "house":
      return { level: num(value.level, 0, 1, 1), auto: value.auto !== false, at: now, by } satisfies HouseLights;
    case "initiative": {
      const entries = (Array.isArray(value.entries) ? value.entries : []).slice(0, 30).flatMap((entry): InitiativeEntry[] => {
        if (!entry || typeof entry !== "object") return [];
        const e = entry as Record<string, unknown>;
        const name = str(e.name, 40).trim();
        if (!name) return [];
        const connectionId = str(e.connectionId, 64);
        return [{ id: str(e.id, 24) || name, name, value: num(e.value, -99, 999), ...(connectionId ? { connectionId } : {}) }];
      });
      if (!entries.length) return null;
      return {
        entries,
        turn: Math.floor(num(value.turn, 0, entries.length - 1)),
        round: Math.floor(num(value.round, 1, 9999, 1)),
      } satisfies Initiative;
    }
    case "gm": {
      const connectionId = str(value.connectionId, 64);
      return connectionId ? ({ connectionId, name: str(value.name, 40) } satisfies GameMaster) : null;
    }
    case "card": {
      const title = str(value.title, 80).trim();
      if (!title) return null;
      const facts = (Array.isArray(value.facts) ? value.facts : []).slice(0, 8).flatMap((fact) => {
        if (!fact || typeof fact !== "object") return [];
        const f = fact as Record<string, unknown>;
        const label = str(f.label, 30);
        const text = str(f.value, 80);
        return label && text ? [{ label, value: text }] : [];
      });
      return { title, subtitle: str(value.subtitle, 120), facts, body: str(value.body, 900), at: now, by } satisfies TableCard;
    }
    case "character": {
      const name = str(value.name, 40).trim();
      if (!name) return null;
      return { name, portraitUrl: safeMediaUrl(value.portraitUrl) } satisfies TableCharacter;
    }
    case "tablemap": {
      // Only this server's own uploads: an image from elsewhere would taint the table's WebGL texture.
      const url = safeMediaUrl(value.url);
      if (!url || !url.startsWith("/hangout/api/uploads/")) return null;
      return {
        url,
        turns: Math.floor(num(value.turns, 0, 3)),
        zoom: Math.round(num(value.zoom, 1, 4, 1) * 100) / 100,
        by,
        at: now,
      } satisfies TableMap;
    }
    case "hiddenroll": {
      const dice = (Array.isArray(value.dice) ? value.dice : []).slice(0, 12).flatMap((die) => {
        if (!die || typeof die !== "object") return [];
        const d = die as Record<string, unknown>;
        const sides = Math.floor(num(d.sides, 2, 100, 0));
        const count = Math.floor(num(d.count, 1, 12, 1));
        return sides >= 2 ? [{ sides, count }] : [];
      });
      return dice.length ? ({ by, dice, seed: str(value.seed, 40) || String(now) } satisfies HiddenRoll) : null;
    }
  }
}

/** Seconds into a shared video right now, given the hub clock. */
export function watchPosition(watch: WatchState, hubNow: number): number {
  return watch.paused ? watch.position : watch.position + Math.max(0, hubNow - watch.at) / 1000;
}

/** "Row 4, seat 7" for a cinema seat id (cin-3-6), or null. */
export function cinemaSeatLabel(id: string | null | undefined): string | null {
  const match = /^cin-(\d+)-(\d+)$/.exec(id ?? "");
  return match ? `Row ${Number(match[1]) + 1}, seat ${Number(match[2]) + 1}` : null;
}

/* ---------- initiative ---------- */

/** The entry whose turn it is, if any. */
export const currentEntry = (init: Initiative | null): InitiativeEntry | null => (init ? init.entries[init.turn] ?? null : null);

/**
 * Puts an entry in the order, highest first (a tie keeps whoever was there
 * first), and keeps the turn on whoever's it was. A seat already in the order
 * has its entry replaced rather than added twice.
 */
export function addInitiative(init: Initiative | null, entry: InitiativeEntry): Initiative {
  const holder = currentEntry(init)?.id;
  const rest = (init?.entries ?? []).filter((e) => e.id !== entry.id && !(entry.connectionId && e.connectionId === entry.connectionId));
  const index = rest.findIndex((e) => e.value < entry.value);
  const entries = [...rest.slice(0, index < 0 ? rest.length : index), entry, ...rest.slice(index < 0 ? rest.length : index)];
  const turn = holder ? Math.max(0, entries.findIndex((e) => e.id === holder)) : 0;
  return { entries, turn, round: init?.round ?? 1 };
}

/** Takes an entry out, keeping the turn where it was (or on the next one if it was theirs). */
export function removeInitiative(init: Initiative, id: string): Initiative | null {
  const at = init.entries.findIndex((e) => e.id === id);
  if (at < 0) return init;
  const entries = init.entries.filter((e) => e.id !== id);
  if (!entries.length) return null;
  let turn = init.turn;
  if (at < turn) turn -= 1;
  return { entries, turn: Math.min(turn, entries.length - 1), round: init.round };
}

/** The next turn (or the last, with -1); going round the end of the order starts a new round. */
export function stepTurn(init: Initiative, direction: 1 | -1 = 1): Initiative {
  const count = init.entries.length;
  const raw = init.turn + direction;
  if (raw >= count) return { ...init, turn: 0, round: init.round + 1 };
  if (raw < 0) return { ...init, turn: count - 1, round: Math.max(1, init.round - 1) };
  return { ...init, turn: raw };
}
