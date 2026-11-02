import { describe, expect, it } from "vitest";
import { companionRoll, rollFaces } from "./dnd-table";

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
