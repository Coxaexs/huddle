/**
 * The D&D companion (the dndbot web app) and the tabletop share one game: a
 * hero made there sits at the table here, dice rolled on either side land on
 * both, and the companion's game master runs the table.
 *
 * The companion sends its side through /api/integrations/dnd/table (the D&D
 * bot's token), which lib/hub.ts applies with `DndTableOp`. What happens at the
 * table goes back to the companion through `notifyDndTable`, signed with the
 * same derived token so the companion knows it came from here.
 *
 * Users cross the line as their Discord-surface snowflakes, the ids the D&D
 * bot already knows people by.
 */
import { dndBotToken } from "./bot-auth";
import { snowflakeFor } from "./discord/snowflake";
import { dndBaseUrl } from "./dnd-url";
import {
  clampPawnSpot,
  PAWN_KINDS,
  PAWNS_MAX,
  safeMediaUrl,
  type Initiative,
  type PawnKind,
  type TableArea,
  type TableFog,
  type TableMap,
  type TableMood,
  type TablePawn,
} from "./lounge-shared";
import type { DiceRollEvent } from "./protocol";

/**
 * One of the companion's battle map tokens, as a pawn. `owner` is the native
 * user it belongs to (its player, or the companion's game master for a monster).
 */
export interface CompanionPawn {
  id: string;
  kind: PawnKind;
  colour: string;
  /** Metres east and south of the table's centre, like every pawn. */
  x: number;
  z: number;
  label: string;
  owner: string;
  ownerName: string;
  /** A player's character token: it is that player's hero pawn at the table. */
  hero?: boolean;
  /** A monster's hit points, which the game master keeps on its pawn. */
  hp?: number;
  maxHp?: number;
  conditions?: string[];
  size?: number;
  elevation?: number;
  portraitUrl?: string | null;
}

/** The companion's initiative order. `owner` (a native user) puts the turn marker on their chair. */
export interface CompanionInitiative {
  entries: Array<{ id: string; name: string; value: number; owner?: string; pawnId?: string }>;
  turn: number;
  round: number;
}

/**
 * What the companion asks the hub to do. Most act for one person (a native
 * user id) in the rooms they sit in; the shared-board ops (pawns, initiative,
 * grid, fog, areas, ping, card, mood) reach every room where the person or
 * anyone in `also` sits.
 */
export type DndTableOp =
  /** The voice rooms that person sits in. */
  | { op: "where"; userId: string }
  /** Fetch their active character sheet from the table. */
  | { op: "character-get"; userId: string }
  /** Their hero on the table, or null to clear it. */
  | { op: "character"; userId: string; value: Record<string, unknown> | null }
  /** They take the game master's screen in every room they sit in. */
  | { op: "gm"; userId: string }
  /** Their battle map (already an upload of this server) goes on the table. */
  | { op: "tablemap"; userId: string; also?: string[]; value: { url: string; turns?: number; zoom?: number } }
  /** A spell they cast: drawn from their chair toward the table. */
  | { op: "spellfx"; userId: string; also?: string[]; value: Record<string, unknown> }
  /** One battle map token stood on the table, moved, or (remove) taken off. */
  | { op: "pawn"; userId: string; also?: string[]; value: CompanionPawn | { remove: string } }
  /** The companion's whole battle map: the table's pawns become its tokens. */
  | { op: "pawns"; userId: string; also?: string[]; value: CompanionPawn[] }
  /** The companion's initiative order, or null when combat is over. */
  | { op: "initiative"; userId: string; also?: string[]; value: CompanionInitiative | null }
  /** Grid density across the tabletop map. */
  | { op: "grid"; userId: string; also?: string[]; value: { squares: number } | null }
  /** Fog of war rects in map percentage coordinates (0..100). */
  | { op: "fog"; userId: string; also?: string[]; value: TableFog | null }
  /** Persistent AoE spell templates on the tabletop. */
  | { op: "areas"; userId: string; also?: string[]; value: TableArea[] }
  /** Transient map ping on the tabletop. */
  | { op: "ping"; userId: string; also?: string[]; value: { id?: string; x: number; z: number; colour?: string; byName?: string } }
  /** Shared reference card pinned to the tabletop lectern. */
  | { op: "card"; userId: string; also?: string[]; value: Record<string, unknown> | null }
  /** Ambient lighting mood for the living room. */
  | { op: "mood"; userId: string; also?: string[]; value: { mood: TableMood; curtains?: boolean; off?: string[] } }
  /** Mirror 2D voice battlemap state onto the 3D tabletop and companion. */
  | { op: "battlemap-sync"; userId: string; channelId: string; also?: string[]; value: Record<string, unknown> };

export const DND_TABLE_OPS = new Set([
  "where",
  "character-get",
  "character",
  "gm",
  "tablemap",
  "spellfx",
  "pawn",
  "pawns",
  "initiative",
  "grid",
  "fog",
  "areas",
  "ping",
  "card",
  "mood",
  "battlemap-sync",
]);

/** What the table tells the companion. `user` is the person's snowflake. */
export type DndTableEvent =
  | {
      type: "roll";
      user: string;
      displayName: string;
      expression: string;
      total: number;
      modifier: number;
      label?: string;
      rollType?: DiceRollEvent["rollType"];
      dice: Array<{ sides: number; values: number[] }>;
      diceGroups?: DiceRollEvent["dice"];
    }
  | { type: "character"; user: string; value: Record<string, unknown> }
  /** They sat down in a voice room: the companion answers with their hero. */
  | { type: "seated"; user: string; room?: string }
  /**
   * The pawns on a table changed. Owners are snowflakes; `people` are everyone
   * seated there, so the companion only follows tables its own players sit at.
   */
  | { type: "pawns"; user: string; room: string; people: string[]; pawns: TablePawn[]; map: { turns: number; zoom: number } | null }
  /** The initiative order at a table changed (null: cleared). Entry owners are snowflakes. */
  | { type: "initiative"; user: string; room: string; people: string[]; value: CompanionInitiative | null }
  | { type: "tablemap"; user: string; room: string; people: string[]; value: { url: string; turns: number; zoom: number } | null }
  | { type: "grid"; user: string; room: string; people: string[]; squares: number }
  | { type: "fog"; user: string; room: string; people: string[]; value: TableFog | null }
  | { type: "areas"; user: string; room: string; people: string[]; areas: TableArea[] }
  | { type: "ping"; user: string; room: string; people: string[]; x: number; z: number; colour: string; byName: string; id: string }
  | { type: "mood"; user: string; room: string; people: string[]; mood: TableMood; curtains: boolean; off: string[] }
  | { type: "spellfx"; user: string; room: string; people: string[]; value: Record<string, unknown> };

export { TABLE_MAP_RADIUS, tableFromMap, mapFromTable } from "./lounge-shared";

/** A pawn the companion sent, cleaned (null: not one). The owner is resolved by the route. */
export function sanitizeCompanionPawn(raw: unknown, owner: string, ownerName: string): CompanionPawn | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === "string" && /^[\w-]{4,24}$/.test(value.id) ? value.id : "";
  if (!id || typeof value.x !== "number" || typeof value.z !== "number" || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  const spot = clampPawnSpot(value.x, value.z);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const kind = PAWN_KINDS.find((k) => k === value.kind) ?? "fighter";
  const colour = typeof value.colour === "string" && /^#[0-9a-f]{6}$/i.test(value.colour) ? value.colour.toLowerCase() : "#c9a45c";
  const label = typeof value.label === "string" ? value.label.trim().slice(0, 24) : "";
  const pawn: CompanionPawn = { id, kind, colour, x: round(spot.x), z: round(spot.z), label, owner, ownerName: ownerName.slice(0, 40) };
  if (value.hero === true) pawn.hero = true;
  const maxHp = Number(value.maxHp);
  if (!pawn.hero && Number.isFinite(maxHp) && maxHp > 0) {
    pawn.maxHp = Math.min(9999, Math.round(maxHp));
    pawn.hp = Math.max(0, Math.min(pawn.maxHp, Math.round(Number(value.hp ?? maxHp) || 0)));
  }
  if (Array.isArray(value.conditions)) {
    pawn.conditions = [...new Set(value.conditions.flatMap((c) => (typeof c === "string" && c.trim() ? [c.trim().toLowerCase().slice(0, 24)] : [])))].slice(0, 12);
  }
  const size = Number(value.size);
  if (Number.isFinite(size) && size >= 1 && size <= 6) {
    pawn.size = Math.round(size);
  }
  const elevation = Number(value.elevation);
  if (Number.isFinite(elevation) && elevation !== 0) {
    pawn.elevation = Math.round(Math.max(-120, Math.min(500, elevation)));
  }
  if ("portraitUrl" in value) {
    pawn.portraitUrl = value.portraitUrl === null ? null : safeMediaUrl(value.portraitUrl) ?? undefined;
  }
  return pawn;
}

/**
 * The table after the companion stands one token on it. A hero token moves its
 * player's own hero pawn if they have one (keeping how they painted it);
 * anything else is the companion's pawn under the token's id. `id` is the pawn
 * it became, or null when the table is full.
 */
export function placeCompanionPawn(
  pawns: Record<string, TablePawn>,
  pawn: CompanionPawn,
  now: number,
): { pawns: Record<string, TablePawn>; id: string | null } {
  const extras = {
    ...(pawn.conditions !== undefined ? { conditions: pawn.conditions } : {}),
    ...(pawn.size !== undefined ? { size: pawn.size } : {}),
    ...(pawn.elevation !== undefined ? { elevation: pawn.elevation } : {}),
    ...(pawn.portraitUrl !== undefined ? { portraitUrl: pawn.portraitUrl } : {}),
  };
  if (pawn.hero) {
    const theirs = Object.values(pawns).find((p) => p.owner === pawn.owner && p.hero);
    if (theirs) {
      return {
        pawns: { ...pawns, [theirs.id]: { ...theirs, x: pawn.x, z: pawn.z, ...extras, at: now } },
        id: theirs.id,
      };
    }
  }
  const before = pawns[pawn.id];
  if (!before && Object.keys(pawns).length >= PAWNS_MAX) return { pawns, id: null };
  const next: TablePawn = {
    id: pawn.id,
    kind: pawn.kind,
    colour: pawn.colour,
    x: pawn.x,
    z: pawn.z,
    // A new pawn faces the middle of the table, as one stood there by hand does.
    facing: before?.facing ?? Math.round(Math.atan2(-pawn.x, pawn.z) * 1000) / 1000,
    label: pawn.label,
    owner: pawn.owner,
    ownerName: pawn.ownerName,
    at: now,
    ...extras,
    ...(pawn.hero ? { hero: true } : {}),
    ...(!pawn.hero && pawn.maxHp ? { hp: pawn.hp ?? pawn.maxHp, maxHp: pawn.maxHp } : {}),
  };
  return { pawns: { ...pawns, [pawn.id]: next }, id: pawn.id };
}

/**
 * The table after the companion lays out its whole battle map (a new map went
 * up): its tokens replace the pawns, except the hero pawns of players the map
 * has no token for. `ids` says which pawn each token became.
 */
export function layCompanionPawns(
  pawns: Record<string, TablePawn>,
  list: CompanionPawn[],
  now: number,
): { pawns: Record<string, TablePawn>; ids: Record<string, string> } {
  let next: Record<string, TablePawn> = Object.fromEntries(Object.entries(pawns).filter(([, p]) => p.hero));
  const ids: Record<string, string> = {};
  for (const pawn of list) {
    const placed = placeCompanionPawn(next, pawn, now);
    next = placed.pawns;
    if (placed.id) ids[pawn.id] = placed.id;
  }
  return { pawns: next, ids };
}

/** The companion's order as the table keeps it: an owner seated here gets the turn marker on their chair. */
export function tableInitiative(value: CompanionInitiative, seatOf: (owner: string) => string | undefined): Record<string, unknown> {
  return {
    entries: value.entries.slice(0, 30).map((entry) => {
      const connectionId = entry.owner ? seatOf(entry.owner) : undefined;
      return {
        id: entry.id,
        name: entry.name,
        value: entry.value,
        ...(connectionId ? { connectionId } : {}),
        ...(entry.pawnId ? { pawnId: entry.pawnId } : {}),
      };
    }),
    turn: value.turn,
    round: value.round,
  };
}

/** The table's order as the companion keeps it: chairs become the people sitting in them. */
export function companionInitiative(init: Initiative | null, ownerOf: (connectionId: string) => string | undefined): CompanionInitiative | null {
  if (!init) return null;
  return {
    entries: init.entries.map((entry) => {
      const owner = entry.connectionId ? ownerOf(entry.connectionId) : undefined;
      return {
        id: entry.id,
        name: entry.name,
        value: entry.value,
        ...(owner ? { owner } : {}),
        ...(entry.pawnId ? { pawnId: entry.pawnId } : {}),
      };
    }),
    turn: init.turn,
    round: init.round,
  };
}

/** How the battle map image lies on the table, which the companion needs to place its tokens. */
export function tableView(map: TableMap | undefined): { turns: number; zoom: number } | null {
  return map ? { turns: map.turns, zoom: map.zoom } : null;
}

/** The faces of a roll, as plain kept values per die type. */
export function rollFaces(roll: DiceRollEvent): Array<{ sides: number; values: number[] }> {
  return roll.dice.map((group) => ({
    sides: group.sides,
    values: group.rolls.filter((r) => r.kept).map((r) => r.value * group.sign),
  }));
}

/**
 * A roll the companion made, in the shape the 3D dice animate. The companion
 * already chose the faces; the table only shows them landing.
 */
export function companionRoll(
  roller: { id: string; displayName: string },
  input: {
    expression: string;
    sides?: number;
    values?: number[];
    dice?: Array<{ sides: number; rolls: Array<{ value: number; kept?: boolean }>; sign?: 1 | -1; hunger?: boolean }>;
    modifier: number;
    total: number;
    label?: string;
    rollType?: DiceRollEvent["rollType"];
  },
): DiceRollEvent | null {
  const dice: DiceRollEvent["dice"] = [];
  if (Array.isArray(input.dice) && input.dice.length) {
    for (const rawGroup of input.dice.slice(0, 12)) {
      const sides = Math.floor(Number(rawGroup.sides));
      if (!Number.isFinite(sides) || sides < 2 || sides > 1000) continue;
      const rolls = (Array.isArray(rawGroup.rolls) ? rawGroup.rolls : [])
        .slice(0, 100)
        .flatMap((r) => {
          const value = Math.floor(Number(r?.value));
          return Number.isFinite(value) && value >= 1 && value <= sides ? [{ value, kept: r?.kept !== false }] : [];
        });
      if (rolls.length) {
        dice.push({ sides, rolls, sign: rawGroup.sign === -1 ? -1 : 1, ...(rawGroup.hunger ? { hunger: true } : {}) });
      }
    }
  } else {
    const sides = Math.floor(Number(input.sides));
    if (!Number.isFinite(sides) || sides < 2 || sides > 1000) return null;
    const values = (Array.isArray(input.values) ? input.values : [])
      .slice(0, 100)
      .map((v) => Math.floor(Number(v)))
      .filter((v) => Number.isFinite(v) && v >= 1 && v <= sides);
    if (values.length) {
      dice.push({ sides, rolls: values.map((value) => ({ value, kept: true })), sign: 1 });
    }
  }
  if (!dice.length) return null;
  const rollType: DiceRollEvent["rollType"] =
    input.rollType === "advantage" || input.rollType === "disadvantage" || input.rollType === "critical-damage" ? input.rollType : "normal";
  const label = typeof input.label === "string" && input.label.trim() ? input.label.trim().slice(0, 40) : undefined;
  return {
    expression: String(input.expression).slice(0, 60),
    dice,
    modifier: Math.round(Number(input.modifier) || 0),
    total: Math.round(Number(input.total) || 0),
    ...(label ? { label } : {}),
    roller,
    rollType,
    animationSeed: crypto.randomUUID(),
  };
}

/**
 * Tell the companion what happened at the table. Best effort: a companion that
 * is down or not set up simply misses it, and the table never waits on it.
 */
export async function notifyDndTable(
  nativeUserId: string,
  event: DistributiveOmit<DndTableEvent, "user">,
): Promise<void> {
  if (!nativeUserId || nativeUserId.startsWith("discord:") || nativeUserId.startsWith("bot:")) return;
  try {
    const base = dndBaseUrl();
    const { bindings } = await import("./storage");
    const secret = bindings().BOT_TOKEN;
    if (!secret) return;
    const user = await snowflakeFor("user", nativeUserId);
    await fetch(new URL("/api/hoffle/events", base), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await dndBotToken(secret)}`,
      },
      body: JSON.stringify({ ...(await withSnowflakes(event)), user }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // The companion is optional.
  }
}

/** A Hoffle person as the companion knows them; Discord seats and bots keep what they are. */
async function personFor(nativeUserId: string): Promise<string> {
  if (!nativeUserId || nativeUserId.startsWith("discord:") || nativeUserId.startsWith("bot:")) return nativeUserId;
  return snowflakeFor("user", nativeUserId);
}

/** Every person named in an event (owners, the people seated), as snowflakes. */
async function withSnowflakes(
  event: DistributiveOmit<DndTableEvent, "user">,
): Promise<DistributiveOmit<DndTableEvent, "user">> {
  if ("people" in event && Array.isArray(event.people)) {
    const people = await Promise.all(event.people.map(personFor));
    if (event.type === "pawns") {
      return {
        ...event,
        people,
        pawns: await Promise.all(event.pawns.map(async (pawn) => ({ ...pawn, owner: await personFor(pawn.owner) }))),
      };
    }
    if (event.type === "initiative") {
      return {
        ...event,
        people,
        value: event.value && {
          ...event.value,
          entries: await Promise.all(
            event.value.entries.map(async (entry) => (entry.owner ? { ...entry, owner: await personFor(entry.owner) } : entry)),
          ),
        },
      };
    }
    return { ...event, people };
  }
  return event;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
