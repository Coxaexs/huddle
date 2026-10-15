/**
 * State a voice room's living room shares: the film everyone is watching, the
 * initiative order, who the game master is, the card floating over the table,
 * each player's character and the pawns stood on the map. The hub keeps it
 * for the life of the call and checks its shape (sanitize), so a client can
 * only ever store these.
 */
import { CLASSES, type AreaShape } from "./dnd-spells";

export type LoungeSharedKey = "watch" | "initiative" | "gm" | "card" | "character" | "hiddenroll" | "house" | "tablemap" | "pawn" | "area" | "grid";

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

/**
 * Who the game master is, and how their screen stands for everyone: how many
 * panels it has (3-5) and whether it is folded away. What is inside is theirs.
 */
export interface GameMaster { connectionId: string; name: string; panels?: number; folded?: boolean }

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

/**
 * A player's character at the table: the name and portrait on their tent,
 * and the few numbers play keeps touching. Everyone at the table sees them.
 */
export interface TableCharacter {
  name: string;
  portraitUrl: string | null;
  /** One of CLASSES, or empty. */
  cls?: string;
  level?: number;
  hp?: number;
  maxHp?: number;
  ac?: number;
  /** Feet a turn. */
  speed?: number;
  /** STR, DEX, CON, INT, WIS, CHA; 0 when not filled in. */
  abilities?: number[];
  /** Spell slots by level (1st to 9th): how many, and how many are spent. */
  slots?: number[];
  used?: number[];
  /** The spells they know or prepared, by name. */
  spells?: string[];
}

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

/** The miniatures in the tabletop's cabinet, which anyone may take to the table. */
export const PAWN_KINDS = ["fighter", "wizard", "rogue", "cleric", "beast", "dragon"] as const;
export type PawnKind = (typeof PAWN_KINDS)[number];

/**
 * A miniature someone took from the cabinet and stood on the map. Where it
 * stands is in metres from the table's centre. Its owner moves it, and so does
 * the game master while they are in the room (the hub checks).
 */
export interface TablePawn {
  /** A player's own character (their first pawn): it shows their HP and moves at their speed. */
  hero?: boolean;
  /** Hit points the game master keeps on a monster (a hero's are on its character). */
  hp?: number;
  maxHp?: number;
  id: string;
  kind: PawnKind;
  colour: string;
  /** Metres east and south of the table's centre, always on the map. */
  x: number;
  z: number;
  /** Which way it looks (radians, 0 north, as poses turn). */
  facing: number;
  /** A name over its head ("Goblin 2"); empty: its owner's name. */
  label: string;
  /** The user who took it from the cabinet. */
  owner: string;
  ownerName: string;
  /** Hub clock (ms) when it last moved; the hub stamps it. */
  at: number;
}

/** What a client asks of a pawn: stand it (somewhere new), put it back, or clear the table. */
export type PawnOp =
  | { op: "put"; id: string; kind: PawnKind; colour: string; x: number; z: number; facing: number; label: string }
  | { op: "hp"; id: string; hp: number; maxHp: number }
  | { op: "remove"; id: string }
  | { op: "clear" };

/** How many pawns a player may have on the table, the game master's own, and the table's in all. */
export const PAWNS_EACH = 3;
export const PAWNS_GM = 20;
export const PAWNS_MAX = 60;
/** How far from the centre a pawn may stand: on the map, clear of its edge (tabletop MAP_RADIUS is 1.33). */
export const PAWN_REACH = 1.2;

/** A pawn's place, kept on the map. */
export function clampPawnSpot(x: number, z: number): { x: number; z: number } {
  const r = Math.hypot(x, z);
  if (r <= PAWN_REACH) return { x, z };
  return { x: (x / r) * PAWN_REACH, z: (z / r) * PAWN_REACH };
}

/**
 * The table after one pawn request from `who`, or null when it is not theirs
 * to make: a pawn that is somebody else's (unless they are the game master),
 * one too many, or nothing to change.
 */
export function applyPawn(
  pawns: Record<string, TablePawn>,
  op: PawnOp,
  who: { userId: string; name: string; isGm: boolean },
  now: number,
): Record<string, TablePawn> | null {
  const mayTouch = (pawn: TablePawn) => who.isGm || pawn.owner === who.userId;
  if (op.op === "clear") {
    // The game master clears the table; anyone else puts their own away.
    const next = Object.fromEntries(Object.entries(pawns).filter(([, pawn]) => !(who.isGm || pawn.owner === who.userId)));
    return Object.keys(next).length === Object.keys(pawns).length ? null : next;
  }
  const existing = pawns[op.id];
  if (op.op === "hp") {
    if (!existing || !mayTouch(existing)) return null;
    return { ...pawns, [op.id]: { ...existing, hp: op.hp, maxHp: op.maxHp } };
  }
  if (op.op === "remove") {
    if (!existing || !mayTouch(existing)) return null;
    const { [op.id]: _gone, ...rest } = pawns;
    return rest;
  }
  if (existing) {
    if (!mayTouch(existing)) return null;
    // Moving someone else's leaves it theirs, and as they painted it.
    const mine = existing.owner === who.userId;
    return { ...pawns, [op.id]: { ...existing, x: op.x, z: op.z, facing: op.facing, ...(mine ? { kind: op.kind, colour: op.colour, label: op.label } : {}), at: now } };
  }
  const all = Object.values(pawns);
  const held = all.filter((pawn) => pawn.owner === who.userId).length;
  if (held >= (who.isGm ? PAWNS_GM : PAWNS_EACH) || all.length >= PAWNS_MAX) return null;
  // A player's first pawn is their character; the game master's are monsters.
  const hero = !who.isGm && !all.some((pawn) => pawn.owner === who.userId && pawn.hero);
  return { ...pawns, [op.id]: { id: op.id, kind: op.kind, colour: op.colour, x: op.x, z: op.z, facing: op.facing, label: op.label, owner: who.userId, ownerName: who.name, at: now, ...(hero ? { hero } : {}) } };
}

/** A pawn request as sent, cleaned into a PawnOp (null: not one). */
export function sanitizePawnOp(raw: unknown): PawnOp | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.op === "clear") return { op: "clear" };
  const id = typeof value.id === "string" && /^[\w-]{4,24}$/.test(value.id) ? value.id : "";
  if (!id) return null;
  if (value.op === "remove") return { op: "remove", id };
  if (value.op === "hp") {
    const maxHp = Math.round(num(value.maxHp, 0, 9999));
    return { op: "hp", id, hp: Math.round(num(value.hp, 0, maxHp)), maxHp };
  }
  if (value.op !== "put") return null;
  const kind = PAWN_KINDS.find((k) => k === value.kind);
  if (!kind) return null;
  const colour = typeof value.colour === "string" && /^#[0-9a-f]{6}$/i.test(value.colour) ? value.colour.toLowerCase() : "#c9a45c";
  if (typeof value.x !== "number" || typeof value.z !== "number" || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  const spot = clampPawnSpot(value.x, value.z);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { op: "put", id, kind, colour, x: round(spot.x), z: round(spot.z), facing: round(num(value.facing, -Math.PI, Math.PI)), label: str(value.label, 60).trim().slice(0, 24) };
}

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
      if (!connectionId) return null;
      return { connectionId, name: str(value.name, 40), panels: Math.round(num(value.panels, 3, 5, 3)), folded: value.folded === true } satisfies GameMaster;
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
      const whole = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.max(min, Math.min(max, v))) : undefined);
      const list = (v: unknown, length: number, max: number) => (Array.isArray(v) ? Array.from({ length }, (_, i) => whole(v[i], 0, max) ?? 0) : undefined);
      const cls = CLASSES.find((c) => c === value.cls);
      const maxHp = whole(value.maxHp, 0, 9999);
      const slots = list(value.slots, 9, 9);
      const spells = Array.isArray(value.spells)
        ? [...new Set(value.spells.flatMap((spell) => (typeof spell === "string" && spell.trim() ? [spell.trim().slice(0, 60)] : [])))].slice(0, 40)
        : undefined;
      const sheet: TableCharacter = {
        name,
        portraitUrl: safeMediaUrl(value.portraitUrl),
        ...(cls ? { cls } : {}),
        level: whole(value.level, 1, 20),
        maxHp,
        hp: whole(value.hp, 0, maxHp ?? 9999),
        ac: whole(value.ac, 0, 40),
        speed: whole(value.speed, 0, 300),
        abilities: list(value.abilities, 6, 30),
        slots,
        // Never more spent than there are.
        used: slots ? list(value.used, 9, 9)?.map((n, i) => Math.min(n, slots[i])) : undefined,
        spells,
      };
      return Object.fromEntries(Object.entries(sheet).filter(([, v]) => v !== undefined)) as unknown as TableCharacter;
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
    case "pawn":
      // A request, not a value: the hub applies it to the table with applyPawn.
      return sanitizePawnOp(value);
    case "area":
      return sanitizeAreaOp(value);
    case "grid": {
      const squares = num(value.squares, 10, 60, 0);
      return squares ? ({ squares: Math.round(squares) } satisfies TableGrid) : null;
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

/* ---------- spell areas ---------- */

/**
 * How big the table's map is in 5-foot squares from edge to edge: the scale
 * that pawns, rulers and spell areas use. The game master sets it to match
 * an uploaded map's grid.
 */
export interface TableGrid { squares: number }
export const DEFAULT_SQUARES = 22;

/**
 * A spell's area put on the map: its shape and size in feet, where it points
 * (x, z) and where it starts (ox, oz), in metres from the table's centre. It
 * stays until its caster or the game master takes it off.
 */
export interface TableArea {
  id: string;
  spell: string;
  shape: AreaShape;
  size: number;
  width: number;
  fromSelf: boolean;
  x: number;
  z: number;
  ox: number;
  oz: number;
  colour: string;
  /** What to say over it: "DEX save · 8d6 fire". */
  note: string;
  owner: string;
  ownerName: string;
  /** Hub clock (ms); the hub stamps it. */
  at: number;
}

export type AreaOp =
  | { op: "put"; id: string; spell: string; shape: AreaShape; size: number; width: number; fromSelf: boolean; x: number; z: number; ox: number; oz: number; colour: string; note: string }
  | { op: "remove"; id: string }
  | { op: "clear" };

/** At most this many areas stand on the table; another takes the oldest off. */
export const AREAS_MAX = 8;
const AREA_SHAPES: AreaShape[] = ["sphere", "cone", "line", "cube"];

export function sanitizeAreaOp(raw: unknown): AreaOp | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.op === "clear") return { op: "clear" };
  const id = typeof value.id === "string" && /^[\w-]{4,24}$/.test(value.id) ? value.id : "";
  if (!id) return null;
  if (value.op === "remove") return { op: "remove", id };
  if (value.op !== "put") return null;
  const shape = AREA_SHAPES.find((s) => s === value.shape);
  const spell = str(value.spell, 60).trim();
  if (!shape || !spell) return null;
  const spot = (v: unknown) => Math.round(num(v, -2, 2) * 1000) / 1000;
  return {
    op: "put", id, spell, shape,
    size: Math.round(num(value.size, 5, 500, 5)),
    width: Math.round(num(value.width, 0, 100)),
    fromSelf: value.fromSelf === true,
    x: spot(value.x), z: spot(value.z), ox: spot(value.ox), oz: spot(value.oz),
    colour: typeof value.colour === "string" && /^#[0-9a-f]{6}$/i.test(value.colour) ? value.colour.toLowerCase() : "#ffd27a",
    note: str(value.note, 60).trim(),
  };
}

/** The table's areas after one request, or null when it is not `who`'s to make. */
export function applyArea(
  areas: Record<string, TableArea>,
  op: AreaOp,
  who: { userId: string; name: string; isGm: boolean },
  now: number,
): Record<string, TableArea> | null {
  if (op.op === "clear") {
    const next = Object.fromEntries(Object.entries(areas).filter(([, area]) => !(who.isGm || area.owner === who.userId)));
    return Object.keys(next).length === Object.keys(areas).length ? null : next;
  }
  const existing = areas[op.id];
  if (existing && !(who.isGm || existing.owner === who.userId)) return null;
  if (op.op === "remove") {
    if (!existing) return null;
    const { [op.id]: _gone, ...rest } = areas;
    return rest;
  }
  const { op: _op, ...spec } = op;
  const next = { ...areas, [op.id]: { ...spec, owner: existing?.owner ?? who.userId, ownerName: existing?.ownerName ?? who.name, at: now } };
  const all = Object.values(next).sort((a, b) => a.at - b.at);
  for (const old of all.slice(0, Math.max(0, all.length - AREAS_MAX))) delete next[old.id];
  return next;
}
