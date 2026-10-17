/**
 * A Vampire: The Masquerade 5th edition character at the table: the traits a
 * pool is built from, the Health and Willpower tracks, Hunger, Humanity and
 * the free-text parts. It rides on the player's TableCharacter (`v5`), so the
 * hub keeps and checks it like the D&D sheet. Only trait names are written
 * here; clans, predator types and disciplines are whatever the player types.
 */
import type { DiceRollEvent } from "./protocol";
import { V5_MAX_HUNGER, V5_MAX_POOL } from "./v5-dice";

/** Which game a server plays at its tabletop: which sheet, screen pages and bot name show. */
export type GameSystem = "dnd5e" | "vtm5";
export const GAME_SYSTEMS: GameSystem[] = ["dnd5e", "vtm5"];
export const isGameSystem = (value: unknown): value is GameSystem => value === "dnd5e" || value === "vtm5";

export const V5_ATTRIBUTE_GROUPS = ["Physical", "Social", "Mental"] as const;
/** Three to a group, in V5_ATTRIBUTE_GROUPS order. */
export const V5_ATTRIBUTES = [
  "Strength", "Dexterity", "Stamina",
  "Charisma", "Manipulation", "Composure",
  "Intelligence", "Wits", "Resolve",
] as const;
/** Nine to a group, in V5_ATTRIBUTE_GROUPS order. */
export const V5_SKILLS = [
  "Athletics", "Brawl", "Craft", "Drive", "Firearms", "Larceny", "Melee", "Stealth", "Survival",
  "Animal Ken", "Etiquette", "Insight", "Intimidation", "Leadership", "Performance", "Persuasion", "Streetwise", "Subterfuge",
  "Academics", "Awareness", "Finance", "Investigation", "Medicine", "Occult", "Politics", "Science", "Technology",
] as const;

const STAMINA = 2;
const COMPOSURE = 5;
const RESOLVE = 8;

export const V5_MAX_DOTS = 5;
export const V5_MAX_HUMANITY = 10;
export const V5_MAX_BLOOD_POTENCY = 10;
export const V5_MAX_DISCIPLINES = 12;
export const V5_MAX_EXTRA_HEALTH = 5;

/** Damage on a track: aggravated boxes fill first, then superficial. */
export interface V5Track { superficial: number; aggravated: number }
export interface V5Discipline { name: string; dots: number }

export interface V5Sheet {
  clan: string;
  predator: string;
  /** V5_ATTRIBUTES order, 0-5 (0: not filled in). */
  attributes: number[];
  /** V5_SKILLS order, 0-5. */
  skills: number[];
  disciplines: V5Discipline[];
  health: V5Track;
  willpower: V5Track;
  /** Health boxes past Stamina + 3, from powers or merits. */
  extraHealth: number;
  hunger: number;
  humanity: number;
  /** Stains on Humanity: never more than the empty boxes past it. */
  stains: number;
  bloodPotency: number;
  convictions: string;
  touchstones: string;
}

export function emptyV5Sheet(): V5Sheet {
  return {
    clan: "",
    predator: "",
    attributes: V5_ATTRIBUTES.map(() => 1),
    skills: V5_SKILLS.map(() => 0),
    disciplines: [],
    health: { superficial: 0, aggravated: 0 },
    willpower: { superficial: 0, aggravated: 0 },
    extraHealth: 0,
    hunger: 1,
    humanity: 7,
    stains: 0,
    bloodPotency: 1,
    convictions: "",
    touchstones: "",
  };
}

/** Health boxes: Stamina + 3, and any extra. */
export const healthBoxes = (sheet: Pick<V5Sheet, "attributes" | "extraHealth">) =>
  (sheet.attributes[STAMINA] ?? 0) + 3 + (sheet.extraHealth ?? 0);
/** Willpower boxes: Composure + Resolve. */
export const willpowerBoxes = (sheet: Pick<V5Sheet, "attributes">) =>
  (sheet.attributes[COMPOSURE] ?? 0) + (sheet.attributes[RESOLVE] ?? 0);

/** A track that fits its boxes: aggravated first, superficial in what is left. */
export function clampTrack(track: Partial<V5Track> | undefined, boxes: number): V5Track {
  const whole = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);
  const aggravated = Math.min(boxes, whole(track?.aggravated));
  return { aggravated, superficial: Math.min(boxes - aggravated, whole(track?.superficial)) };
}

/** Every box marked: Impaired (Health: physical pools; Willpower: social and mental). */
export const impaired = (track: V5Track, boxes: number) => boxes > 0 && track.superficial + track.aggravated >= boxes;

/** The boxes of a track, in order: "agg", "sup" or "" for each. */
export function trackBoxes(track: V5Track, boxes: number): Array<"agg" | "sup" | ""> {
  return Array.from({ length: boxes }, (_, i) => (i < track.aggravated ? "agg" : i < track.aggravated + track.superficial ? "sup" : ""));
}

/** Clicking a box turns it empty → superficial → aggravated → empty; the track is then re-counted. */
export function cycleBox(track: V5Track, boxes: number, index: number): V5Track {
  const marks = trackBoxes(track, boxes);
  marks[index] = marks[index] === "" ? "sup" : marks[index] === "sup" ? "agg" : "";
  return {
    aggravated: marks.filter((mark) => mark === "agg").length,
    superficial: marks.filter((mark) => mark === "sup").length,
  };
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const whole = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : fallback;
const dots = (value: unknown, length: number, fallback: number) =>
  Array.from({ length }, (_, i) => whole(Array.isArray(value) ? value[i] : undefined, 0, V5_MAX_DOTS, fallback));

/** A sheet as a client sent it, cleaned and clamped into exactly a V5Sheet. */
export function sanitizeV5Sheet(raw: unknown): V5Sheet {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const attributes = dots(value.attributes, V5_ATTRIBUTES.length, 1);
  const skills = dots(value.skills, V5_SKILLS.length, 0);
  const seen = new Set<string>();
  const disciplines = (Array.isArray(value.disciplines) ? value.disciplines : []).flatMap((entry): V5Discipline[] => {
    if (!entry || typeof entry !== "object") return [];
    const d = entry as Record<string, unknown>;
    const name = text(d.name, 40).trim();
    if (!name || seen.has(name.toLowerCase())) return [];
    seen.add(name.toLowerCase());
    return [{ name, dots: whole(d.dots, 0, V5_MAX_DOTS, 0) }];
  }).slice(0, V5_MAX_DISCIPLINES);
  const extraHealth = whole(value.extraHealth, 0, V5_MAX_EXTRA_HEALTH, 0);
  const humanity = whole(value.humanity, 0, V5_MAX_HUMANITY, 7);
  return {
    clan: text(value.clan, 40).trim(),
    predator: text(value.predator, 40).trim(),
    attributes,
    skills,
    disciplines,
    health: clampTrack(value.health as Partial<V5Track>, healthBoxes({ attributes, extraHealth })),
    willpower: clampTrack(value.willpower as Partial<V5Track>, willpowerBoxes({ attributes })),
    extraHealth,
    hunger: whole(value.hunger, 0, V5_MAX_HUNGER, 1),
    humanity,
    stains: whole(value.stains, 0, V5_MAX_HUMANITY - humanity, 0),
    bloodPotency: whole(value.bloodPotency, 0, V5_MAX_BLOOD_POTENCY, 1),
    convictions: text(value.convictions, 600),
    touchstones: text(value.touchstones, 600),
  };
}

/** A trait picked for a pool: "Strength" at 3, and its group (none for a discipline). */
export interface V5Trait { name: string; dots: number; group?: (typeof V5_ATTRIBUTE_GROUPS)[number] }

/** Every trait on the sheet by name, for picking a pool: attributes, skills, then disciplines. */
export function v5Traits(sheet: V5Sheet): V5Trait[] {
  return [
    ...V5_ATTRIBUTES.map((name, i) => ({ name, dots: sheet.attributes[i] ?? 0, group: V5_ATTRIBUTE_GROUPS[Math.floor(i / 3)] })),
    ...V5_SKILLS.map((name, i) => ({ name, dots: sheet.skills[i] ?? 0, group: V5_ATTRIBUTE_GROUPS[Math.floor(i / 9)] })),
    ...sheet.disciplines.map((d) => ({ name: d.name, dots: d.dots })),
  ];
}

/**
 * Dice off a pool for being Impaired: two when Health is full and a Physical
 * trait is in it, or Willpower is full and a Social or Mental one is.
 */
export function impairedPenalty(sheet: V5Sheet, traits: V5Trait[]): number {
  const body = impaired(sheet.health, healthBoxes(sheet)) && traits.some((t) => t.group === "Physical");
  const mind = impaired(sheet.willpower, willpowerBoxes(sheet)) && traits.some((t) => t.group === "Social" || t.group === "Mental");
  return body || mind ? 2 : 0;
}

/** How many dice a pool of traits throws, after a modifier: never under one, never over the most the roller takes. */
export const v5PoolSize = (traits: V5Trait[], modifier = 0) =>
  Math.max(1, Math.min(V5_MAX_POOL, traits.reduce((sum, trait) => sum + trait.dots, 0) + modifier));

/**
 * The /v command for a pool of traits at the sheet's Hunger: `/v 5 h2 Strength + Brawl`,
 * with ` d3` when a Difficulty is given and the modifier (e.g. -2 Impaired) already counted.
 */
export function v5PoolCommand(traits: V5Trait[], hunger: number, options: { difficulty?: number; modifier?: number } = {}): string {
  const pool = v5PoolSize(traits, options.modifier);
  const h = Math.max(0, Math.min(V5_MAX_HUNGER, Math.round(hunger)));
  const d = options.difficulty && options.difficulty > 0 ? ` d${Math.min(20, Math.round(options.difficulty))}` : "";
  const label = traits.map((trait) => trait.name).join(" + ");
  return `/v ${pool} h${h}${d}${label ? ` ${label}` : ""}`;
}

/** A Rouse check at the sheet's Hunger, so the card says where it goes. */
export const rouseCommand = (hunger: number, label = "") =>
  `/rouse h${Math.max(0, Math.min(V5_MAX_HUNGER, Math.round(hunger)))}${label.trim() ? ` ${label.trim()}` : ""}`;

/** Whether a roll in the call is a Rouse check that failed with room to rise: Hunger goes up one. */
export function rouseRaisesHunger(roll: Pick<DiceRollEvent, "expression" | "summary">): boolean {
  return roll.expression.startsWith("Rouse check") && /HUNGER \+1/.test(roll.summary ?? "");
}

const pips = (filled: number, of: number) => "●".repeat(Math.max(0, filled)) + "○".repeat(Math.max(0, of - filled));
const boxLine = (track: V5Track, boxes: number) =>
  trackBoxes(track, boxes).map((mark) => (mark === "agg" ? "X" : mark === "sup" ? "/" : "□")).join("");

/** The sheet written out for the "My character" screen page, read across the table. */
export function v5ScreenLines(sheet: V5Sheet): string[] {
  const hp = healthBoxes(sheet);
  const wp = willpowerBoxes(sheet);
  const group = (from: number) => V5_ATTRIBUTES.slice(from, from + 3).map((name, i) => `${name.slice(0, 3)} ${sheet.attributes[from + i]}`).join(" · ");
  // One line of skills per group: a single line would run past what the panel can wrap.
  const skills = V5_ATTRIBUTE_GROUPS.flatMap((name, g) => {
    const known = V5_SKILLS.slice(g * 9, g * 9 + 9).flatMap((skill, i) => (sheet.skills[g * 9 + i] ? [`${skill} ${sheet.skills[g * 9 + i]}`] : []));
    return known.length ? [`${name} skills: ${known.join(", ")}`] : [];
  });
  const disciplines = sheet.disciplines.filter((d) => d.dots > 0).map((d) => `${d.name} ${d.dots}`);
  return [
    [sheet.clan, sheet.predator].filter(Boolean).join(" · "),
    `Hunger: ${pips(sheet.hunger, V5_MAX_HUNGER)}`,
    `Health: ${boxLine(sheet.health, hp)}${impaired(sheet.health, hp) ? " Impaired" : ""}`,
    `Willpower: ${boxLine(sheet.willpower, wp)}${impaired(sheet.willpower, wp) ? " Impaired" : ""}`,
    `Humanity: ${sheet.humanity}${sheet.stains ? ` (${sheet.stains} stain${sheet.stains === 1 ? "" : "s"})` : ""} · BP ${sheet.bloodPotency}`,
    `Physical: ${group(0)}`,
    `Social: ${group(3)}`,
    `Mental: ${group(6)}`,
    ...skills,
    disciplines.length ? `Disciplines: ${disciplines.join(", ")}` : "",
  ].filter(Boolean);
}
