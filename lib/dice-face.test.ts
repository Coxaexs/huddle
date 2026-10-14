import { describe, expect, it } from "vitest";
import { DIE_TYPES, dieFaces, faceNormal } from "../app/lib/dice-normals";

describe("faceNormal", () => {
  it("knows every face of every die the table can throw", () => {
    const sides: Record<string, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 10 };
    for (const type of DIE_TYPES) {
      const faces = type === "d100" ? [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] : Array.from({ length: sides[type] }, (_, i) => i + 1);
      const seen = new Set<string>();
      for (const value of faces) {
        const normal = faceNormal(type, value);
        expect(normal, `${type} ${value}`).not.toBeNull();
        expect(Math.hypot(...normal!)).toBeCloseTo(1, 3);
        seen.add(normal!.map((n) => n.toFixed(2)).join(","));
      }
      // Each value is its own face.
      expect(seen.size).toBe(faces.length);
    }
  });

  it("has no face for a value the die does not carry", () => {
    expect(faceNormal("d6", 7)).toBeNull();
    expect(faceNormal("d3", 1)).toBeNull();
  });
});

describe("dieFaces", () => {
  it("shows a d100 as a tens die and a d10 that add up", () => {
    const shown = (value: number) => dieFaces(100, value, true).map((face) => `${face.type}:${face.value}`);
    expect(shown(57)).toEqual(["d100:50", "d10:7"]);
    expect(shown(5)).toEqual(["d100:0", "d10:5"]);
    expect(shown(10)).toEqual(["d100:0", "d10:10"]);
    expect(shown(60)).toEqual(["d100:50", "d10:10"]);
    expect(shown(100)).toEqual(["d100:90", "d10:10"]);
    for (let value = 1; value <= 100; value++) {
      const [tens, units] = dieFaces(100, value, true);
      expect(tens.value + units.value).toBe(value);
      expect(faceNormal("d100", tens.value)).not.toBeNull();
      expect(faceNormal("d10", units.value)).not.toBeNull();
    }
  });

  it("uses the die with that many sides, or the next one up", () => {
    expect(dieFaces(20, 13, true)).toEqual([{ type: "d20", value: 13, kept: true }]);
    expect(dieFaces(3, 2, false)).toEqual([{ type: "d4", value: 2, kept: false }]);
  });
});
