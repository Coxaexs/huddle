import { describe, expect, it } from "vitest";
import { freeSpot } from "./battlemap-spot";

describe("freeSpot", () => {
  it("uses the start square on an empty board", () => {
    expect(freeSpot([], 10, 6)).toEqual({ x: 10, y: 6 });
  });
  it("moves next to a token already there", () => {
    const spot = freeSpot([{ x: 10, y: 6 }], 10, 6);
    expect(spot).not.toEqual({ x: 10, y: 6 });
    expect(Math.max(Math.abs(spot.x - 10), Math.abs(spot.y - 6))).toBe(1);
  });
  it("gives several monsters different squares", () => {
    const tokens: { x: number; y: number; size?: number }[] = [];
    for (let i = 0; i < 6; i++) tokens.push(freeSpot(tokens, 10, 6));
    expect(new Set(tokens.map((t) => `${t.x},${t.y}`)).size).toBe(6);
  });
  it("keeps clear of a big token", () => {
    const spot = freeSpot([{ x: 10, y: 6, size: 4 }], 10, 6);
    expect(Math.max(Math.abs(spot.x - 10), Math.abs(spot.y - 6))).toBeGreaterThanOrEqual(2.5);
  });
  it("stays on the board", () => {
    const spot = freeSpot([{ x: 0, y: 0 }], 0, 0, 1, 20, 12);
    expect(spot.x).toBeGreaterThanOrEqual(0);
    expect(spot.y).toBeGreaterThanOrEqual(0);
  });
});
