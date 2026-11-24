import { describe, expect, it } from "vitest";
import {
  areaSvgGeometry,
  hpTierFor,
  maskMapForPlayer,
  measureFeet,
  tickConditionDurations,
  type Battlemap,
  type MapToken,
} from "./battlemap";

function makeMap(overrides: Partial<Battlemap> = {}): Battlemap {
  return {
    id: "m1",
    channelId: "ch1",
    name: "Goblin Cave",
    imageUrl: null,
    grid: 20,
    rows: 12,
    tokens: [],
    strokes: [],
    fog: [],
    hpVisibility: "exact",
    ...overrides,
  };
}

describe("battlemap helpers", () => {
  it("computes player-facing monster HP status tiers accurately", () => {
    expect(hpTierFor(20, 20).label).toBe("Healthy");
    expect(hpTierFor(14, 20).label).toBe("Wounded");
    expect(hpTierFor(8, 20).label).toBe("Bloodied");
    expect(hpTierFor(2, 20).label).toBe("Critical");
    expect(hpTierFor(0, 20).label).toBe("Down");
  });

  it("measures grid distance in 5 ft increments (5e Chebyshev & Euclidean)", () => {
    expect(measureFeet(1, 1, 4, 5)).toBe(20);
    expect(measureFeet(1, 1, 4, 5, 5, "euclid")).toBe(25);
    expect(measureFeet(0, 0, 2, 0)).toBe(10);
  });

  it("masks hidden tokens and monster HP while keeping a player's own exact HP", () => {
    const map = makeMap({
      hpVisibility: "tier",
      tokens: [
        { id: "pc", label: "Kael", color: "#49c99a", x: 2, y: 2, ownerId: "u1", hp: 18, maxHp: 24 },
        { id: "mob", label: "Goblin", color: "#ef4444", x: 5, y: 5, ownerId: null, hp: 3, maxHp: 10 },
        { id: "ambush", label: "Assassin", color: "#991b1b", x: 9, y: 9, ownerId: null, hp: 50, maxHp: 50, hidden: true },
      ],
    });

    const playerView = maskMapForPlayer(map, "u1");
    expect(playerView.tokens.map((t) => t.id)).toEqual(["pc", "mob"]);
    const pc = playerView.tokens.find((t) => t.id === "pc")!;
    expect(pc.hp).toBe(18);
    expect(pc.maxHp).toBe(24);

    const mob = playerView.tokens.find((t) => t.id === "mob")!;
    expect(mob.hp).toBeUndefined();
    expect(mob.maxHp).toBeUndefined();
    expect(mob.hpTier?.label).toBe("Bloodied");

    const hiddenMode = maskMapForPlayer({ ...map, hpVisibility: "hidden" }, "u1");
    const mobHidden = hiddenMode.tokens.find((t) => t.id === "mob")!;
    expect(mobHidden.hp).toBeUndefined();
    expect(mobHidden.hpTier).toBeUndefined();
  });

  it("decrements timed conditions on turn advance and removes expired ones", () => {
    const tokens: MapToken[] = [
      {
        id: "t1",
        label: "Fighter",
        color: "#68a8ff",
        x: 1,
        y: 1,
        conditions: ["poisoned", "prone"],
        conditionDurations: { poisoned: 1, prone: 3 },
      },
      {
        id: "t2",
        label: "Cleric",
        color: "#f3bd5d",
        x: 2,
        y: 2,
        conditions: ["concentrating"],
        conditionDurations: { concentrating: 2 },
      },
    ];

    const res = tickConditionDurations(tokens, "t1");
    expect(res.expired).toEqual([{ tokenId: "t1", label: "Fighter", conditionId: "poisoned" }]);
    expect(res.tokens[0].conditions).toEqual(["prone"]);
    expect(res.tokens[0].conditionDurations).toEqual({ prone: 2 });
    // Non-active token durations remain untouched
    expect(res.tokens[1].conditionDurations).toEqual({ concentrating: 2 });
  });

  it("computes AoE SVG shapes in grid cell coordinates (5 ft per square)", () => {
    const sphere = areaSvgGeometry({ shape: "sphere", x: 10, y: 10, tx: 10, ty: 10, sizeFt: 20 });
    expect(sphere).toEqual({ kind: "circle", cx: 10, cy: 10, r: 4 });

    const cone = areaSvgGeometry({ shape: "cone", x: 0, y: 0, tx: 4, ty: 0, sizeFt: 15 });
    expect(cone.kind).toBe("polygon");
    if (cone.kind === "polygon") {
      expect(cone.points).toContain("0,0");
      expect(cone.points.split(" ")).toHaveLength(3);
    }

    const line = areaSvgGeometry({ shape: "line", x: 1, y: 1, tx: 10, ty: 1, sizeFt: 30 });
    expect(line.kind).toBe("polygon");

    const cube = areaSvgGeometry({ shape: "cube", x: 5, y: 5, tx: 5, ty: 5, sizeFt: 10 });
    expect(cube.kind).toBe("polygon");
  });
});
