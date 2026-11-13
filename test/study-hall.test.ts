import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AMBIENT_GAP_MS,
  AMBIENT_TIMER_DONE_MS,
  AMBIENT_TIMER_MAX_MINUTES,
  ambientLapMs,
  ambientOrder,
  ambientPlaying,
  ambientState,
  ambientTimerStatus,
  ambientUpNext,
  mulberry32,
  reshuffleAmbient,
  skipAmbientTrack,
  startAmbientTimer,
  starterAmbientState,
  stopAmbientTimer,
  type AmbientState,
} from "@/lib/study-hall";
import { STUDY_RAIN_FILE, STUDY_TRACKS, type StudyTrack } from "@/lib/study-hall-tracks";

const base: AmbientState = {
  seed: 12345,
  startedAt: 1_700_000_000_000,
  intensity: "rainy",
  timerEndsAt: 0,
  timerKind: "focus",
  timerMinutes: 25,
};

/** Four short tracks, so the sums are easy to follow. */
const FOUR: StudyTrack[] = [
  { id: "a", title: "A", ms: 10_000 },
  { id: "b", title: "B", ms: 20_000 },
  { id: "c", title: "C", ms: 30_000 },
  { id: "d", title: "D", ms: 40_000 },
];

describe("ambientState", () => {
  it("fills in a complete default from nothing", () => {
    expect(ambientState(null, 5000)).toEqual({
      seed: 1,
      startedAt: 5000,
      intensity: "rainy",
      timerEndsAt: 0,
      timerKind: "focus",
      timerMinutes: 25,
    });
  });

  it("cleans what is out of range", () => {
    const state = ambientState({ seed: -7.9, startedAt: "x", intensity: "loud" }, 10);
    expect(state.seed).toBe(7);
    expect(state.startedAt).toBe(10);
    expect(state.intensity).toBe("rainy");
  });

  it("reads a room saved by the synthesised version", () => {
    const old = { seed: 9, startedAt: 1000, intensity: "focus", bpm: 88, chordIndex: 4 };
    expect(ambientState(old, 2000)).toEqual({ ...base, seed: 9, startedAt: 1000, intensity: "calm" });
  });

  it("starts a session now with a 32-bit seed", () => {
    const state = starterAmbientState(42, () => 0.5);
    expect(state.startedAt).toBe(42);
    expect(state.seed).toBe(2147483648);
  });
});

describe("the room's timer", () => {
  const NOW = 1_700_000_000_000;

  it("counts down from when it was started, then says it is done", () => {
    const running = startAmbientTimer(base, "focus", 25, NOW);
    expect(running.timerEndsAt).toBe(NOW + 25 * 60_000);
    expect(ambientTimerStatus(running, NOW + 60_000)).toEqual({ phase: "running", leftMs: 24 * 60_000 });
    expect(ambientTimerStatus(running, NOW + 25 * 60_000 + 1).phase).toBe("done");
    // Long after, it is simply gone.
    expect(ambientTimerStatus(running, NOW + 25 * 60_000 + AMBIENT_TIMER_DONE_MS + 1).phase).toBe("none");
  });

  it("can be a break, and can be cleared", () => {
    const rest = startAmbientTimer(base, "break", 5, NOW);
    expect(rest.timerKind).toBe("break");
    expect(ambientTimerStatus(stopAmbientTimer(rest), NOW).phase).toBe("none");
  });

  it("survives the trip through the server unchanged, and keeps the music where it was", () => {
    const running = startAmbientTimer(base, "focus", 50, NOW);
    const back = ambientState(JSON.parse(JSON.stringify(running)), NOW + 1000);
    expect(back).toEqual(running);
    expect(ambientPlaying(back, NOW + 90_000)).toEqual(ambientPlaying(base, NOW + 90_000));
  });

  it("refuses a timer longer than the longest allowed, or one set for the far future", () => {
    expect(startAmbientTimer(base, "focus", 9999, NOW).timerMinutes).toBe(AMBIENT_TIMER_MAX_MINUTES);
    expect(ambientState({ ...base, timerEndsAt: NOW + 24 * 3600_000 }, NOW).timerEndsAt).toBe(0);
    expect(ambientState({ ...base, timerEndsAt: "soon", timerKind: "nap", timerMinutes: -4 }, NOW)).toMatchObject({
      timerEndsAt: 0,
      timerKind: "focus",
      timerMinutes: 1,
    });
  });
});

describe("the track list", () => {
  it("has usable, distinct tracks", () => {
    expect(STUDY_TRACKS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(STUDY_TRACKS.map((track) => track.id)).size).toBe(STUDY_TRACKS.length);
    for (const track of STUDY_TRACKS) {
      expect(track.id).toMatch(/^[a-z0-9-]+$/);
      expect(track.title.length).toBeGreaterThan(0);
      expect(track.ms).toBeGreaterThan(60_000);
      expect(track.ms).toBeLessThan(10 * 60_000);
    }
  });

  it("has a file for every track, and the rain", () => {
    const folder = join(process.cwd(), "public", "study-hall");
    for (const name of [...STUDY_TRACKS.map((track) => `${track.id}.mp3`), STUDY_RAIN_FILE]) {
      expect(existsSync(join(folder, name)), name).toBe(true);
    }
  });
});

describe("the order", () => {
  it("plays every track once per lap", () => {
    for (const lap of [0, 1, 7, 9001]) {
      const order = ambientOrder(base.seed, lap);
      expect([...order].sort((a, b) => a - b)).toEqual(STUDY_TRACKS.map((_, index) => index));
    }
  });

  it("is the same on every device, and differs between seeds and laps", () => {
    expect(ambientOrder(77, 3)).toEqual(ambientOrder(77, 3));
    expect(ambientOrder(77, 3)).not.toEqual(ambientOrder(78, 3));
    expect(ambientOrder(77, 3)).not.toEqual(ambientOrder(77, 4));
  });

  it("never opens a lap with the track the last one closed on", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      for (let lap = 1; lap <= 4; lap += 1) {
        const before = ambientOrder(seed, lap - 1, 3);
        expect(ambientOrder(seed, lap, 3)[0]).not.toBe(before[before.length - 1]);
      }
    }
  });
});

describe("what is playing", () => {
  const lap = ambientLapMs(FOUR);
  const order = ambientOrder(base.seed, 0, FOUR.length);

  it("adds a pause after every track to make a lap", () => {
    expect(lap).toBe(100_000 + 4 * AMBIENT_GAP_MS);
  });

  it("starts on the first track of the order", () => {
    const playing = ambientPlaying(base, base.startedAt, FOUR);
    expect(playing.index).toBe(order[0]);
    expect(playing.offsetMs).toBe(0);
    expect(playing.startsAt).toBe(base.startedAt);
    expect(playing.endsAt).toBe(base.startedAt + FOUR[order[0]].ms + AMBIENT_GAP_MS);
  });

  it("walks the order, one track after another with no holes", () => {
    let at = base.startedAt;
    for (let step = 0; step < 12; step += 1) {
      const playing = ambientPlaying(base, at, FOUR);
      expect(playing.startsAt).toBe(at);
      expect(playing.index).toBe(ambientOrder(base.seed, Math.floor(step / 4), 4)[step % 4]);
      // One millisecond before the next track it is still this one, in its pause.
      const last = ambientPlaying(base, playing.endsAt - 1, FOUR);
      expect(last.index).toBe(playing.index);
      expect(last.offsetMs).toBeGreaterThan(playing.track.ms);
      at = playing.endsAt;
    }
    expect(at).toBe(base.startedAt + 3 * lap);
  });

  it("finds a place hundreds of laps in without walking there", () => {
    const now = base.startedAt + 500 * lap + 12_345;
    const playing = ambientPlaying(base, now, FOUR);
    expect(playing.startsAt).toBeLessThanOrEqual(now);
    expect(playing.endsAt).toBeGreaterThan(now);
    expect(playing.offsetMs).toBe(now - playing.startsAt);
  });

  it("waits on the first track when the clock is before the start", () => {
    const playing = ambientPlaying(base, base.startedAt - 5000, FOUR);
    expect(playing.index).toBe(order[0]);
    expect(playing.offsetMs).toBe(0);
  });

  it("names the track that comes next, across the end of a lap too", () => {
    expect(ambientUpNext(base, base.startedAt, FOUR)).toBe(FOUR[order[1]]);
    const lastOfLap = base.startedAt + lap - 1;
    expect(ambientUpNext(base, lastOfLap, FOUR)).toBe(FOUR[ambientOrder(base.seed, 1, 4)[0]]);
  });

  it("works for the real track list", () => {
    const now = base.startedAt + 3 * 3600_000;
    const playing = ambientPlaying(base, now);
    expect(STUDY_TRACKS[playing.index]).toBe(playing.track);
    expect(playing.offsetMs).toBeLessThan(playing.track.ms + AMBIENT_GAP_MS);
  });
});

describe("the room's controls", () => {
  it("skips to the top of the next track and keeps the order", () => {
    const now = base.startedAt + 4321;
    const next = ambientUpNext(base, now, FOUR);
    const skipped = skipAmbientTrack(base, now, FOUR);
    const playing = ambientPlaying(skipped, now, FOUR);
    expect(playing.track).toBe(next);
    expect(playing.offsetMs).toBe(0);
    expect(skipped.seed).toBe(base.seed);
  });

  it("skips track after track through the whole order", () => {
    let state = base;
    const now = base.startedAt + 100;
    const heard: string[] = [];
    for (let step = 0; step < 8; step += 1) {
      heard.push(ambientPlaying(state, now, FOUR).track.id);
      state = skipAmbientTrack(state, now, FOUR);
    }
    const laps = [0, 1].flatMap((index) => ambientOrder(base.seed, index, 4).map((track) => FOUR[track].id));
    expect(heard).toEqual(laps);
  });

  it("shuffles into a new order that starts now", () => {
    const now = base.startedAt + 77_000;
    const fresh = reshuffleAmbient(base, now, () => 0.25);
    expect(fresh.seed).toBe(1073741824);
    expect(fresh.startedAt).toBe(now);
    expect(ambientPlaying(fresh, now, FOUR).offsetMs).toBe(0);
    // The mood and the timer are the room's, not the playlist's.
    expect(fresh.intensity).toBe(base.intensity);
  });
});

describe("mulberry32", () => {
  it("repeats for a seed and stays in [0, 1)", () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    for (let index = 0; index < 100; index += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
