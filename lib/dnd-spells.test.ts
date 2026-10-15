import { describe, expect, it } from "vitest";
import { areaColour, castDice, inArea, rangeFeet, slotsFor, spellArea, type PlacedArea } from "./dnd-spells";

describe("slotsFor", () => {
  it("follows the full caster table", () => {
    expect(slotsFor("Wizard", 1)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(slotsFor("Wizard", 5)).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(slotsFor("Cleric", 20)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  it("gives half casters theirs from 2nd level, artificers from 1st", () => {
    expect(slotsFor("Paladin", 1)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(slotsFor("Paladin", 2)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(slotsFor("Ranger", 5)).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0]);
    expect(slotsFor("Artificer", 1)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("puts a warlock's pact slots at one level", () => {
    expect(slotsFor("Warlock", 1)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(slotsFor("Warlock", 5)).toEqual([0, 0, 2, 0, 0, 0, 0, 0, 0]);
    expect(slotsFor("Warlock", 11)).toEqual([0, 0, 0, 0, 3, 0, 0, 0, 0]);
  });

  it("has none for a fighter", () => {
    expect(slotsFor("Fighter", 10).every((n) => n === 0)).toBe(true);
  });
});

describe("spellArea", () => {
  it("reads the area from the range or the text", () => {
    expect(spellArea("150 ft", "Each creature in a 20-foot-radius sphere centered on that point")).toEqual({ shape: "sphere", size: 20, width: 0, fromSelf: false });
    expect(spellArea("Self (15-foot cone)", "Each creature in a 15-foot cone must")).toEqual({ shape: "cone", size: 15, width: 0, fromSelf: true });
    expect(spellArea("Self (100-foot line)", "A stroke of lightning forming a line 100 feet long and 5 feet wide blasts out")).toEqual({ shape: "line", size: 100, width: 5, fromSelf: true });
    expect(spellArea("Self (15-foot cube)", "A wave of thunderous force sweeps out from you. Each creature in a 15-foot cube originating from you")).toEqual({ shape: "cube", size: 15, width: 0, fromSelf: true });
    expect(spellArea("Self (15-foot radius)", "spirits flit around you to a distance of 15 feet")).toEqual({ shape: "sphere", size: 15, width: 0, fromSelf: true });
    expect(spellArea("120 ft", "You hurl a mote of fire at a creature")).toBeNull();
    expect(spellArea("Touch", "A creature you touch regains hit points")).toBeNull();
  });

  it("knows how far a spell reaches", () => {
    expect(rangeFeet("150 ft")).toBe(150);
    expect(rangeFeet("Self (15-foot cone)")).toBe(0);
    expect(rangeFeet("Touch")).toBe(5);
    expect(rangeFeet("1 mile")).toBe(5280);
    expect(rangeFeet("Sight")).toBeNull();
  });
});

describe("castDice", () => {
  const fireball = { level: 3, higher: "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd." };
  it("adds dice for each slot level above the spell's", () => {
    expect(castDice("8d6", fireball, 3)).toBe("8d6");
    expect(castDice("8d6", fireball, 5)).toBe("10d6");
    expect(castDice("2d8", { level: 1, higher: "the damage increases by 1d6 for each slot level above 1st" }, 3)).toBe("2d8+2d6");
  });

  it("grows a cantrip's dice with the caster's level", () => {
    const fireBolt = { level: 0, description: "This spell's damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10)." };
    expect(castDice("1d10", fireBolt, 0, 4)).toBe("1d10");
    expect(castDice("1d10", fireBolt, 0, 5)).toBe("2d10");
    expect(castDice("1d10", fireBolt, 0, 17)).toBe("4d10");
  });

  it("leaves what it cannot read alone", () => {
    expect(castDice(null, fireball, 3)).toBeNull();
    expect(castDice("1d4+1", { level: 1 }, 1)).toBe("1d4+1");
  });
});

describe("inArea", () => {
  const ft = 0.025;
  const at = (shape: PlacedArea["shape"], extra: Partial<PlacedArea> = {}): PlacedArea => ({ shape, size: 20, width: 5, fromSelf: false, x: 0, z: 0, ox: 0, oz: 1, ...extra });

  it("takes a sphere round its point", () => {
    expect(inArea(at("sphere"), ft, { x: 0.4, z: 0.2 })).toBe(true);
    expect(inArea(at("sphere"), ft, { x: 0.6, z: 0 })).toBe(false);
    expect(inArea(at("sphere"), ft, { x: 0.52, z: 0 }, 0.03)).toBe(true);
  });

  it("opens a cone from the caster towards the target", () => {
    // From (0, 1) towards (0, 0): north. 20 ft = 0.5 m.
    const cone = at("cone", { fromSelf: true, oz: 1 });
    expect(inArea(cone, ft, { x: 0, z: 0.6 })).toBe(true);
    expect(inArea(cone, ft, { x: 0.18, z: 0.6 })).toBe(true);
    expect(inArea(cone, ft, { x: 0.3, z: 0.8 })).toBe(false);
    expect(inArea(cone, ft, { x: 0, z: 1.2 })).toBe(false);
  });

  it("runs a line as long and as wide as it says", () => {
    const line = at("line", { size: 100, fromSelf: true, oz: 1 });
    expect(inArea(line, ft, { x: 0.05, z: -1 })).toBe(true);
    expect(inArea(line, ft, { x: 0.1, z: 0 })).toBe(false);
  });

  it("puts a self cube in front of the caster", () => {
    const cube = at("cube", { size: 15, fromSelf: true, oz: 1 });
    expect(inArea(cube, ft, { x: 0, z: 0.8 })).toBe(true);
    expect(inArea(cube, ft, { x: 0, z: 1.1 })).toBe(false);
  });

  it("colours an area by its damage", () => {
    expect(areaColour("Fire")).toBe("#ff7a1a");
    expect(areaColour(undefined)).toBe("#ffd27a");
  });
});
