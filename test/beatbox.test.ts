import { describe, expect, it } from "vitest";
import {
  BEATBOX_NOTE_MAX,
  BEATBOX_NOTE_MIN,
  BEATBOX_STEPS,
  beatboxNoteName,
  beatboxState,
  randomBeatboxPattern,
  starterBeatboxState,
} from "@/lib/beatbox";

describe("beatboxState", () => {
  it("fills in a complete default from nothing", () => {
    const state = beatboxState(null);
    expect(state.bpm).toBe(128);
    expect(state.wave).toBe("sawtooth");
    for (const lane of Object.values(state.pattern)) expect(lane).toHaveLength(BEATBOX_STEPS);
    expect(state.pattern.kick.some(Boolean)).toBe(false);
  });

  it("clamps knobs and drops what is not a step", () => {
    const state = beatboxState({
      bpm: 900,
      filterCutoff: -5,
      filterResonance: 99,
      envMod: "loud",
      wave: "sine",
      pattern: {
        kick: [true, 1, "yes", ...Array(40).fill(true)],
        bassNotes: [36, 60, 61, 35, 48.4, "x"],
        snare: "nope",
      },
    });
    expect(state.bpm).toBe(160);
    expect(state.filterCutoff).toBe(80);
    expect(state.filterResonance).toBe(18);
    expect(state.envMod).toBe(0.6);
    expect(state.wave).toBe("sawtooth");
    expect(state.pattern.kick).toHaveLength(BEATBOX_STEPS);
    expect(state.pattern.kick.slice(0, 4)).toEqual([true, false, false, true]);
    expect(state.pattern.bassNotes.slice(0, 7)).toEqual([36, 60, 0, 0, 48, 0, 0]);
    expect(state.pattern.snare.some(Boolean)).toBe(false);
  });

  it("round-trips its own output", () => {
    const starter = starterBeatboxState();
    expect(beatboxState(JSON.parse(JSON.stringify(starter)))).toEqual(starter);
  });
});

describe("randomBeatboxPattern", () => {
  it("stays in range and only slides out of a note", () => {
    for (let run = 0; run < 50; run += 1) {
      const pattern = randomBeatboxPattern();
      expect(pattern.bassNotes[0]).toBeGreaterThan(0);
      pattern.bassNotes.forEach((note, step) => {
        if (note) {
          expect(note).toBeGreaterThanOrEqual(BEATBOX_NOTE_MIN);
          expect(note).toBeLessThanOrEqual(BEATBOX_NOTE_MAX);
        }
        if (pattern.bassSlides[step]) expect(pattern.bassNotes[step - 1]).toBeGreaterThan(0);
        expect(pattern.hihat[step] && pattern.openhat[step]).toBe(false);
      });
    }
  });
});

describe("beatboxNoteName", () => {
  it("names the ends of the range", () => {
    expect(beatboxNoteName(36)).toBe("C2");
    expect(beatboxNoteName(60)).toBe("C4");
    expect(beatboxNoteName(42)).toBe("F♯2");
  });
});
