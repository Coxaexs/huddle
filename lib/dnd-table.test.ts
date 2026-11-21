import { describe, expect, it } from "vitest";
import { companionInitiative, companionRoll, layCompanionPawns, mapFromTable, placeCompanionPawn, rollFaces, sanitizeCompanionPawn, tableFromMap, tableInitiative } from "./dnd-table";

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

  it("preserves pawnId on initiative entries", () => {
    const init = { entries: [{ id: "m1", name: "Goblin", value: 14, pawnId: "dnd-t9" }], turn: 0, round: 1 };
    const tbl = tableInitiative(init, () => undefined);
    expect(tbl).toEqual({ entries: [{ id: "m1", name: "Goblin", value: 14, pawnId: "dnd-t9" }], turn: 0, round: 1 });
    expect(companionInitiative(tbl as never, () => undefined)).toEqual(init);
  });
});

describe("map coordinates & extended table sync", () => {
  it("roundtrips between 2D map % and 3D tabletop coordinates", () => {
    const pt = tableFromMap(62.5, 38.0, 1.6, 0, 1);
    const back = mapFromTable(pt.x, pt.z, 1.6, 0, 1);
    expect(back.x).toBeCloseTo(62.5, 0);
    expect(back.y).toBeCloseTo(38.0, 0);
  });

  it("supports multi-dice, label, and rollType on companionRoll", () => {
    const roll = companionRoll(roller, {
      expression: "2d20kh1+5",
      dice: [
        { sides: 20, rolls: [{ value: 19, kept: true }, { value: 4, kept: false }], sign: 1 },
        { sides: 4, rolls: [{ value: 3, kept: true }], sign: 1 },
      ],
      modifier: 5,
      total: 27,
      label: "Stealth",
      rollType: "advantage",
    });
    expect(roll?.label).toBe("Stealth");
    expect(roll?.rollType).toBe("advantage");
    expect(roll?.dice).toHaveLength(2);
    expect(roll?.dice[0].rolls[1].kept).toBe(false);
  });

  it("preserves conditions, size, elevation, and portraitUrl on pawns", () => {
    const raw = sanitizeCompanionPawn(
      {
        id: "dnd-t42",
        kind: "beast",
        x: 0.4,
        z: -0.2,
        label: "Owlbear",
        maxHp: 59,
        hp: 40,
        conditions: ["Poisoned", "PRONE"],
        size: 2,
        elevation: 15,
        portraitUrl: "/hangout/api/integrations/dnd/token?name=Owlbear",
      },
      "gm",
      "GM",
    );
    expect(raw?.conditions).toEqual(["poisoned", "prone"]);
    expect(raw?.size).toBe(2);
    expect(raw?.elevation).toBe(15);
    expect(raw?.portraitUrl).toContain("Owlbear");
    const placed = placeCompanionPawn({}, raw!, 100);
    expect(placed.pawns["dnd-t42"].conditions).toEqual(["poisoned", "prone"]);
    expect(placed.pawns["dnd-t42"].elevation).toBe(15);
    expect(placed.pawns["dnd-t42"].size).toBe(2);
  });
});
