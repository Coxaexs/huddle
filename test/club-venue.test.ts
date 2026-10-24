import { describe, expect, it } from "vitest";
import {
  CLUB, CLUB_DJ_SEAT, CLUB_STAGE, defaultPoses, freeSeat, inDanceFloor, seatById, stepTo, type LoungePose,
} from "@/app/lib/living-room";
import { boothOp, slimState } from "@/app/api/(features)/music/club/route";

const at = (x: number, z: number, seat: string | null = null): LoungePose => ({ x, z, facing: 0, seat });

describe("the club's floor plan", () => {
  it("starts everyone on the dance floor, facing the decks; seats are chosen, never handed out", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `c${i}`);
    const poses = defaultPoses(ids, new Map(), CLUB);
    for (const pose of poses.values()) expect(pose.seat).toBeNull();
    const onFloor = [...poses.values()].filter((pose) => inDanceFloor(pose));
    expect(onFloor.length).toBe(30);
    expect(freeSeat([], CLUB)).toBeNull();
    expect(CLUB.seats.every((seat) => seat.reserved)).toBe(true);
  });

  it("puts the DJ up on the stage behind the decks, and keeps the crowd off it", () => {
    const dj = seatById(CLUB_DJ_SEAT, CLUB)!;
    expect(CLUB.floorY(dj.x, dj.z)).toBe(CLUB_STAGE.height);
    expect(CLUB.floorY(0, 0)).toBe(0);
    // Walking from the floor into the stage's front edge goes nowhere.
    const front = at(0, CLUB_STAGE.z1 + 0.2);
    const blocked = stepTo(front, { x: 0, z: CLUB_STAGE.z1 - 0.2 }, CLUB);
    expect(blocked.z).toBeCloseTo(front.z);
    // The DJ can step off it.
    const off = stepTo(at(dj.x, dj.z, CLUB_DJ_SEAT), { x: dj.x, z: dj.z + 0.3 }, CLUB);
    expect(off.z).toBeCloseTo(dj.z + 0.3);
  });

  it("has a bar and booths to sit at", () => {
    expect(CLUB.seats.filter((seat) => seat.id.startsWith("club-bar-"))).toHaveLength(8);
    expect(CLUB.seats.filter((seat) => seat.id.startsWith("club-booth-"))).toHaveLength(12);
  });
});

describe("the club's booth controls", () => {
  it("lets the club's controls through and nothing else", () => {
    expect(boothOp({ op: "club", vibe: "hype" })).toEqual({ op: "club", vibe: "hype" });
    expect(boothOp({ op: "club", vibe: "rave" })).toEqual({ op: "club" });
    expect(boothOp({ op: "skip", style: "mashup" })).toEqual({ op: "skip", style: "mashup" });
    expect(boothOp({ op: "skip", style: "nope" })).toEqual({ op: "skip" });
    expect(boothOp({ op: "club_move", move: "drop" })).toEqual({ op: "club_move", move: "drop" });
    expect(boothOp({ op: "club_move", move: "eject" })).toBe("Unknown move.");
    expect(boothOp({ op: "set", deck: "A", stem: "vocals", value: 3 })).toEqual({ op: "set", deck: "A", param: "stem_vocals", value: 1 });
    expect(boothOp({ op: "set", deck: "A", param: "pitch", value: 50 })).toBe("Unknown setting.");
    expect(boothOp({ op: "set", deck: "C", stem: "vocals", value: 0 })).toBe("Choose deck A or B.");
    expect(boothOp({ op: "fx", type: "roll", beat: 2, on: true })).toEqual({ op: "fx", type: "roll", beat: 2, on: true, level: 0.8, target: "master" });
    expect(boothOp({ op: "sample", name: "horn" })).toEqual({ op: "sample", name: "horn" });
    expect(boothOp({ op: "auto", mode: "real", vibe: "chill", on: true })).toEqual({ op: "auto", mode: "real", vibe: "chill", on: true });
    expect(boothOp({ op: "auto" })).toBe("Nothing to change.");
    expect(boothOp({ op: "eject", deck: "A" })).toBe("Unknown control.");
    expect(boothOp({ op: "queue", query: "  " })).toBe("Type a song name or paste a link.");
  });

  it("slims the booth's state to what the panel shows", () => {
    const state = slimState({
      active: true, live: true,
      decks: {
        A: { loaded: true, title: "One", artist: "X", playing: true, bpm: 120, pitch: 5, camelot: "8A", pos: 12.5, duration: 200, stems: { status: "ready", gain: { drums: 0, bass: 1, vocals: 1, other: 1 } } },
        B: { loaded: false },
      },
      mixer: { master_deck: "A" },
      transition: { label: "Stem swap", progress: 0.4, started: true },
      auto: { on: true, mode: "real", vibe: "hype", three: false, real: { next: "Two" } },
      stems: { on: true, available: true },
      crate: Array.from({ length: 20 }, (_, i) => ({ title: `S${i}`, artist: "", keys: ["x"] })),
      history: [{ title: "old" }],
    });
    expect(state.decks.A).toMatchObject({ title: "One", bpm: 126, key: "8A", stems: "ready", position: 12.5, gains: { drums: 0, bass: 1, vocals: 1, other: 1 } });
    expect(state.decks.B.loaded).toBe(false);
    expect(state.master).toBe("A");
    expect(state.mix).toEqual({ label: "Stem swap", progress: 0.4, started: true });
    expect(state.auto).toEqual({ on: true, mode: "real", vibe: "hype", three: false, next: "Two" });
    expect(state.crate).toHaveLength(12);
    expect(state.crate[0]).toEqual({ title: "S0", artist: "" });
    expect("history" in state).toBe(false);
  });
});
