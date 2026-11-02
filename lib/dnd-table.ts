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
import { clampPawnSpot, PAWN_KINDS, PAWNS_MAX, type Initiative, type PawnKind, type TableMap, type TablePawn } from "./lounge-shared";
import type { DiceRollEvent } from "./protocol";
import { bindings } from "./storage";

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
}

/** The companion's initiative order. `owner` (a native user) puts the turn marker on their chair. */
export interface CompanionInitiative {
  entries: Array<{ id: string; name: string; value: number; owner?: string }>;
  turn: number;
  round: number;
}

/**
 * What the companion asks the hub to do. Most act for one person (a native
 * user id) in the rooms they sit in; the shared-board ops (pawns, initiative)
 * reach every room where the person or anyone in `also` sits.
 */
export type DndTableOp =
  /** The voice rooms that person sits in. */
  | { op: "where"; userId: string }
  /** Their hero on the table, or null to clear it. */
  | { op: "character"; userId: string; value: Record<string, unknown> | null }
  /** They take the game master's screen in every room they sit in. */
  | { op: "gm"; userId: string }
  /** Their battle map (already an upload of this server) goes on the table. */
  | { op: "tablemap"; userId: string; value: { url: string; turns?: number; zoom?: number } }
  /** A spell they cast: drawn from their chair toward the table. */
  | { op: "spellfx"; userId: string; value: Record<string, unknown> }
  /** One battle map token stood on the table, moved, or (remove) taken off. */
  | { op: "pawn"; userId: string; also?: string[]; value: CompanionPawn | { remove: string } }
  /** The companion's whole battle map: the table's pawns become its tokens. */
  | { op: "pawns"; userId: string; also?: string[]; value: CompanionPawn[] }
  /** The companion's initiative order, or null when combat is over. */
  | { op: "initiative"; userId: string; also?: string[]; value: CompanionInitiative | null };

export const DND_TABLE_OPS = new Set(["where", "character", "gm", "tablemap", "spellfx", "pawn", "pawns", "initiative"]);

/** What the table tells the companion. `user` is the person's snowflake. */
export type DndTableEvent =
  | {
      type: "roll";
      user: string;
      displayName: string;
      expression: string;
      total: number;
      modifier: number;
      dice: Array<{ sides: number; values: number[] }>;
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
  | { type: "initiative"; user: string; room: string; people: string[]; value: CompanionInitiative | null };

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
  if (pawn.hero) {
    const theirs = Object.values(pawns).find((p) => p.owner === pawn.owner && p.hero);
    if (theirs) return { pawns: { ...pawns, [theirs.id]: { ...theirs, x: pawn.x, z: pawn.z, at: now } }, id: theirs.id };
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
      return { id: entry.id, name: entry.name, value: entry.value, ...(connectionId ? { connectionId } : {}) };
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
      return { id: entry.id, name: entry.name, value: entry.value, ...(owner ? { owner } : {}) };
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
  input: { expression: string; sides: number; values: number[]; modifier: number; total: number },
): DiceRollEvent | null {
  const sides = Math.floor(input.sides);
  if (!Number.isFinite(sides) || sides < 2 || sides > 1000) return null;
  const values = input.values
    .slice(0, 100)
    .map((v) => Math.floor(Number(v)))
    .filter((v) => Number.isFinite(v) && v >= 1 && v <= sides);
  if (!values.length) return null;
  return {
    expression: String(input.expression).slice(0, 60),
    dice: [{ sides, rolls: values.map((value) => ({ value, kept: true })), sign: 1 }],
    modifier: Math.round(Number(input.modifier) || 0),
    total: Math.round(Number(input.total) || 0),
    roller,
    rollType: "normal",
    animationSeed: crypto.randomUUID(),
  };
}

function companionBase(): string | null {
  const base = bindings().DND_BASE_URL?.trim();
  if (!base) return null;
  try {
    const url = new URL(base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
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
    const base = companionBase();
    const secret = bindings().BOT_TOKEN;
    if (!base || !secret) return;
    const user = await snowflakeFor("user", nativeUserId);
    await fetch(`${base}/api/hoffle/events`, {
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
  if (event.type === "pawns") {
    return {
      ...event,
      people: await Promise.all(event.people.map(personFor)),
      pawns: await Promise.all(event.pawns.map(async (pawn) => ({ ...pawn, owner: await personFor(pawn.owner) }))),
    };
  }
  if (event.type === "initiative") {
    return {
      ...event,
      people: await Promise.all(event.people.map(personFor)),
      value: event.value && {
        ...event.value,
        entries: await Promise.all(
          event.value.entries.map(async (entry) => (entry.owner ? { ...entry, owner: await personFor(entry.owner) } : entry)),
        ),
      },
    };
  }
  return event;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
