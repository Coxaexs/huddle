/**
 * Vampire: The Masquerade 5th edition dice. A pool of d10s where each 6+ is a
 * success and every pair of 10s is a critical worth four; some of the pool are
 * Hunger dice (drawn red), and they are what make a critical messy or a
 * failure bestial. Pure rules here; the roll route rolls and posts them.
 */

export const V5_MAX_POOL = 30;
export const V5_MAX_HUNGER = 5;
export const V5_MAX_DIFFICULTY = 20;
/** Willpower rerolls up to this many of the non-Hunger dice, once. */
export const V5_WILLPOWER_DICE = 3;
/**
 * Hunger dice on every screen: the chat overlay, the table, the card. Bright
 * red with black numbers, so they stand apart even from the Vampire dice
 * style's dark reds and pale ink.
 */
export const HUNGER_DIE_COLOR = "#c1121f";
export const HUNGER_DIE_INK = "#14060a";

export interface V5Request {
  pool: number;
  hunger: number;
  /** Absent: just count the successes. */
  difficulty?: number;
  label: string;
}

export interface V5Score {
  successes: number;
  /** At least one pair of 10s. */
  critical: boolean;
  /** A critical with a 10 on a Hunger die (a win, or no Difficulty to say). */
  messy: boolean;
  /** A failure with a 1 on a Hunger die. */
  bestial: boolean;
  /** No Difficulty given, but a Hunger 1 is showing: bestial if this fails. */
  bestialRisk: boolean;
  /** No successes at all. */
  totalFailure: boolean;
  /** Only with a Difficulty. */
  win?: boolean;
  margin?: number;
  /** The one-line verdict: "Messy critical", "Bestial failure", "Win by 2". */
  outcome: string;
}

const NUMBER = /^\d{1,2}$/;

/**
 * `/v 7 h2 d3 Strength + Brawl`, `/v 3+2 hunger 1 diff 4`, `/v 6h1`. The first
 * bare number (or `a+b` sum) is the pool; `h`/`hunger` and `d`/`diff`/`dc`/`vs`
 * mark the Hunger and the Difficulty; what is left is the label.
 */
export function parseV5(input: string): V5Request | { error: string } {
  const words = input
    // "7h2d3" reads as "7 h2 d3".
    .replace(/(\d)(?=[hd]\d)/gi, "$1 ")
    .replace(/\b(hunger|diff|difficulty|dc|vs)\s*[:=]?\s+(\d)/gi, "$1$2")
    .split(/\s+/)
    .filter(Boolean);
  let pool: number | undefined;
  let hunger: number | undefined;
  let difficulty: number | undefined;
  const label: string[] = [];
  for (const word of words) {
    const hungerWord = word.match(/^(?:h|hunger)[:=]?(\d{1,2})$/i);
    const difficultyWord = word.match(/^(?:d|diff|difficulty|dc|vs)[:=]?(\d{1,2})$/i);
    if (hungerWord && hunger === undefined) hunger = Number(hungerWord[1]);
    else if (difficultyWord && difficulty === undefined) difficulty = Number(difficultyWord[1]);
    else if (pool === undefined && /^\d{1,2}(?:\+\d{1,2})*$/.test(word)) {
      pool = word.split("+").reduce((sum, part) => sum + Number(part), 0);
    } else if (pool === undefined && NUMBER.test(word)) pool = Number(word);
    else label.push(word);
  }
  if (pool === undefined) {
    return { error: "Give a dice pool: `/v 7 h2 d3 Strength + Brawl` (7 dice, Hunger 2, Difficulty 3)." };
  }
  if (pool < 1 || pool > V5_MAX_POOL) return { error: `A pool is 1 to ${V5_MAX_POOL} dice.` };
  if ((hunger ?? 0) > V5_MAX_HUNGER) return { error: `Hunger goes up to ${V5_MAX_HUNGER}.` };
  if (difficulty === 0) return { error: "Difficulty is 1 or more; leave it out to just count successes." };
  if ((difficulty ?? 0) > V5_MAX_DIFFICULTY) return { error: `Difficulty goes up to ${V5_MAX_DIFFICULTY}.` };
  return { pool, hunger: hunger ?? 0, difficulty, label: label.join(" ").slice(0, 80) };
}

/** Hunger dice replace normal ones; with Hunger at or over the pool, every die is a Hunger die. */
export function splitPool(pool: number, hunger: number): { normal: number; hunger: number } {
  const red = Math.min(pool, hunger);
  return { normal: pool - red, hunger: red };
}

export function scoreV5(normal: number[], hunger: number[], difficulty?: number): V5Score {
  const all = [...normal, ...hunger];
  const tens = all.filter((value) => value === 10).length;
  const pairs = Math.floor(tens / 2);
  const successes = all.filter((value) => value >= 6).length + pairs * 2;
  const critical = pairs > 0;
  const hungerTen = hunger.includes(10);
  const hungerOne = hunger.includes(1);
  const hasDifficulty = difficulty !== undefined;
  const win = hasDifficulty ? successes >= difficulty : undefined;
  const margin = hasDifficulty ? successes - difficulty : undefined;
  const messy = critical && hungerTen && win !== false;
  const bestial = hasDifficulty ? !win && hungerOne : successes === 0 && hungerOne;
  const bestialRisk = !hasDifficulty && !bestial && hungerOne;
  const totalFailure = successes === 0;

  let outcome: string;
  if (bestial) outcome = "Bestial failure";
  else if (messy) outcome = "Messy critical";
  else if (critical && win !== false) outcome = "Critical win";
  else if (totalFailure) outcome = "Total failure";
  else if (win === false) outcome = `Fail by ${-(margin ?? 0)}`;
  else if (win) outcome = margin ? `Win by ${margin}` : "Win";
  else outcome = `${successes} success${successes === 1 ? "" : "es"}`;
  return { successes, critical, messy, bestial, bestialRisk, totalFailure, win, margin, outcome };
}

/** The overlay's big line: "4 SUCCESSES · MESSY CRITICAL". */
export function v5Summary(score: V5Score): string {
  const count = `${score.successes} SUCCESS${score.successes === 1 ? "" : "ES"}`;
  const verdict = score.outcome.toUpperCase();
  return verdict.startsWith(String(score.successes)) ? count : `${count} · ${verdict}`;
}

export interface RouseResult {
  /** Every die thrown; the best one counts. */
  dice: number[];
  best: number;
  success: boolean;
  hungerBefore?: number;
  hungerAfter?: number;
  /** Failed at Hunger 5: no more blood to give. */
  atMax: boolean;
  outcome: string;
}

/** `/rouse`, `/rouse 2` (roll two, keep the best), `/rouse h3` (Hunger is 3 now). */
export function parseRouse(input: string): { dice: number; hunger?: number; label: string } | { error: string } {
  let dice: number | undefined;
  let hunger: number | undefined;
  const label: string[] = [];
  for (const word of input.split(/\s+/).filter(Boolean)) {
    const hungerWord = word.match(/^(?:h|hunger)[:=]?(\d)$/i);
    if (hungerWord && hunger === undefined) hunger = Number(hungerWord[1]);
    else if (dice === undefined && /^\d$/.test(word)) dice = Number(word);
    else label.push(word);
  }
  if (dice !== undefined && (dice < 1 || dice > 3)) return { error: "A Rouse check is 1 die, or 2 to 3 when you may reroll it." };
  if (hunger !== undefined && hunger > V5_MAX_HUNGER) return { error: `Hunger goes up to ${V5_MAX_HUNGER}.` };
  return { dice: dice ?? 1, hunger, label: label.join(" ").slice(0, 80) };
}

export function scoreRouse(dice: number[], hunger?: number): RouseResult {
  const best = Math.max(...dice);
  const success = best >= 6;
  const atMax = !success && hunger === V5_MAX_HUNGER;
  const hungerAfter = hunger === undefined ? undefined : success ? hunger : Math.min(V5_MAX_HUNGER, hunger + 1);
  const outcome = success
    ? "No Hunger gained"
    : atMax
      ? "Hunger is already 5: the Beast stirs (hunger frenzy test)"
      : hunger === undefined
        ? "Hunger +1"
        : `Hunger ${hunger} → ${hungerAfter}`;
  return { dice, best, success, hungerBefore: hunger, hungerAfter, atMax, outcome };
}

/**
 * Which normal dice a Willpower reroll may take: distinct, in range, at most
 * three. Hunger dice can never be rerolled.
 */
export function cleanWillpowerPicks(picks: unknown, normalCount: number): number[] | null {
  if (!Array.isArray(picks)) return null;
  const clean = [...new Set(picks)].filter(
    (index): index is number => Number.isInteger(index) && index >= 0 && index < normalCount,
  );
  if (!clean.length || clean.length > V5_WILLPOWER_DICE || clean.length !== picks.length) return null;
  return clean.sort((a, b) => a - b);
}

/** The default picks: up to three failed normal dice, lowest first. */
export function defaultWillpowerPicks(normal: number[]): number[] {
  return normal
    .map((value, index) => ({ value, index }))
    .filter((die) => die.value < 6)
    .sort((a, b) => a.value - b.value)
    .slice(0, V5_WILLPOWER_DICE)
    .map((die) => die.index)
    .sort((a, b) => a - b);
}
