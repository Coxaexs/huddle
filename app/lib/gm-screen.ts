/**
 * The insides of the screens at the tabletop. The game master's has three to
 * five panels, each showing a page they picked; only their own view draws
 * them, and to everyone else that side is plain wood. Each player can keep a
 * little screen of their own (their character, notes, rolls), drawn in their
 * view only. The choices and notes stay in this browser; the character is
 * the table's (lounge-shared). A Vampire table (the server's game system)
 * swaps the D&D reference pages for its own.
 */
import type { Initiative, TableCharacter } from "@/lib/lounge-shared";
import { V5_MAX_HUNGER, V5_WILLPOWER_DICE } from "@/lib/v5-dice";
import { v5ScreenLines, type GameSystem, type V5Sheet } from "@/lib/v5-sheet";
import type { ScreenPage } from "../components/tabletop-extras";

export type ScreenPageId = "character" | "initiative" | "party" | "conditions" | "rules" | "hunger" | "difficulty" | "notes" | "rolls" | "blank";

/** Pages without a system show at every table. */
export const SCREEN_PAGES: Array<{ id: ScreenPageId; label: string; system?: GameSystem }> = [
  { id: "character", label: "My character" },
  { id: "initiative", label: "Initiative order" },
  { id: "party", label: "Who is playing whom" },
  { id: "conditions", label: "Conditions", system: "dnd5e" },
  { id: "rules", label: "DCs, cover and rules", system: "dnd5e" },
  { id: "hunger", label: "Everyone's Hunger", system: "vtm5" },
  { id: "difficulty", label: "Difficulties and dice", system: "vtm5" },
  { id: "notes", label: "My notes" },
  { id: "rolls", label: "My hidden rolls" },
  { id: "blank", label: "Nothing" },
];

/** Each system's page in the other's place, so a screen set up for one game shows the other's. */
const SWAPS: Array<[ScreenPageId, ScreenPageId]> = [["conditions", "hunger"], ["rules", "difficulty"]];

/** The page a panel shows at a table playing `system`: a D&D page becomes its Vampire twin, and back. */
export function pageForSystem(id: ScreenPageId, system: GameSystem): ScreenPageId {
  for (const [dnd, vtm] of SWAPS) {
    if (system === "vtm5" && id === dnd) return vtm;
    if (system === "dnd5e" && id === vtm) return dnd;
  }
  return id;
}

/** Whose screen: the game master's, or a player's own. */
export type ScreenRole = "gm" | "player";

/** How many panels each screen may have, and what it starts with. */
export const SCREEN_SIZES: Record<ScreenRole, { min: number; max: number; first: ScreenPageId[]; extra: ScreenPageId[] }> = {
  gm: { min: 3, max: 5, first: ["initiative", "conditions", "notes"], extra: ["rolls", "party"] },
  player: { min: 2, max: 4, first: ["character", "notes", "rolls"], extra: ["conditions"] },
};
/** The pages each kind of screen offers at a table playing `system` ("My character" is a player's). */
export const pagesFor = (role: ScreenRole, system: GameSystem = "dnd5e") =>
  SCREEN_PAGES.filter((page) => (role === "player" || page.id !== "character") && (!page.system || page.system === system));

/** The screen at a given panel count: pages kept as far as they go, new panels filled with something useful. */
export function resizeChoice(role: ScreenRole, choice: ScreenPageId[], count: number, system: GameSystem = "dnd5e"): ScreenPageId[] {
  const { first, extra } = SCREEN_SIZES[role];
  const pool = [...first, ...extra].map((id) => pageForSystem(id, system)).filter((id) => !choice.includes(id));
  const next = choice.slice(0, count);
  while (next.length < count) next.push(pool.shift() ?? "blank");
  return next;
}

const store = (key: string) => `huddle-${key}`;
const CHOICE_KEY: Record<ScreenRole, string> = { gm: store("gm-screen"), player: store("player-screen") };
const NOTES_KEY: Record<ScreenRole, string> = { gm: store("gm-notes"), player: store("player-notes") };
const OPEN_KEY = store("player-screen-open");
const SHEET_KEY = store("player-sheet");

const isPageId = (value: unknown): value is ScreenPageId => SCREEN_PAGES.some((page) => page.id === value);

export function readScreenChoice(role: ScreenRole): ScreenPageId[] {
  const { min, max, first } = SCREEN_SIZES[role];
  try {
    const raw = JSON.parse(localStorage.getItem(CHOICE_KEY[role]) || "null") as unknown;
    if (Array.isArray(raw) && raw.length >= min && raw.length <= max && raw.every(isPageId)) return raw;
  } catch {
    // Nothing stored, or storage is off.
  }
  return [...first];
}

export function saveScreenChoice(role: ScreenRole, choice: ScreenPageId[]) {
  try { localStorage.setItem(CHOICE_KEY[role], JSON.stringify(choice)); } catch { /* Session only. */ }
}

export function readNotes(role: ScreenRole): string {
  try { return localStorage.getItem(NOTES_KEY[role]) || ""; } catch { return ""; }
}

export function saveNotes(role: ScreenRole, text: string) {
  try { localStorage.setItem(NOTES_KEY[role], text.slice(0, 2000)); } catch { /* Session only. */ }
}

/** Whether my own screen stands in front of my chair (it does until I put it away). */
export function readPlayerScreenOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) !== "0"; } catch { return true; }
}

export function savePlayerScreenOpen(open: boolean) {
  try { localStorage.setItem(OPEN_KEY, open ? "1" : "0"); } catch { /* Session only. */ }
}

/** The few numbers a player glances at: written as they like ("Rogue 3", "18/24"). */
export interface CharacterSheet { level: string; hp: string; ac: string; speed: string; abilities: string[] }
export const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
export const EMPTY_SHEET: CharacterSheet = { level: "", hp: "", ac: "", speed: "", abilities: ["", "", "", "", "", ""] };

export function readSheet(): CharacterSheet {
  try {
    const raw = JSON.parse(localStorage.getItem(SHEET_KEY) || "null") as Partial<CharacterSheet> | null;
    if (raw && typeof raw === "object") {
      const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 40) : "");
      const abilities = ABILITIES.map((_, i) => text(Array.isArray(raw.abilities) ? raw.abilities[i] : ""));
      return { level: text(raw.level), hp: text(raw.hp), ac: text(raw.ac), speed: text(raw.speed), abilities };
    }
  } catch {
    // Nothing stored, or storage is off.
  }
  return { ...EMPTY_SHEET, abilities: [...EMPTY_SHEET.abilities] };
}

/** The sheet this browser kept before characters lived at the table, or null when there was none. */
export function readLegacySheet(): CharacterSheet | null {
  const sheet = readSheet();
  return sheet.level || sheet.hp || sheet.ac || sheet.speed || sheet.abilities.some(Boolean) ? sheet : null;
}

const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/** A character at the table, written out for the "My character" page. */
export function sheetOf(character: TableCharacter): { sheet: CharacterSheet; extra: string[] } {
  const slots = character.slots ?? [];
  const used = character.used ?? [];
  const left = slots.flatMap((n, i) => (n ? [`${ordinal(i + 1)} ${n - (used[i] ?? 0)}/${n}`] : []));
  return {
    sheet: {
      level: [character.cls, character.level].filter(Boolean).join(" "),
      hp: character.maxHp ? `${character.hp ?? character.maxHp}/${character.maxHp}` : "",
      ac: character.ac !== undefined ? String(character.ac) : "",
      speed: character.speed !== undefined ? `${character.speed} ft` : "",
      abilities: (character.abilities ?? []).map((n) => (n ? String(n) : "")).concat(["", "", "", "", "", ""]).slice(0, 6),
    },
    extra: [
      ...(left.length ? [`Slots: ${left.join(" · ")}`] : []),
      ...(character.spells?.length ? [`Spells: ${character.spells.join(", ")}`] : []),
    ],
  };
}

/** "16 (+3)": a score with its modifier, or as written when it is not a number. */
function ability(score: string): string {
  const n = Number(score.trim());
  if (!score.trim() || !Number.isFinite(n)) return score.trim() || "-";
  const mod = Math.floor((n - 10) / 2);
  return `${n} (${mod >= 0 ? "+" : ""}${mod})`;
}

const CONDITIONS = [
  "Blinded: attacks vs it adv., its attacks disadv.",
  "Charmed: can't harm the charmer",
  "Deafened: can't hear",
  "Frightened: disadv. while source in sight, can't approach",
  "Grappled: speed 0",
  "Incapacitated: no actions or reactions",
  "Invisible: attacks vs it disadv., its attacks adv.",
  "Paralyzed: fails Str/Dex saves, hits in 5 ft crit",
  "Petrified: stone, resists all damage",
  "Poisoned: disadv. on attacks and checks",
  "Prone: melee vs it adv., ranged disadv.",
  "Restrained: speed 0, attacks vs it adv.",
  "Stunned: fails Str/Dex saves, attacks vs it adv.",
  "Unconscious: prone, hits in 5 ft crit",
];

const RULES = [
  "DC: 5 very easy · 10 easy · 15 medium",
  "DC: 20 hard · 25 very hard · 30 nearly impossible",
  "Half cover: +2 AC and Dex saves",
  "3/4 cover: +5 AC and Dex saves",
  "Dim light: disadv. on sight Perception",
  "Falling: 1d6 per 10 ft, max 20d6",
  "Long jump: Str score in ft with a run",
  "High jump: 3 + Str mod ft with a run",
  "Breath: 1 + Con mod minutes",
  "Travel: fast 4 mph (-5 passive Perception)",
  "Travel: normal 3 mph · slow 2 mph (can sneak)",
  "Short rest: 1 h, spend Hit Dice",
];

/** Difficulties as the Storyteller sets them, and the dice rules played every scene. */
const V5_DIFFICULTIES = [
  "1: routine",
  "2: straightforward",
  "3: moderate",
  "4: challenging",
  "5: hard",
  "6 and up: very hard to nearly impossible",
  "Success: each die 6-10; ties win",
  "Critical: each pair of 10s adds 2 more",
  "Messy critical: a Hunger 10 in the pair",
  "Bestial failure: a fail with a Hunger 1",
  `Willpower: reroll up to ${V5_WILLPOWER_DICE} normal dice, once`,
  "Rouse: 6+ keeps Hunger, else Hunger +1",
  "Impaired: −2 dice, physical pools when Health is full, social and mental when Willpower is",
];

const hungerPips = (hunger: number) => "●".repeat(hunger) + "○".repeat(V5_MAX_HUNGER - hunger);

export interface ScreenData {
  /** The player's own character and sheet (a player's screen only); `v5` at a Vampire table. */
  character?: { name: string; portraitUrl: string | null; sheet: CharacterSheet; extra?: string[]; v5?: V5Sheet } | null;
  /** The game the table plays: which sheet "My character" shows. */
  system?: GameSystem;
  /** Each Vampire at the table and their Hunger. */
  hunger?: Array<{ character: string; player: string; hunger: number }>;
  initiative: Initiative | null;
  /** Characters at the table: character name and who plays it. */
  party: Array<{ character: string; player: string }>;
  notes: string;
  /** The game master's hidden rolls or a player's own: newest first, e.g. "1d20+3 = 17", and what to say with none. */
  rolls: { title: string; lines: string[]; empty: string };
}

export function buildScreenPage(id: ScreenPageId, data: ScreenData): ScreenPage | null {
  switch (id) {
    case "character": {
      const me = data.character;
      if (data.system === "vtm5") {
        if (!me?.v5) return { title: "My character", lines: ["Make your Vampire with the person button: clan, Attributes, Skills, Disciplines."] };
        return { title: me.name, image: me.portraitUrl, lines: v5ScreenLines(me.v5) };
      }
      if (!me) return { title: "My character", lines: ["Make one with the person button: a name, class and level, and your spells."] };
      const sheet = me.sheet;
      const pairs = [0, 2, 4].map((i) => `${ABILITIES[i]} ${ability(sheet.abilities[i])} · ${ABILITIES[i + 1]} ${ability(sheet.abilities[i + 1])}`);
      const lines = [
        sheet.level && `Class: ${sheet.level}`,
        sheet.hp && `HP: ${sheet.hp}`,
        sheet.ac && `AC: ${sheet.ac}`,
        sheet.speed && `Speed: ${sheet.speed}`,
        ...(sheet.abilities.some((a) => a.trim()) ? pairs : []),
        ...(me.extra ?? []),
      ].filter((line): line is string => Boolean(line));
      return { title: me.name, image: me.portraitUrl, lines: lines.length ? lines : ["Your sheet is empty: fill it in with the person button."] };
    }
    case "initiative": {
      const order = data.initiative;
      if (!order) return { title: "Initiative", lines: ["No combat yet.", "Players roll theirs from the Initiative panel; add monsters there."] };
      return {
        title: `Initiative · round ${order.round}`,
        lines: order.entries.map((entry, index) => `${index === order.turn ? "▶ " : ""}${entry.value}: ${entry.name}`),
      };
    }
    case "party":
      return {
        title: "The party",
        lines: data.party.length ? data.party.map((p) => `${p.character}: ${p.player}`) : ["Nobody has made a character yet (the person button)."],
      };
    case "conditions":
      return { title: "Conditions", lines: CONDITIONS };
    case "rules":
      return { title: "DCs and rules", lines: RULES };
    case "hunger": {
      const rows = [...(data.hunger ?? [])].sort((a, b) => b.hunger - a.hunger || a.character.localeCompare(b.character));
      return {
        title: "Hunger",
        lines: rows.length
          ? rows.map((row) => `${row.character}: ${hungerPips(row.hunger)} ${row.hunger}${row.hunger >= 4 ? " · close to the Beast" : ""}`)
          : ["No Vampire sheets at the table yet (the person button)."],
      };
    }
    case "difficulty":
      return { title: "Difficulty", lines: V5_DIFFICULTIES };
    case "notes": {
      const lines = data.notes.split("\n").map((line) => line.trimEnd()).filter((line, i, all) => line || (i > 0 && all[i - 1]));
      return { title: "Notes", lines: lines.length ? lines : ["Write your notes in the panel that set up this screen."] };
    }
    case "rolls":
      return { title: data.rolls.title, lines: data.rolls.lines.length ? data.rolls.lines.slice(0, 14) : [data.rolls.empty] };
    case "blank":
      return null;
  }
}
