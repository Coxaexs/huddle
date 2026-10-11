import { describe, expect, it } from "vitest";
import { DIE_TYPES, faceNormal } from "../app/lib/dice-normals";

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
