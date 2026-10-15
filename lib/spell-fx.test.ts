import { describe, expect, it } from "vitest";
import { fxCount, fxMode, healsWith } from "../app/lib/spell-fx-plan";
import { SPELL_LOOKS } from "../app/components/tabletop-spellfx-looks";
import { sanitizeSpellFx, sanitizeShared } from "./lounge-shared";

const spell = (name: string, range: string, area: boolean) => ({ name, range, area: area ? { shape: "sphere" as const, size: 20, width: 0, fromSelf: false } : null });

describe("fxMode", () => {
  it("aims areas, targets the rest, and goes off at once on yourself", () => {
    expect(fxMode(spell("Fireball", "150 ft", true))).toBe("area");
    expect(fxMode(spell("Fire Bolt", "120 ft", false))).toBe("target");
    expect(fxMode(spell("Cure Wounds", "Touch", false))).toBe("target");
    expect(fxMode(spell("Shield", "Self", false))).toBe("self");
    expect(fxMode(spell("Detect Magic", "Self", false))).toBe("self");
    expect(fxMode(spell("Misty Step", "Self", false))).toBe("target");
  });

  it("throws more darts and rays with a higher slot, more beams with level", () => {
    expect(fxCount("Magic Missile", 1, 1)).toBe(3);
    expect(fxCount("Magic Missile", 3, 5)).toBe(5);
    expect(fxCount("Scorching Ray", 2, 3)).toBe(3);
    expect(fxCount("Eldritch Blast", 0, 5)).toBe(2);
    expect(fxCount("Fireball", 3, 5)).toBe(1);
  });

  it("knows a healing spell", () => {
    expect(healsWith({ description: "A creature you touch regains a number of hit points equal to 1d8" })).toBe(true);
    expect(healsWith({ description: "A bright streak flashes" })).toBe(false);
  });

  it("has its own look for the spells cast most", () => {
    for (const name of ["fireball", "fire bolt", "magic missile", "mage hand", "cure wounds", "eldritch blast", "shield", "misty step", "healing word", "lightning bolt"]) {
      expect(SPELL_LOOKS.has(name)).toBe(true);
    }
    expect(SPELL_LOOKS.size).toBeGreaterThanOrEqual(20);
  });
});

describe("sanitizeSpellFx", () => {
  it("keeps a spell's moment small and on the table", () => {
    expect(sanitizeSpellFx({ spell: "Fireball", from: { x: 9, z: 0 }, to: { x: 0.25, z: -0.1 }, area: { shape: "sphere", size: 20, fromSelf: false }, count: 99, damageType: "Fire" }))
      .toEqual({ spell: "Fireball", from: { x: 2, z: 0 }, to: { x: 0.25, z: -0.1 }, area: { shape: "sphere", size: 20, width: 0, fromSelf: false }, count: 10, damageType: "Fire" });
    expect(sanitizeSpellFx({ spell: "", from: {}, to: {} })).toBeNull();
    expect(sanitizeShared("spellfx", { spell: "Cure Wounds", heals: true }, "Aria", 1)).toMatchObject({ spell: "Cure Wounds", count: 1, heals: true, from: { x: 0, z: 0 } });
  });
});
