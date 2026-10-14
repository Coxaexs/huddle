import { describe, expect, it } from "vitest";
import {
  LOUNGE_SEATS, NOOK, clampPose, inAnnex, defaultPoses, freeSeat, headingTo, hearFrom, stepTo, wrapHeading,
  type LoungePose,
} from "../app/lib/living-room";
import { CINEMA, GM_SEAT_ID, TABLETOP, LOUNGE, clampPose as clampIn } from "../app/lib/living-room";

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

  it("scales room echo with the echo setting and completely silences it at 0", () => {
    const listener = at(0, 0);
    const speaker = at(0, -2, 0);
    const dry = hearFrom(listener, speaker, undefined, LOUNGE, 0);
    expect(dry.wet).toBe(0);
    const half = hearFrom(listener, speaker, undefined, LOUNGE, 0.5);
    const full = hearFrom(listener, speaker, undefined, LOUNGE, 1);
    expect(half.wet).toBeGreaterThan(0);
    expect(full.wet).toBeGreaterThan(half.wet);
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

  it("gives 40 people their own spot, none on top of another", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const poses = [...defaultPoses(ids, new Map()).values()];
    expect(poses).toHaveLength(40);
    for (let i = 0; i < poses.length; i++) {
      for (let j = i + 1; j < poses.length; j++) {
        expect(Math.hypot(poses[i].x - poses[j].x, poses[i].z - poses[j].z)).toBeGreaterThan(0.4);
      }
    }
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

describe("venues", () => {
  it("seats a full cinema of 150, each in a seat of their own", () => {
    expect(CINEMA.seats).toHaveLength(150);
    expect(new Set(CINEMA.seats.map((seat) => seat.id)).size).toBe(150);
    const ids = Array.from({ length: 150 }, (_, i) => `p${i}`);
    const poses = [...defaultPoses(ids, new Map(), CINEMA).values()];
    expect(new Set(poses.map((pose) => pose.seat)).size).toBe(150);
    // The first to arrive get the best seats, in the middle.
    expect(Math.abs(poses[0].x)).toBeLessThan(1.5);
  });

  it("stands the 151st person in the cinema on open floor, not on a tier", () => {
    const ids = Array.from({ length: 151 }, (_, i) => `p${i}`);
    const last = defaultPoses(ids, new Map(), CINEMA).get("p150")!;
    expect(last.seat).toBeNull();
    expect(CINEMA.floorY(last.x, last.z)).toBeLessThanOrEqual(2.7);
  });

  it("raises the cinema floor row by row and keeps seats on their tier", () => {
    expect(CINEMA.floorY(0, -6)).toBe(0);
    const front = CINEMA.seats.find((seat) => seat.id.startsWith("cin-0-"))!;
    const back = CINEMA.seats.find((seat) => seat.id.startsWith("cin-9-"))!;
    expect(CINEMA.floorY(front.x, front.z)).toBeCloseTo(0);
    expect(CINEMA.floorY(back.x, back.z)).toBeCloseTo(2.7);
    expect(back.y).toBeCloseTo(2.7);
  });

  it("gives the tabletop ten chairs round the table, the rest stand around it", () => {
    expect(TABLETOP.seats).toHaveLength(10);
    const ids = Array.from({ length: 14 }, (_, i) => `p${i}`);
    const poses = defaultPoses(ids, new Map(), TABLETOP);
    // Nine players are seated by themselves; the game master's chair waits to be chosen.
    expect([...poses.values()].filter((pose) => pose.seat).length).toBe(9);
    expect([...poses.values()].some((pose) => pose.seat === GM_SEAT_ID)).toBe(false);
    expect(freeSeat([], TABLETOP)?.id).not.toBe(GM_SEAT_ID);
    // Whoever picked it keeps it.
    const gm = defaultPoses(["gm", "p1"], new Map([["gm", { x: 0, z: -1.9, facing: 0, seat: GM_SEAT_ID }]]), TABLETOP);
    expect(gm.get("gm")?.seat).toBe(GM_SEAT_ID);
    expect(gm.get("p1")?.seat).not.toBe(GM_SEAT_ID);
    for (const pose of [...poses.values()].filter((p) => !p.seat)) {
      expect(Math.hypot(pose.x - 0, pose.z - 0.3)).toBeGreaterThan(2.5);
    }
  });

  it("clamps a pose to the room it is in", () => {
    expect(clampIn({ x: 20, z: 20, facing: 0, seat: null }, LOUNGE)!.x).toBeLessThan(6);
    expect(clampIn({ x: 20, z: 20, facing: 0, seat: null }, CINEMA)!.x).toBeGreaterThan(6);
    // A cinema seat means nothing in the living room.
    expect(clampIn({ x: 1, z: 1, facing: 0, seat: "cin-3-4" }, LOUNGE)!.seat).toBeNull();
  });
});

describe("the cinema's projection booth", () => {
  const a = CINEMA.annex!;
  const at = (x: number, z: number, allow: boolean) => clampPose({ x, z, facing: 0, seat: null }, CINEMA, allow)!;
  it("holds anyone not allowed in to the hall", () => {
    expect(at(a.doorX, a.z0 + 2, false).z).toBeLessThan(a.z0);
  });
  it("lets those allowed in through the door but not through the wall", () => {
    expect(at(a.doorX, a.z0 + 2, true).z).toBeCloseTo(a.z0 + 2);
    expect(at(0, a.z0 - 0.1 + 0.3, true).z).toBeLessThan(a.z0);
    expect(at(0, a.z0 + 2, true).z).toBeCloseTo(a.z0 + 2); // already inside: free to roam
  });
  it("stops at the booth's own walls", () => {
    const far = at(20, 40, true);
    expect(far.x).toBeLessThan(a.x1);
    expect(far.z).toBeLessThan(a.z1);
  });
  it("walks in a step at a time only when allowed", () => {
    const start: LoungePose = { x: a.doorX, z: a.z0 - 0.6, facing: 0, seat: null };
    let allowed = start, denied = start;
    for (let i = 0; i < 40; i++) {
      allowed = stepTo(allowed, { x: a.doorX, z: allowed.z + 0.1 }, CINEMA, true);
      denied = stepTo(denied, { x: a.doorX, z: denied.z + 0.1 }, CINEMA, false);
    }
    expect(inAnnex(allowed, CINEMA)).toBe(true);
    expect(inAnnex(denied, CINEMA)).toBe(false);
  });
});
