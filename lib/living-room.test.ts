import { describe, expect, it } from "vitest";
import {
  LOUNGE_SEATS, NOOK, clampPose, defaultPoses, freeSeat, headingTo, hearFrom, stepTo, wrapHeading,
  type LoungePose,
} from "../app/lib/living-room";

const at = (x: number, z: number, facing = 0, seat: string | null = null): LoungePose => ({ x, z, facing, seat });

describe("living room geometry", () => {
  it("hears someone to the east on the right when facing the fire", () => {
    const heard = hearFrom(at(0, 0), at(2, 0));
    expect(heard.seat.x).toBeCloseTo(2);
    expect(heard.seat.z).toBeCloseTo(0);
    expect(heard.pan).toBeGreaterThan(0.6);
  });

  it("puts a voice in front when you turn to face it", () => {
    const heard = hearFrom(at(0, 0, Math.PI / 2), at(2, 0));
    expect(heard.seat.x).toBeCloseTo(0);
    expect(heard.seat.z).toBeCloseTo(-2);
    expect(Math.abs(heard.pan)).toBeLessThan(0.01);
  });

  it("is quieter across the room than next to you", () => {
    const near = hearFrom(at(0, 0), at(0.8, 0, -Math.PI / 2));
    const far = hearFrom(at(-3, -2), at(3, 2, headingTo(at(3, 2), at(-3, -2))));
    expect(far.attenuation).toBeLessThan(near.attenuation);
    expect(near.attenuation).toBeCloseTo(1);
  });

  it("never places a voice inside your head", () => {
    const heard = hearFrom(at(0, 0), at(0.05, 0));
    expect(Math.hypot(heard.seat.x, heard.seat.z)).toBeCloseTo(0.5);
  });

  it("muffles the quiet nook from the rest of the room, both ways", () => {
    const inside = at(NOOK.x, NOOK.z);
    const outside = at(NOOK.x - 1.6, NOOK.z);
    // Speakers facing the listener, so only the wall is measured.
    const face = (from: LoungePose, to: LoungePose) => ({ ...from, facing: headingTo(from, to) });
    expect(hearFrom(outside, face(inside, outside)).privacy).toBeCloseTo(0.45);
    expect(hearFrom(inside, face(outside, inside)).privacy).toBeCloseTo(0.45);
    expect(hearFrom(outside, face(inside, outside)).cutoff).toBeLessThanOrEqual(1400);
    const mate = at(NOOK.x + 0.3, NOOK.z - 0.3);
    expect(hearFrom(inside, face(mate, inside)).privacy).toBeCloseTo(1);
  });

  it("a voice turned away is softer, duller and roomier than one facing you", () => {
    const listener = at(0, 0);
    const facing = hearFrom(listener, at(0, -2, Math.PI)); // two metres ahead, looking back at you
    const away = hearFrom(listener, at(0, -2, 0)); // same spot, facing the fire
    expect(away.attenuation).toBeLessThan(facing.attenuation);
    expect(away.cutoff).toBeLessThan(facing.cutoff);
    expect(away.wet).toBeGreaterThan(facing.wet);
  });

  it("distance darkens and wets a voice", () => {
    const near = hearFrom(at(0, 0), at(1, 0, -Math.PI / 2));
    const far = hearFrom(at(-5, 0), at(5, 0, -Math.PI / 2));
    expect(far.cutoff).toBeLessThan(near.cutoff);
    expect(far.wet).toBeGreaterThan(near.wet);
  });

  it("headingTo agrees with hearFrom's frame", () => {
    const from = at(1, 1);
    const to = at(-2, 0.5);
    const heard = hearFrom({ ...from, facing: headingTo(from, to) }, to);
    expect(heard.seat.x).toBeCloseTo(0);
    expect(heard.seat.z).toBeLessThan(0);
  });
});

describe("living room poses", () => {
  it("clamps wire input into the room and snaps known seats", () => {
    expect(clampPose({ x: 99, z: -99, facing: 10, seat: null })).toMatchObject({ x: 5.65, z: -4.15 });
    expect(clampPose({ x: 0, z: 0, facing: 0, seat: "couch-m" })).toMatchObject({ x: 0, z: 0.6, seat: "couch-m" });
    expect(clampPose({ x: "1", z: 0 })).toBeNull();
    expect(clampPose(null)).toBeNull();
    expect(Math.abs(wrapHeading(10))).toBeLessThanOrEqual(Math.PI);
  });

  it("seats newcomers in free seats, in a stable order", () => {
    const taken = new Map([["b", at(0, 0.75, 0, "couch-l")]]);
    const poses = defaultPoses(["a", "b", "c"], taken);
    expect(poses.get("b")?.seat).toBe("couch-l");
    expect(poses.get("a")?.seat).toBe("couch-m");
    expect(poses.get("c")?.seat).toBe("couch-r");
    expect(freeSeat(poses.values())?.id).toBe("love-1");
  });

  it("stands people on the floor once every seat is full", () => {
    const ids = LOUNGE_SEATS.map((_, i) => `p${i}`).concat("extra");
    const poses = defaultPoses(ids, new Map());
    expect(poses.get("extra")?.seat).toBeNull();
  });

  it("sits on the floor anywhere, and stands up by walking", () => {
    const sitting = clampPose({ x: 2, z: 2, facing: 0, seat: "floor" });
    expect(sitting).toMatchObject({ x: 2, z: 2, seat: "floor" });
    expect(stepTo(sitting!, { x: 2.1, z: 2 }).seat).toBeNull();
    expect(hearFrom(at(0, 0, 0, "floor"), at(1, 0)).seat.y).toBeCloseTo(0.85);
    // Floor sitters never hold a seat someone else could take.
    expect(defaultPoses(["a", "b"], new Map([["a", sitting!]])).get("b")?.seat).toBe("couch-l");
  });

  it("doesn't walk through the couch", () => {
    const start = at(0, 2);
    expect(stepTo(start, { x: 0, z: 1 })).toMatchObject({ x: 0, z: 2 });
    expect(stepTo(start, { x: 2, z: 2 })).toMatchObject({ x: 2, z: 2 });
    // Standing up from the couch walks out of it.
    expect(stepTo(at(0, 0.6, 0, "couch-m"), { x: 0.05, z: 0.55 })).toMatchObject({ x: 0.05, z: 0.55, seat: null });
  });
});
