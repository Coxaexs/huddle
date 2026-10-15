/**
 * How a spell is cast at the tabletop: on yourself (it goes off at once), at
 * a target (click a pawn or a spot), or over an area (aim its outline), and
 * how many darts, rays or beams it throws.
 */
import type { SpellInfo } from "@/lib/dnd-spells";

export type FxMode = "self" | "target" | "area";

/** Spells with a range of more than Self that still only touch their caster. */
const ON_SELF = new Set(["shield", "mage armor", "blur", "mirror image", "haste", "expeditious retreat", "false life", "armor of agathys"]);
/** Self-range spells that go somewhere: Misty Step's destination. */
const GOES_SOMEWHERE = new Set(["misty step", "dimension door", "thunder step"]);

export function fxMode(spell: Pick<SpellInfo, "name" | "range" | "area">): FxMode {
  const name = spell.name.toLowerCase();
  if (GOES_SOMEWHERE.has(name)) return "target";
  if (spell.area) return "area";
  if (ON_SELF.has(name) || /^\s*self/i.test(spell.range)) return "self";
  return "target";
}

/** Darts, rays or beams: more with a higher slot, or (Eldritch Blast) with the caster's level. */
export function fxCount(name: string, slotLevel: number, characterLevel: number): number {
  switch (name.toLowerCase()) {
    case "magic missile": return 3 + Math.max(0, slotLevel - 1);
    case "scorching ray": return 3 + Math.max(0, slotLevel - 2);
    case "eldritch blast": return characterLevel >= 17 ? 4 : characterLevel >= 11 ? 3 : characterLevel >= 5 ? 2 : 1;
    default: return 1;
  }
}

/** Whether a spell heals (its generic look is then green and gold). */
export const healsWith = (spell: Pick<SpellInfo, "description">) => /regains? (?:a number of )?hit points/i.test(spell.description);
