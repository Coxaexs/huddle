import { describe, expect, it } from "vitest";
import { terrainOf } from "../app/lib/map-terrain";

describe("terrainOf", () => {
  it("reads a battle map's colours as terrain", () => {
    expect(terrainOf([40, 110, 190])).toBe("water");
    expect(terrainOf([90, 170, 200])).toBe("water");
    expect(terrainOf([230, 70, 20])).toBe("fire");
    expect(terrainOf([46, 125, 50])).toBe("green");
    expect(terrainOf([12, 10, 14])).toBe("dark");
    expect(terrainOf([170, 140, 100])).toBe("ground");
    expect(terrainOf([200, 200, 200])).toBe("ground");
  });

  it("does not set a dull red rug on fire", () => {
    expect(terrainOf([120, 40, 40])).toBe("ground");
  });
});
