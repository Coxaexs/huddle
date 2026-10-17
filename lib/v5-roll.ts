/**
 * Rolls a V5 pool, a Rouse check or a Willpower reroll on the server: fair
 * dice, the DiceRollEvent every screen animates, and the card that is posted.
 * The rules themselves are in lib/v5-dice.ts.
 */
import type { DiceRollEvent } from "./protocol";
import { randomDie, randomSeed } from "./fair-dice";
import {
  scoreRouse,
  scoreV5,
  splitPool,
  v5Summary,
  type V5Request,
  type V5Score,
} from "./v5-dice";

export interface DiceLook {
  theme?: string;
  themeColor?: string;
  material?: DiceRollEvent["material"];
  texture?: string;
}

type Roller = { id: string; display_name: string };

/** A V5 roll card, as posted (kind "dnd", type "v5"). */
export interface V5Card extends V5Score {
  type: "v5";
  name: string;
  label?: string;
  roller: string;
  rollerId: string;
  pool: number;
  difficulty?: number;
  /** The non-Hunger dice, then the Hunger dice, as they show now. */
  normal: number[];
  hungerDice: number[];
  /** Set once Willpower was spent: which normal dice, and what they showed before. */
  willpower?: { picks: number[]; before: number[] };
  verified?: boolean;
}

export interface RouseCard {
  type: "rouse";
  name: string;
  label?: string;
  roller: string;
  rollerId: string;
  dice: number[];
  best: number;
  success: boolean;
  hungerBefore?: number;
  hungerAfter?: number;
  atMax: boolean;
  outcome: string;
  verified?: boolean;
}

const d10s = (count: number) => Array.from({ length: count }, () => randomDie(10));
const faces = (values: number[]) => values.map((value) => ({ value, kept: true }));

function v5Event(user: Roller, normal: number[], hunger: number[], score: V5Score, expression: string, look: DiceLook): DiceRollEvent {
  return {
    expression,
    dice: [
      ...(normal.length ? [{ sides: 10, sign: 1 as const, rolls: faces(normal) }] : []),
      ...(hunger.length ? [{ sides: 10, sign: 1 as const, hunger: true, rolls: faces(hunger) }] : []),
    ],
    modifier: 0,
    total: score.successes,
    summary: v5Summary(score),
    roller: { id: user.id, displayName: user.display_name },
    rollType: "normal",
    animationSeed: randomSeed(),
    ...look,
  };
}

function poolWords(card: Pick<V5Card, "pool" | "hungerDice" | "difficulty">): string {
  const hunger = card.hungerDice.length ? ` (${card.hungerDice.length} Hunger)` : "";
  const difficulty = card.difficulty !== undefined ? ` vs ${card.difficulty}` : "";
  return `${card.pool} dice${hunger}${difficulty}`;
}

export function v5Text(card: V5Card): string {
  const dice = `[${card.normal.join(", ")}]${card.hungerDice.length ? ` Hunger [${card.hungerDice.join(", ")}]` : ""}`;
  const willpower = card.willpower ? " after a Willpower reroll" : "";
  const count = `${card.successes} success${card.successes === 1 ? "" : "es"}`;
  const verdict = card.outcome === count ? "" : `. ${card.outcome}`;
  return `${card.label ? `${card.label}: ` : ""}rolled ${poolWords(card)}${willpower}: ${dice} → ${count}${verdict}`;
}

export function rollV5(request: V5Request, user: Roller, look: DiceLook = {}): { roll: DiceRollEvent; card: V5Card; text: string } {
  const split = splitPool(request.pool, request.hunger);
  const normal = d10s(split.normal);
  const hungerDice = d10s(split.hunger);
  const score = scoreV5(normal, hungerDice, request.difficulty);
  const card: V5Card = {
    type: "v5",
    name: "V5 roll",
    ...(request.label ? { label: request.label } : {}),
    roller: user.display_name,
    rollerId: user.id,
    pool: request.pool,
    ...(request.difficulty !== undefined ? { difficulty: request.difficulty } : {}),
    normal,
    hungerDice,
    ...score,
  };
  const roll = v5Event(user, normal, hungerDice, score, poolWords(card), look);
  return { roll, card, text: v5Text(card) };
}

export function rollRouse(
  request: { dice: number; hunger?: number; label: string },
  user: Roller,
  look: DiceLook = {},
): { roll: DiceRollEvent; card: RouseCard; text: string } {
  const dice = d10s(request.dice);
  const result = scoreRouse(dice, request.hunger);
  const bestIndex = dice.indexOf(result.best);
  const card: RouseCard = {
    type: "rouse",
    name: "Rouse check",
    ...(request.label ? { label: request.label } : {}),
    roller: user.display_name,
    rollerId: user.id,
    ...result,
  };
  const roll: DiceRollEvent = {
    expression: dice.length > 1 ? `Rouse check (best of ${dice.length})` : "Rouse check",
    // Rouse dice are thrown red, like Hunger.
    dice: [{ sides: 10, sign: 1, hunger: true, rolls: dice.map((value, index) => ({ value, kept: index === bestIndex })) }],
    modifier: 0,
    total: result.best,
    summary: `ROUSE ${result.best} · ${result.success ? "NO HUNGER" : result.atMax ? "THE BEAST STIRS" : "HUNGER +1"}`,
    roller: { id: user.id, displayName: user.display_name },
    rollType: "normal",
    animationSeed: randomSeed(),
    ...look,
  };
  const text = `${card.label ? `${card.label}: ` : ""}Rouse check [${dice.join(", ")}]: ${result.success ? "success" : "failure"}. ${result.outcome}`;
  return { roll, card, text };
}

/** Spends Willpower on a posted card: rerolls the picked normal dice (already checked) and rescores. */
export function rerollV5(card: V5Card, picks: number[], user: Roller, look: DiceLook = {}): { roll: DiceRollEvent; card: V5Card; text: string } {
  const fresh = d10s(picks.length);
  const normal = [...card.normal];
  picks.forEach((index, i) => { normal[index] = fresh[i]; });
  const score = scoreV5(normal, card.hungerDice, card.difficulty);
  const next: V5Card = {
    ...card,
    normal,
    ...score,
    willpower: { picks, before: picks.map((index) => card.normal[index]) },
  };
  // Only the rerolled dice tumble; the summary is the whole pool's new result.
  const roll = v5Event(user, fresh, [], score, `Willpower reroll (${picks.length})`, look);
  return { roll, card: next, text: v5Text(next) };
}
