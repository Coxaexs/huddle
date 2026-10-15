/**
 * The bits of D&D 5e the tabletop does sums with: spell slots by class and
 * level, the area a spell covers (read from its range and text), its damage
 * dice at the slot it is cast with, and who stands inside an area.
 */

export const CLASSES = [
  "Artificer", "Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk",
  "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard",
] as const;

/** Full casters' slots at each character level (1-20), 1st- to 9th-level. */
const FULL: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const nine = (slots: number[]) => Array.from({ length: 9 }, (_, i) => slots[i] ?? 0);

/**
 * Spell slots (1st to 9th level) for a class at a level: full casters by the
 * table, paladins and rangers from 2nd level at half, artificers at half from
 * 1st, warlocks' pact slots all at one level. Anyone else has none.
 */
export function slotsFor(cls: string, level: number): number[] {
  const lv = Math.max(1, Math.min(20, Math.floor(level) || 1));
  switch (cls) {
    case "Bard": case "Cleric": case "Druid": case "Sorcerer": case "Wizard":
      return nine(FULL[lv - 1]);
    case "Paladin": case "Ranger":
      return lv < 2 ? nine([]) : nine(FULL[Math.ceil(lv / 2) - 1]);
    case "Artificer":
      return nine(FULL[Math.ceil(lv / 2) - 1]);
    case "Warlock": {
      const count = lv === 1 ? 1 : lv <= 10 ? 2 : lv <= 16 ? 3 : 4;
      const at = Math.min(5, Math.ceil(lv / 2));
      return nine(Array.from({ length: at }, (_, i) => (i === at - 1 ? count : 0)));
    }
    default:
      return nine([]);
  }
}

export type AreaShape = "sphere" | "cone" | "line" | "cube";

/** What the table needs to cast a spell: level, range, area, save, damage and how it grows. */
export interface SpellInfo {
  name: string;
  level: number;
  school: string;
  range: string;
  concentration: boolean;
  area: SpellArea | null;
  save: string | null;
  damageType: string | null;
  dice: string | null;
  higher: string;
  /** Its text (the start of it), shown on the card and read for a cantrip's growth. */
  description: string;
}


/** What a spell covers, in feet; `fromSelf` areas start at (or surround) the caster. */
export interface SpellArea { shape: AreaShape; size: number; width: number; fromSelf: boolean }

/**
 * The area a spell covers, from its range ("Self (15-foot cone)") or its
 * text ("a 20-foot-radius sphere centered on that point"); null for a spell
 * with no area (a bolt, a touch).
 */
export function spellArea(range: string, description: string): SpellArea | null {
  const self = /^\s*self\s*\(([^)]*)\)/i.exec(range);
  const read = (text: string): Omit<SpellArea, "fromSelf"> | null => {
    let m = /line (\d+) feet long and (\d+) feet wide/i.exec(text) ?? /(\d+)-foot[- ]long,? (\d+)-foot[- ]wide line/i.exec(text);
    if (m) return { shape: "line", size: Number(m[1]), width: Number(m[2]) };
    m = /(\d+)-foot[- ]line/i.exec(text);
    if (m) return { shape: "line", size: Number(m[1]), width: 5 };
    m = /(\d+)-foot[- ]cone/i.exec(text);
    if (m) return { shape: "cone", size: Number(m[1]), width: 0 };
    m = /(\d+)-foot[- ](?:cube|square)/i.exec(text);
    if (m) return { shape: "cube", size: Number(m[1]), width: 0 };
    m = /(\d+)-foot[- ]radius/i.exec(text);
    if (m) return { shape: "sphere", size: Number(m[1]), width: 0 };
    return null;
  };
  if (self) {
    const inRange = read(self[1]);
    if (inRange) return { ...inRange, width: inRange.shape === "line" ? (read(description)?.width ?? inRange.width) : inRange.width, fromSelf: true };
  }
  const area = read(description);
  return area ? { ...area, fromSelf: Boolean(self) } : null;
}

/** How far a spell reaches in feet: 0 for Self, 5 for Touch, null when it is not a distance (Sight, Unlimited). */
export function rangeFeet(range: string): number | null {
  if (/^\s*self/i.test(range)) return 0;
  if (/^\s*touch/i.test(range)) return 5;
  const feet = /(\d[\d,]*)\s*(?:ft|feet|foot)/i.exec(range);
  if (feet) return Number(feet[1].replace(/,/g, ""));
  const miles = /(\d+)\s*mile/i.exec(range);
  return miles ? Number(miles[1]) * 5280 : null;
}

/**
 * The dice to roll for a spell cast with a slot of `slotLevel`: the base dice
 * plus the "for each slot level above" extra, or a cantrip's dice at the
 * caster's level (more at 5th, 11th and 17th).
 */
export function castDice(base: string | null | undefined, spell: { level: number; higher?: string; description?: string }, slotLevel: number, characterLevel = 1): string | null {
  const m = /^\s*(\d+)d(\d+)(\s*[+-]\s*\d+)?\s*$/i.exec(base ?? "");
  if (!m) return base?.trim() || null;
  let count = Number(m[1]);
  const sides = Number(m[2]);
  const bonus = (m[3] ?? "").replace(/\s+/g, "");
  let extra = "";
  if (spell.level === 0) {
    if (/when you reach 5th level/i.test(spell.description ?? "") || /cantrip upgrade/i.test(spell.higher ?? "")) {
      count *= characterLevel >= 17 ? 4 : characterLevel >= 11 ? 3 : characterLevel >= 5 ? 2 : 1;
    }
  } else {
    const above = Math.max(0, slotLevel - spell.level);
    const up = /increases by (\d+)d(\d+) for each (?:spell )?slot level above/i.exec(spell.higher ?? "");
    if (up && above) {
      if (Number(up[2]) === sides) count += Number(up[1]) * above;
      else extra = `+${Number(up[1]) * above}d${up[2]}`;
    }
  }
  return `${count}d${sides}${extra}${bonus}`;
}

/** An area on the table: sizes in feet, places in metres from the table's centre. */
export interface PlacedArea { shape: AreaShape; size: number; width: number; fromSelf: boolean; x: number; z: number; ox: number; oz: number }

/** Which way an area points: from its origin to its target (north when they meet). */
export function areaDirection(area: Pick<PlacedArea, "x" | "z" | "ox" | "oz">): { x: number; z: number } {
  const dx = area.x - area.ox;
  const dz = area.z - area.oz;
  const length = Math.hypot(dx, dz);
  return length > 1e-6 ? { x: dx / length, z: dz / length } : { x: 0, z: -1 };
}

/** The middle of a sphere or cube (cones and lines grow from their origin). */
export function areaCentre(area: PlacedArea, metresPerFoot: number): { x: number; z: number } {
  if (area.shape === "sphere") return area.fromSelf ? { x: area.ox, z: area.oz } : { x: area.x, z: area.z };
  if (area.shape === "cube" && area.fromSelf) {
    const d = areaDirection(area);
    const half = (area.size * metresPerFoot) / 2;
    return { x: area.ox + d.x * half, z: area.oz + d.z * half };
  }
  return { x: area.x, z: area.z };
}

/**
 * Whether a point is in an area. `pad` (metres) counts a creature as in when
 * any part of its base is, as the rules have it.
 */
export function inArea(area: PlacedArea, metresPerFoot: number, point: { x: number; z: number }, pad = 0): boolean {
  const size = area.size * metresPerFoot;
  if (area.shape === "sphere") {
    const c = areaCentre(area, metresPerFoot);
    return Math.hypot(point.x - c.x, point.z - c.z) <= size + pad;
  }
  const d = areaDirection(area);
  const from = area.shape === "cube" ? areaCentre(area, metresPerFoot) : { x: area.ox, z: area.oz };
  const vx = point.x - from.x;
  const vz = point.z - from.z;
  const along = vx * d.x + vz * d.z;
  const across = Math.abs(vx * d.z - vz * d.x);
  if (area.shape === "cube") return Math.abs(along) <= size / 2 + pad && across <= size / 2 + pad;
  if (along < -pad || along > size + pad) return false;
  if (area.shape === "line") return across <= (area.width * metresPerFoot) / 2 + pad;
  // A cone is as wide as it is far from where it starts.
  return across <= Math.max(0, along) / 2 + pad;
}

/** Colours for the areas on the map, by damage type. */
export const DAMAGE_COLOURS: Record<string, string> = {
  fire: "#ff7a1a", cold: "#6cc8ff", lightning: "#b49bff", thunder: "#8fa8ff", acid: "#9be15d", poison: "#6fd86f",
  necrotic: "#a07cff", radiant: "#ffe27a", force: "#e879f9", psychic: "#f472b6",
};
export const areaColour = (damageType: string | undefined) => DAMAGE_COLOURS[(damageType ?? "").toLowerCase().split(/[\s,]/)[0]] ?? "#ffd27a";
