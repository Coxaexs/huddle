/**
 * The inside of the game master's screen at the tabletop: three panels, each
 * showing a page the game master picked. Only their own view draws them; to
 * everyone else the screen is plain wood on that side. The choice and the
 * notes stay in this browser.
 */
import type { Initiative } from "@/lib/lounge-shared";
import type { ScreenPage } from "../components/tabletop-extras";

export type ScreenPageId = "initiative" | "party" | "conditions" | "rules" | "notes" | "rolls" | "blank";

export const SCREEN_PAGES: Array<{ id: ScreenPageId; label: string }> = [
  { id: "initiative", label: "Initiative order" },
  { id: "party", label: "Who is playing whom" },
  { id: "conditions", label: "Conditions" },
  { id: "rules", label: "DCs, cover and rules" },
  { id: "notes", label: "My notes" },
  { id: "rolls", label: "My hidden rolls" },
  { id: "blank", label: "Nothing" },
];

export const DEFAULT_SCREEN: ScreenPageId[] = ["initiative", "conditions", "notes"];
const CHOICE_KEY = "huddle-gm-screen";
const NOTES_KEY = "huddle-gm-notes";

const isPageId = (value: unknown): value is ScreenPageId => SCREEN_PAGES.some((page) => page.id === value);

export function readScreenChoice(): ScreenPageId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CHOICE_KEY) || "null") as unknown;
    if (Array.isArray(raw) && raw.length === 3 && raw.every(isPageId)) return raw;
  } catch {
    // Nothing stored, or storage is off.
  }
  return [...DEFAULT_SCREEN];
}

export function saveScreenChoice(choice: ScreenPageId[]) {
  try { localStorage.setItem(CHOICE_KEY, JSON.stringify(choice)); } catch { /* Session only. */ }
}

export function readNotes(): string {
  try { return localStorage.getItem(NOTES_KEY) || ""; } catch { return ""; }
}

export function saveNotes(text: string) {
  try { localStorage.setItem(NOTES_KEY, text.slice(0, 2000)); } catch { /* Session only. */ }
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

export interface ScreenData {
  initiative: Initiative | null;
  /** Characters at the table: character name and who plays it. */
  party: Array<{ character: string; player: string }>;
  notes: string;
  /** Newest first, e.g. "1d20+3 = 17". */
  rolls: string[];
}

export function buildScreenPage(id: ScreenPageId, data: ScreenData): ScreenPage | null {
  switch (id) {
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
    case "notes": {
      const lines = data.notes.split("\n").map((line) => line.trimEnd()).filter((line, i, all) => line || (i > 0 && all[i - 1]));
      return { title: "Notes", lines: lines.length ? lines : ["Write your notes in the Game master panel."] };
    }
    case "rolls":
      return { title: "Hidden rolls", lines: data.rolls.length ? data.rolls.slice(0, 14) : ["Roll with Hidden on and the results land here."] };
    case "blank":
      return null;
  }
}
