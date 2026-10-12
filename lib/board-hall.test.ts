import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD, boardOf, deepPixelPlayerId, tileSpot } from "../app/lib/board-game";
import { BOARD_HALL, FLOOR_BOARD_SIZE, MEADOW, POND, WATER_Y, clampPose, defaultPoses, stepTo } from "../app/lib/living-room";

describe("floor board", () => {
  it("lays 40 tiles round the edge without overlaps, GO in the south-east corner", () => {
    const n = DEFAULT_BOARD.length;
    const spots = Array.from({ length: n }, (_, i) => tileSpot(i, n));
    expect(spots[0].corner && spots[0].x > 0 && spots[0].z > 0).toBe(true);
    expect(spots[10].corner && spots[10].x < 0 && spots[10].z > 0).toBe(true);
    expect(spots[20].corner && spots[20].x < 0 && spots[20].z < 0).toBe(true);
    expect(spots[30].corner && spots[30].x > 0 && spots[30].z < 0).toBe(true);
    for (const spot of spots) {
      expect(Math.abs(spot.x) + spot.width / 2).toBeLessThanOrEqual(FLOOR_BOARD_SIZE / 2 + 1e-6);
      expect(Math.abs(spot.z)).toBeLessThanOrEqual(FLOOR_BOARD_SIZE / 2);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(spots[1].width * 0.99);
    }
  });

  it("falls back to the default board for missing or odd boards", () => {
    expect(boardOf(null)).toBe(DEFAULT_BOARD);
    expect(boardOf({ gameId: "X", players: [], settings: { board: DEFAULT_BOARD.slice(0, 7) } })).toBe(DEFAULT_BOARD);
  });

  it("matches the embed's player ids", () => {
    expect(deepPixelPlayerId("abc-123")).toBe("h-abc-123");
    expect(deepPixelPlayerId("a.b/c")).toBe("h-abc");
  });

  it("seats everyone in the board hall", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const poses = defaultPoses(ids, new Map(), BOARD_HALL);
    expect(poses.size).toBe(40);
    for (const pose of poses.values()) expect(clampPose(pose, BOARD_HALL)).not.toBeNull();
  });
});

describe("meadow", () => {
  it("keeps people out of the deep pond but lets them onto the jetty", () => {
    const start = { x: POND.x + POND.radius + 1, z: POND.z, facing: 0, seat: null };
    const wet = stepTo(start, { x: POND.x, z: POND.z }, MEADOW);
    expect(wet.x).toBe(start.x);
    const jetty = MEADOW.seatIndex.get("jetty-1")!;
    expect(MEADOW.floorY(jetty.x, jetty.z)).toBeGreaterThan(WATER_Y);
  });

  it("has seats on the ground and spots for a crowd", () => {
    for (const seat of MEADOW.seats) expect(Number.isFinite(seat.y)).toBe(true);
    expect(MEADOW.crowd.length).toBeGreaterThan(40);
    const poses = defaultPoses(Array.from({ length: 60 }, (_, i) => `p${i}`), new Map(), MEADOW);
    expect(poses.size).toBe(60);
  });
});

describe("meadow home and fishing", () => {
  it("walls the cabin, but its door lets you in", async () => {
    const { CABIN, CABIN_DOOR_IN, CABIN_DOOR_OUT, CABIN_FLOOR_Y, inCabin, routeTo } = await import("../app/lib/living-room");
    // Walking straight at the west wall from outside stops at it.
    let pose: import("../app/lib/living-room").LoungePose = { x: CABIN.x - CABIN.w / 2 - 1, z: CABIN.z, facing: 0, seat: null };
    for (let i = 0; i < 60; i++) pose = stepTo(pose, { x: pose.x + 0.05, z: pose.z }, MEADOW);
    expect(inCabin(pose.x, pose.z)).toBe(false);
    // Through the door, in small steps, you get in.
    pose = { ...CABIN_DOOR_OUT, facing: 0, seat: null };
    for (let i = 0; i < 40; i++) pose = stepTo(pose, { x: pose.x, z: pose.z - 0.05 }, MEADOW);
    expect(inCabin(pose.x, pose.z)).toBe(true);
    expect(MEADOW.floorY(pose.x, pose.z)).toBe(CABIN_FLOOR_Y);
    // Clicking inside from outside walks via the door.
    expect(routeTo(MEADOW, { x: 0, z: 5 }, { x: CABIN.x, z: CABIN.z })).toEqual([CABIN_DOOR_OUT, CABIN_DOOR_IN, { x: CABIN.x, z: CABIN.z }]);
    expect(routeTo(MEADOW, { x: 0, z: 5 }, { x: 1, z: 6 })).toEqual([{ x: 1, z: 6 }]);
    for (const seat of MEADOW.seats.filter((s) => s.id.startsWith("home"))) expect(inCabin(seat.x, seat.z)).toBe(true);
  });

  it("lets you fish from the jetty and the bank, not the campfire", async () => {
    const { fishingSpot, JETTY, CAMPFIRE } = await import("../app/lib/living-room");
    expect(fishingSpot({ x: JETTY.x0 + 0.35, z: JETTY.z })).toBe(true);
    expect(fishingSpot({ x: POND.x + POND.radius + 1, z: POND.z })).toBe(true);
    expect(fishingSpot(CAMPFIRE)).toBe(false);
  });
});
