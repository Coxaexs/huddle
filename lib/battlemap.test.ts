import { describe, expect, it } from "vitest";
import { clampPoint, publicBattlemap, type BattlemapRow } from "./battlemap";

describe("clampPoint", () => {
  it("clamps to the [0, max] range", () => {
    expect(clampPoint(-5, 20)).toBe(0);
    expect(clampPoint(50, 20)).toBe(20);
    expect(clampPoint(10, 20)).toBe(10);
  });

  it("rounds to two decimals", () => {
    expect(clampPoint(3.14159, 20)).toBe(3.14);
    expect(clampPoint(7.777, 20)).toBe(7.78);
  });

  it("returns 0 for non-finite input", () => {
    expect(clampPoint(Number.NaN, 20)).toBe(0);
    expect(clampPoint(Number.POSITIVE_INFINITY, 20)).toBe(0);
    expect(clampPoint(Number.NEGATIVE_INFINITY, 20)).toBe(0);
  });
});

describe("publicBattlemap", () => {
  const row: BattlemapRow = {
    id: "map-1",
    channel_id: "voice-1",
    name: "Cave",
    image_key: "bg/cave.png",
    grid: 24,
    tokens: JSON.stringify([
      { id: "t1", label: "Goblin", color: "#b8a6ff", x: 5, y: 5, size: 2 },
    ]),
    strokes: JSON.stringify([
      { id: "s1", color: "#ef6b58", width: 3, points: [0, 0, 1, 1] },
    ]),
    active: 1,
  };

  it("maps row fields onto the public shape", () => {
    const map = publicBattlemap(row);
    expect(map.id).toBe("map-1");
    expect(map.channelId).toBe("voice-1");
    expect(map.name).toBe("Cave");
    expect(map.grid).toBe(24);
  });

  it("builds the image URL under the hangout base path", () => {
    expect(publicBattlemap(row).imageUrl).toBe(
      "/hangout/api/uploads/bg%2Fcave.png",
    );
  });

  it("parses tokens and strokes JSON", () => {
    const map = publicBattlemap(row);
    expect(map.tokens).toHaveLength(1);
    expect(map.tokens[0].label).toBe("Goblin");
    expect(map.tokens[0].size).toBe(2);
    expect(map.strokes).toHaveLength(1);
    expect(map.strokes[0].color).toBe("#ef6b58");
  });

  it("falls back to empty arrays and default grid on bad/empty data", () => {
    const blank: BattlemapRow = {
      ...row,
      grid: 0,
      image_key: null,
      tokens: "not json",
      strokes: "",
    };
    const map = publicBattlemap(blank);
    expect(map.tokens).toEqual([]);
    expect(map.strokes).toEqual([]);
    expect(map.grid).toBe(20);
    expect(map.imageUrl).toBeNull();
  });
});