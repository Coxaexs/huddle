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
import type { DiceRollEvent } from "./protocol";
import { bindings } from "./storage";

/** What the companion asks the hub to do, for one person (a native user id). */
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
  | { op: "spellfx"; userId: string; value: Record<string, unknown> };

export const DND_TABLE_OPS = new Set(["where", "character", "gm", "tablemap", "spellfx"]);

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
  | { type: "seated"; user: string };

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
      body: JSON.stringify({ ...event, user }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // The companion is optional.
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
