import { describe, expect, it } from "vitest";
import { companionInitiative, companionRoll, layCompanionPawns, placeCompanionPawn, rollFaces, sanitizeCompanionPawn, tableInitiative } from "./dnd-table";

const roller = { id: "u1", displayName: "Thorin" };

describe("companionRoll", () => {
  it("shows the companion's own faces", () => {
    const roll = companionRoll(roller, { expression: "2d6+3", sides: 6, values: [4, 2], modifier: 3, total: 9 });
    expect(roll?.dice).toEqual([{ sides: 6, rolls: [{ value: 4, kept: true }, { value: 2, kept: true }], sign: 1 }]);
    expect(roll?.total).toBe(9);
    expect(roll?.modifier).toBe(3);
    expect(roll?.roller).toEqual(roller);
    expect(roll?.rollType).toBe("normal");
  });

  it("drops faces a die cannot show", () => {
    const roll = companionRoll(roller, { expression: "1d20", sides: 20, values: [0, 21, 17, 2.7], modifier: 0, total: 17 });
    expect(roll?.dice[0].rolls.map((r) => r.value)).toEqual([17, 2]);
  });

  it("refuses rolls with nothing to throw", () => {
    expect(companionRoll(roller, { expression: "1d1", sides: 1, values: [1], modifier: 0, total: 1 })).toBeNull();
    expect(companionRoll(roller, { expression: "1d20", sides: 20, values: [], modifier: 0, total: 0 })).toBeNull();
  });
});

describe("rollFaces", () => {
  it("keeps only the kept dice, signed", () => {
    expect(
      rollFaces({
        expression: "1d20kh1-1d4",
        dice: [
          { sides: 20, rolls: [{ value: 3, kept: false }, { value: 18, kept: true }], sign: 1 },
          { sides: 4, rolls: [{ value: 2, kept: true }], sign: -1 },
        ],
        modifier: 0,
        total: 16,
        roller,
        rollType: "advantage",
        animationSeed: "x",
      }),
    ).toEqual([
      { sides: 20, values: [18] },
      { sides: 4, values: [-2] },
    ]);
  });
});

describe("companion pawns", () => {
  const goblin = { id: "dnd-t7", kind: "beast" as const, colour: "#b84a3c", x: 0.4, z: -0.2, label: "Goblin", owner: "gm", ownerName: "Mewis", maxHp: 7, hp: 5 };
  const hero = { id: "dnd-t3", kind: "wizard" as const, colour: "#5b8def", x: 0.1, z: 0.6, label: "Metis", owner: "u1", ownerName: "Ann", hero: true };
  const theirs = { id: "abcd1234", kind: "rogue" as const, colour: "#123456", x: -1, z: 0, facing: 1, label: "", owner: "u1", ownerName: "Ann", at: 1, hero: true };

  it("cleans what the companion sends", () => {
    const pawn = sanitizeCompanionPawn({ id: "dnd-t7", kind: "owlbear", colour: "red", x: 5, z: 0, label: "  A very long goblin name indeed  ", maxHp: 7, hp: 99 }, "gm", "Mewis");
    expect(pawn?.kind).toBe("fighter");
    expect(pawn?.colour).toBe("#c9a45c");
    expect(pawn?.x).toBeCloseTo(1.2);
    expect(pawn?.label.length).toBeLessThanOrEqual(24);
    expect(pawn?.hp).toBe(7);
    expect(sanitizeCompanionPawn({ id: "x", x: 0, z: 0 }, "gm", "Mewis")).toBeNull();
    expect(sanitizeCompanionPawn({ id: "dnd-t1", x: Number.NaN, z: 0 }, "gm", "Mewis")).toBeNull();
    // A hero's hit points live on their character card, not the pawn.
    expect(sanitizeCompanionPawn({ ...hero, maxHp: 20 }, "u1", "Ann")?.maxHp).toBeUndefined();
  });

  it("stands a monster under the token's id, with its hit points", () => {
    const { pawns, id } = placeCompanionPawn({}, goblin, 5);
    expect(id).toBe("dnd-t7");
    expect(pawns["dnd-t7"]).toMatchObject({ owner: "gm", hp: 5, maxHp: 7, label: "Goblin", at: 5 });
    expect(pawns["dnd-t7"].hero).toBeUndefined();
  });

  it("moves a player's own hero pawn instead of adding a second one", () => {
    const { pawns, id } = placeCompanionPawn({ [theirs.id]: theirs }, hero, 9);
    expect(id).toBe("abcd1234");
    expect(Object.keys(pawns)).toEqual(["abcd1234"]);
    expect(pawns.abcd1234).toMatchObject({ x: 0.1, z: 0.6, kind: "rogue", colour: "#123456", at: 9 });
  });

  it("lays out a whole map, keeping heroes of players the map has no token for", () => {
    const other = { ...theirs, id: "efgh5678", owner: "u2" };
    const stray = { ...theirs, id: "monster1", owner: "gm", hero: undefined };
    const { pawns, ids } = layCompanionPawns({ [theirs.id]: theirs, [other.id]: other, [stray.id]: stray }, [goblin, hero], 3);
    expect(Object.keys(pawns).sort()).toEqual(["abcd1234", "dnd-t7", "efgh5678"]);
    expect(ids).toEqual({ "dnd-t7": "dnd-t7", "dnd-t3": "abcd1234" });
  });
});

describe("shared initiative", () => {
  it("puts the turn marker on the owner's chair at the table", () => {
    const value = { entries: [{ id: "c1", name: "Metis", value: 18, owner: "u1" }, { id: "m1", name: "Goblin", value: 12 }], turn: 1, round: 2 };
    expect(tableInitiative(value, (owner) => (owner === "u1" ? "conn-1" : undefined))).toEqual({
      entries: [{ id: "c1", name: "Metis", value: 18, connectionId: "conn-1" }, { id: "m1", name: "Goblin", value: 12 }],
      turn: 1,
      round: 2,
    });
  });

  it("names the people in the table's chairs for the companion", () => {
    const init = { entries: [{ id: "p-conn-1", name: "Metis", value: 18, connectionId: "conn-1" }, { id: "g", name: "Goblin", value: 3 }], turn: 0, round: 1 };
    expect(companionInitiative(init, (c) => (c === "conn-1" ? "u1" : undefined))).toEqual({
      entries: [{ id: "p-conn-1", name: "Metis", value: 18, owner: "u1" }, { id: "g", name: "Goblin", value: 3 }],
      turn: 0,
      round: 1,
    });
    expect(companionInitiative(null, () => undefined)).toBeNull();
  });
});
