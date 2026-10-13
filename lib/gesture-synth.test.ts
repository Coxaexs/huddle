import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SHAPE_DEGREE,
  SYNTH_KEYS,
  chordFor,
  cleanSynthPlay,
  handShape,
  keyName,
  leadNote,
  leadStep,
  noteName,
  samePlay,
  synthSettings,
  voiceChord,
  voiceDualChords,
  parseSequence,
  chordLetter,
  degreeForLetter,
  type HandPoint,
  type HandShape,
} from "./gesture-synth";

describe("chordFor", () => {
  it("names every chord of a major key with its numeral", () => {
    const labels = [0, 1, 2, 3, 4, 5, 6].map((degree) => chordFor(degree, "A", "major").label);
    expect(labels).toEqual(["A (I)", "Bm (ii)", "C♯m (iii)", "D (IV)", "E (V)", "F♯m (vi)", "G♯° (vii°)"]);
  });

  it("gives a minor key its major V and spells flat keys with flats", () => {
    const minor = [0, 1, 2, 3, 4, 5, 6].map((degree) => chordFor(degree, "A", "minor").label);
    expect(minor).toEqual(["Am (i)", "B° (ii°)", "C (III)", "Dm (iv)", "E (V)", "F (VI)", "G (VII)"]);
    expect(chordFor(3, "F", "major").label).toBe("B♭ (IV)");
    expect(chordFor(0, "Eb", "minor").label).toBe("E♭m (i)");
    expect(chordFor(2, "D", "minor").label).toBe("F (III)");
  });

  it("wraps degrees into the scale", () => {
    expect(chordFor(7, "C", "major").label).toBe("C (I)");
    expect(chordFor(-1, "C", "major").label).toBe("B° (vii°)");
  });
});

describe("voiceChord", () => {
  it("puts the root in the bass and a close triad above it", () => {
    const notes = voiceChord(chordFor(0, "A", "major"));
    expect(notes[0]).toBe(45); // A2
    expect(notes.slice(1).map((note) => note % 12).sort((a, b) => a - b)).toEqual([1, 4, 9]);
    expect(notes[3] - notes[1]).toBeLessThanOrEqual(9);
  });

  it("moves the upper voices as little as possible between chords", () => {
    const progression = [0, 4, 5, 3, 0].map((degree) => chordFor(degree, "C", "major"));
    let previous: number[] | null = null;
    for (const chord of progression) {
      const notes = voiceChord(chord, previous);
      expect(notes[0]).toBeGreaterThanOrEqual(40);
      expect(notes[0]).toBeLessThan(52);
      for (const note of notes.slice(1)) expect(note).toBeGreaterThanOrEqual(52);
      if (previous) {
        const moved = notes.slice(1).reduce((sum, note, index) => sum + Math.abs(note - previous![index + 1]), 0);
        expect(moved).toBeLessThanOrEqual(6);
      }
      previous = notes;
    }
  });
});

describe("voiceDualChords and parseSequence", () => {
  it("combines two chords into a compound voicing within MAX_SYNTH_NOTES", () => {
    const chord1 = chordFor(0, "A", "major");
    const chord2 = chordFor(4, "A", "major");
    const dual = voiceDualChords(chord1, chord2);
    expect(dual.length).toBeGreaterThanOrEqual(4);
    expect(dual.length).toBeLessThanOrEqual(6);
    expect(dual[0]).toBeLessThan(52); // Bass root
  });

  it("returns normal voicing if both degrees are identical", () => {
    const chord1 = chordFor(0, "A", "major");
    const dual = voiceDualChords(chord1, chord1);
    expect(dual).toEqual(voiceChord(chord1));
  });

  it("parses sequence strings into degree arrays", () => {
    const parsed = parseSequence("1 2 3 5 2 1 4 5 2 6 5 7");
    expect(parsed).toEqual([1, 2, 3, 5, 2, 1, 4, 5, 2, 6, 5, 7]);
    expect(parseSequence("I - V - vi - IV")).toEqual([]);
    expect(parseSequence("1,4,5,1")).toEqual([1, 4, 5, 1]);
    expect(parseSequence("C G Am F", "C", "major")).toEqual([1, 5, 6, 4]);
    expect(parseSequence("A B C", "C", "major")).toEqual([6, 7, 1]);
    expect(parseSequence("A B C", "A", "major")).toEqual([1, 2, 3]);
  });

  it("maps letters A–G to unique chord degrees in any scale", () => {
    // In C major: C is I (0), D is ii (1), E is iii (2), F is IV (3), G is V (4), A is vi (5), B is vii° (6)
    expect(degreeForLetter("C", "C", "major")).toBe(0);
    expect(degreeForLetter("D", "C", "major")).toBe(1);
    expect(degreeForLetter("E", "C", "major")).toBe(2);
    expect(degreeForLetter("F", "C", "major")).toBe(3);
    expect(degreeForLetter("G", "C", "major")).toBe(4);
    expect(degreeForLetter("A", "C", "major")).toBe(5);
    expect(degreeForLetter("B", "C", "major")).toBe(6);

    // In A major: A is I (0), B is ii (1), C is iii (2), etc.
    expect(degreeForLetter("A", "A", "major")).toBe(0);
    expect(degreeForLetter("B", "A", "major")).toBe(1);
    expect(degreeForLetter("C", "A", "major")).toBe(2);

    // Case insensitivity
    expect(degreeForLetter("a", "C", "major")).toBe(5);
    expect(degreeForLetter("c", "C", "major")).toBe(0);

    // Non-note letter returns null
    expect(degreeForLetter("Z", "C", "major")).toBeNull();

    // Verify 1-to-1 bijection for all 12 keys in both modes
    const modes = ["major", "minor"] as const;
    const letters = ["A", "B", "C", "D", "E", "F", "G"];
    for (const k of SYNTH_KEYS) {
      for (const m of modes) {
        const degrees = letters.map((l) => degreeForLetter(l, k, m));
        expect(degrees).not.toContain(null);
        expect(new Set(degrees).size).toBe(7);
      }
    }
  });
});

describe("lead", () => {
  it("climbs the scale from the bottom of the picture to the top", () => {
    expect(leadStep(0.9, null)).toBe(0);
    expect(leadStep(0.1, null)).toBe(14);
    expect(leadNote(0, "A", "major")).toBe(69);
    expect(leadNote(2, "A", "major")).toBe(73);
    expect(leadNote(7, "A", "major")).toBe(81);
    expect(noteName(leadNote(14, "A", "major"), "A", "major")).toBe("A6");
  });

  it("holds a note while the finger wobbles on a boundary", () => {
    const height = (step: number) => 0.85 - (step / 14) * 0.7;
    expect(leadStep(height(5.55), null)).toBe(6);
    expect(leadStep(height(5.55), 5)).toBe(5);
    expect(leadStep(height(5.8), 5)).toBe(6);
  });
});

describe("settings and wire format", () => {
  it("defaults to A major and rejects unknown keys", () => {
    expect(synthSettings({})).toEqual({ key: "A", mode: "major" });
    expect(synthSettings({ key: "F#", mode: "minor" })).toEqual({ key: "F#", mode: "minor" });
    expect(synthSettings({ key: "H", mode: "dorian" })).toEqual({ key: "A", mode: "major" });
    expect(keyName("Bb")).toBe("B♭");
    expect(keyName("F#")).toBe("F♯");
  });

  it("keeps a play small and sane", () => {
    expect(cleanSynthPlay(null)).toBeNull();
    expect(cleanSynthPlay({ notes: "C" })).toBeNull();
    const play = cleanSynthPlay({
      notes: [45, 45, 61, 3.5, 200, 64, 69, 70, 71, 72, 73],
      lead: 300,
      sound: "kazoo",
      bright: 7,
      label: "  A (I)\u0007 and a very long tail that goes on  ",
    })!;
    expect(play.notes).toEqual([45, 61, 64, 69, 70, 71]);
    expect(play.lead).toBeNull();
    expect(play.sound).toBe("warm");
    expect(play.bright).toBe(1);
    expect(play.label).toBe("A (I) and a very long ta");
  });

  it("treats a tiny brightness drift as the same play", () => {
    const a = { notes: [45, 61], lead: null, sound: "warm" as const, bright: 0.5, label: "A (I)" };
    expect(samePlay(a, { ...a, bright: 0.52 })).toBe(true);
    expect(samePlay(a, { ...a, bright: 0.6 })).toBe(false);
    expect(samePlay(a, { ...a, notes: [45, 62] })).toBe(false);
  });
});

/**
 * A hand facing the camera, wrist at the bottom: each finger either straight up
 * or folded into the palm, and the thumb either out to the side or tucked.
 */
function hand(up: { thumb?: boolean; index?: boolean; middle?: boolean; ring?: boolean; pinky?: boolean }): HandPoint[] {
  const points: HandPoint[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  points[0] = { x: 0.5, y: 0.8 };
  points[1] = { x: 0.45, y: 0.76 };
  if (up.thumb) {
    points[2] = { x: 0.42, y: 0.72 };
    points[3] = { x: 0.36, y: 0.67 };
    points[4] = { x: 0.3, y: 0.62 };
  } else {
    points[2] = { x: 0.42, y: 0.7 };
    points[3] = { x: 0.45, y: 0.66 };
    points[4] = { x: 0.5, y: 0.64 };
  }
  const fingers: Array<[number, number, boolean | undefined]> = [
    [5, 0.44, up.index],
    [9, 0.48, up.middle],
    [13, 0.52, up.ring],
    [17, 0.56, up.pinky],
  ];
  for (const [mcp, x, straight] of fingers) {
    points[mcp] = { x, y: 0.6 };
    points[mcp + 1] = { x, y: 0.52 + (straight ? 0 : 0.02) };
    points[mcp + 2] = straight ? { x, y: 0.47 } : { x, y: 0.56 };
    points[mcp + 3] = straight ? { x, y: 0.43 } : { x, y: 0.62 };
  }
  return points;
}

function transform(points: HandPoint[], angle: number, scale: number, aspect = 1): HandPoint[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(({ x, y }) => {
    const dx = (x - 0.5) * scale;
    const dy = (y - 0.6) * scale;
    // Rotate in square space, then squash x the way a wide frame's normalised coordinates do.
    return { x: (0.5 + dx * cos - dy * sin) / aspect, y: 0.6 + dx * sin + dy * cos };
  });
}

describe("handShape", () => {
  const cases: Array<[HandShape, Parameters<typeof hand>[0]]> = [
    ["fist", {}],
    ["thumb", { thumb: true }],
    ["one", { index: true }],
    ["two", { index: true, middle: true }],
    ["three", { index: true, middle: true, ring: true }],
    ["four", { index: true, middle: true, ring: true, pinky: true }],
    ["five", { thumb: true, index: true, middle: true, ring: true, pinky: true }],
    ["horns", { index: true, pinky: true }],
    ["love", { thumb: true, index: true, pinky: true }],
    ["other", { middle: true }],
  ];

  it("reads each sign", () => {
    for (const [shape, up] of cases) expect(handShape(hand(up)), shape).toBe(shape);
  });

  it("reads the same signs tilted, smaller, and from a wide camera", () => {
    for (const [shape, up] of cases) {
      expect(handShape(transform(hand(up), 0.5, 0.6), 1), `${shape} tilted`).toBe(shape);
      expect(handShape(transform(hand(up), -0.35, 1.3, 16 / 9), 16 / 9), `${shape} wide`).toBe(shape);
    }
  });

  it("maps the seven chord signs to the seven degrees", () => {
    expect(Object.entries(SHAPE_DEGREE).sort((a, b) => a[1]! - b[1]!).map(([shape]) => shape)).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
      "horns",
      "love",
    ]);
  });

  it("gives up on a partial hand", () => {
    expect(handShape(hand({ index: true }).slice(0, 10))).toBe("other");
  });

  it("reads real hands as MediaPipe reports them from photos", () => {
    const fixture = JSON.parse(readFileSync(new URL("./gesture-synth.hands.json", import.meta.url), "utf8")) as {
      hands: Array<{ source: string; expect: HandShape; aspect: number; points: Array<[number, number, number]> }>;
    };
    expect(new Set(fixture.hands.map((entry) => entry.expect))).toEqual(
      new Set(["one", "two", "five", "horns", "love", "fist", "thumb"]),
    );
    for (const entry of fixture.hands) {
      const points = entry.points.map(([x, y, z]) => ({ x, y, z }));
      expect(handShape(points, entry.aspect), entry.source).toBe(entry.expect);
    }
  });
});
