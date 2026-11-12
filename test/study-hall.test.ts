import { describe, expect, it } from "vitest";
import {
  AMBIENT_BEATS,
  AMBIENT_BPM_MAX,
  AMBIENT_BPM_MIN,
  AMBIENT_TIMER_DONE_MS,
  AMBIENT_TIMER_MAX_MINUTES,
  ambientBar,
  ambientBarMs,
  ambientChord,
  ambientPosition,
  ambientState,
  ambientTimerStatus,
  mulberry32,
  retimeAmbient,
  startAmbientTimer,
  starterAmbientState,
  stopAmbientTimer,
  type AmbientState,
} from "@/lib/study-hall";

const base: AmbientState = {
  seed: 12345,
  startedAt: 1_700_000_000_000,
  intensity: "rainy",
  bpm: 74,
  chordIndex: 0,
  timerEndsAt: 0,
  timerKind: "focus",
  timerMinutes: 25,
};

describe("ambientState", () => {
  it("fills in a complete default from nothing", () => {
    const state = ambientState(null, 5000);
    expect(state).toEqual({
      seed: 1,
      startedAt: 5000,
      intensity: "rainy",
      bpm: 74,
      chordIndex: 0,
      timerEndsAt: 0,
      timerKind: "focus",
      timerMinutes: 25,
    });
  });

  it("clamps what is out of range", () => {
    const state = ambientState({ seed: -7.9, startedAt: "x", intensity: "loud", bpm: 400, chordIndex: -3 }, 10);
    expect(state.seed).toBe(7);
    expect(state.startedAt).toBe(10);
    expect(state.intensity).toBe("rainy");
    expect(state.bpm).toBe(AMBIENT_BPM_MAX);
    expect(state.chordIndex).toBe(0);
    expect(ambientState({ bpm: 1 }).bpm).toBe(AMBIENT_BPM_MIN);
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
    expect(ambientBar(back, 3)).toEqual(ambientBar(base, 3));
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

describe("the score", () => {
  it("is the same on every device for the same state and bar", () => {
    for (const bar of [0, 1, 17, 9001]) {
      expect(ambientBar({ ...base }, bar)).toEqual(ambientBar(JSON.parse(JSON.stringify(base)), bar));
    }
  });

  it("differs between seeds", () => {
    const chords = (seed: number) => Array.from({ length: 32 }, (_, bar) => ambientChord({ ...base, seed }, bar).name).join();
    expect(chords(1)).not.toBe(chords(2));
  });

  it("keeps every event inside its bar and in range", () => {
    for (const intensity of ["calm", "rainy", "focus"] as const) {
      for (let bar = 0; bar < 64; bar += 1) {
        for (const event of ambientBar({ ...base, intensity }, bar).events) {
          expect(event.beat).toBeGreaterThanOrEqual(0);
          expect(event.beat).toBeLessThan(AMBIENT_BEATS);
          expect(event.velocity).toBeGreaterThan(0);
          expect(event.velocity).toBeLessThanOrEqual(1);
          if (event.voice === "keys" || event.voice === "bass") {
            expect(event.midi).toBeGreaterThanOrEqual(24);
            expect(event.midi).toBeLessThanOrEqual(96);
          }
        }
      }
    }
  });

  it("only adds drums in focus", () => {
    const voices = (intensity: AmbientState["intensity"]) =>
      new Set(ambientBar({ ...base, intensity }, 3).events.map((event) => event.voice));
    expect(voices("focus").has("kick")).toBe(true);
    expect(voices("rainy").has("kick")).toBe(false);
    expect(voices("calm").has("hat")).toBe(false);
  });

  it("keeps the chord when the mood changes", () => {
    const chordNotes = (intensity: AmbientState["intensity"]) =>
      ambientBar({ ...base, intensity }, 5).events.filter((event) => event.voice === "keys" && event.beat < 0.5);
    expect(chordNotes("calm")).toEqual(chordNotes("focus"));
  });

  it("skipping a chord moves the whole song along by one", () => {
    expect(ambientChord({ ...base, chordIndex: 1 }, 4)).toEqual(ambientChord(base, 5));
  });
});

describe("the clock", () => {
  it("finds the bar and beat from the start time", () => {
    const bar = ambientBarMs(base);
    const position = ambientPosition(base, base.startedAt + bar * 3 + bar / 2);
    expect(position.bar).toBe(3);
    expect(position.beat).toBeCloseTo(2, 6);
    expect(ambientPosition(base, base.startedAt - 1).bar).toBe(-1);
  });

  it("keeps the room's place when the tempo changes", () => {
    const now = base.startedAt + ambientBarMs(base) * 10.25;
    const faster = retimeAmbient(base, 88, now);
    expect(faster.bpm).toBe(88);
    const before = ambientPosition(base, now);
    const after = ambientPosition(faster, now);
    expect(after.bar).toBe(before.bar);
    expect(after.beat).toBeCloseTo(before.beat, 1);
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
