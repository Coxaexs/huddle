import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The singing voice's tuner (`public/tune-worklet.js`), loaded into a sandbox
 * the same way as the mic worklet in `mic-worklet.test.ts`.
 */

const ROOT = join(import.meta.dirname, "..");
const RATE = 48000;
const QUANTUM = 128;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Processor: any;

beforeAll(() => {
  const source = readFileSync(join(ROOT, "public/tune-worklet.js"), "utf8");
  const sandbox: Record<string, unknown> = {
    Math,
    Float32Array,
    AudioWorkletProcessor: class {
      port = { postMessage() {}, onmessage: null };
    },
    registerProcessor: (_name: string, cls: unknown) => {
      Processor = cls;
    },
  };
  createContext(sandbox);
  runInContext(source, sandbox);
});

function render(input: Float32Array, key?: object, ...messages: object[]): Float32Array {
  const processor = new Processor({ processorOptions: {} });
  for (const data of [key, ...messages]) if (data) processor.port.onmessage({ data });
  const output = new Float32Array(input.length);
  for (let i = 0; i + QUANTUM <= input.length; i += QUANTUM) {
    const block = new Float32Array(QUANTUM);
    processor.process([[input.subarray(i, i + QUANTUM)]], [[block]]);
    output.set(block, i);
  }
  return output;
}

/** A sung-ish note: a fundamental and a few harmonics. */
function note(hz: number, seconds: number): Float32Array {
  const samples = new Float32Array(Math.floor(RATE * seconds));
  let phase = 0;
  for (let i = 0; i < samples.length; i++) {
    phase += (2 * Math.PI * hz) / RATE;
    samples[i] = 0.3 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.3 * Math.sin(3 * phase));
  }
  return samples;
}

/** The pitch of a stretch, by normalised autocorrelation (first strong peak). */
function pitch(x: Float32Array, from: number, to: number): number {
  const score = (lag: number) => {
    let sum = 0;
    let a = 0;
    let b = 0;
    for (let i = from; i < to; i++) {
      sum += x[i] * x[i + lag];
      a += x[i] * x[i];
      b += x[i + lag] * x[i + lag];
    }
    return sum / Math.sqrt(a * b + 1e-12);
  };
  let best = 0;
  let bestLag = 0;
  for (let lag = 40; lag < 700; lag++) {
    const r = score(lag);
    if (r > best) {
      best = r;
      bestLag = lag;
    }
    if (best > 0.97 && r < best - 0.05) break;
  }
  const [a, b, c] = [score(bestLag - 1), score(bestLag), score(bestLag + 1)];
  return RATE / (bestLag + (0.5 * (a - c)) / (a - 2 * b + c));
}

const centsFrom = (hz: number, reference: number) => 1200 * Math.log2(hz / reference);

describe("tune worklet", () => {
  it.each([
    [-25, 440],
    [35, 440],
    [-30, 220],
  ])("snaps a note %i cents off onto it", (off, reference) => {
    const input = note(reference * Math.pow(2, off / 1200), 1.5);
    const output = render(input);
    const after = centsFrom(pitch(output, RATE, RATE + 4000), reference);
    expect(Math.abs(after)).toBeLessThan(4);
  });

  it("holds a wobbly, off-key note steady on one note", () => {
    // A 5.5 Hz vibrato, 35 cents each way, around a centre 40 cents sharp of A3:
    // its peaks come nearer A#3 than A3, but it is one note, sung badly.
    const input = new Float32Array(RATE * 2);
    let phase = 0;
    for (let i = 0; i < input.length; i++) {
      const cents = 40 + 35 * Math.sin((2 * Math.PI * 5.5 * i) / RATE);
      phase += (2 * Math.PI * 220 * Math.pow(2, cents / 1200)) / RATE;
      input[i] = 0.3 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.3 * Math.sin(3 * phase));
    }
    const output = render(input);
    for (let at = RATE / 2; at < RATE * 1.8; at += 2400) {
      expect(Math.abs(centsFrom(pitch(output, at, at + 2400), 220))).toBeLessThan(30);
    }
  });

  it("in a key, pulls a wrong note onto the key's nearest one", () => {
    const sung = 440 * Math.pow(2, (61.3 - 69) / 12); // between C and D, nearer C#
    const cMajor = { scale: [0, 2, 4, 5, 7, 9, 11] };
    const d = 440 * Math.pow(2, (62 - 69) / 12);
    const inKey = centsFrom(pitch(render(note(sung, 1.5), cMajor), RATE, RATE + 4000), d);
    expect(Math.abs(inKey)).toBeLessThan(25);
    // Without the key it is a C#, left where it is.
    const sharp = 440 * Math.pow(2, (61 - 69) / 12);
    expect(Math.abs(centsFrom(pitch(render(note(sung, 1.5)), RATE, RATE + 4000), sharp))).toBeLessThan(15);
    // A song played a quarter tone sharp moves the notes with it.
    const bent = centsFrom(pitch(render(note(d * Math.pow(2, 0.4 / 12), 1.5), { ...cMajor, offset: 0.5 }), RATE, RATE + 4000), d);
    expect(Math.abs(bent - 50)).toBeLessThan(10);
  });

  it("leaves an in-tune note and the level alone", () => {
    const input = note(440, 1.5);
    const output = render(input);
    expect(Math.abs(centsFrom(pitch(output, RATE, RATE + 4000), 440))).toBeLessThan(2);
    let a = 0;
    let b = 0;
    for (let i = RATE; i < RATE + 20000; i++) {
      a += input[i] * input[i];
      b += output[i] * output[i];
    }
    expect(Math.abs(10 * Math.log10(b / a))).toBeLessThan(0.2);
  });

  it("does not overshoot when the pitch leaps", () => {
    const input = new Float32Array(RATE * 2);
    let phase = 0;
    for (let i = 0; i < input.length; i++) {
      phase += (2 * Math.PI * (i < RATE ? 400 : 150)) / RATE;
      input[i] = 0.3 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase));
    }
    const output = render(input);
    const peak = (x: Float32Array) => x.reduce((most, v) => Math.max(most, Math.abs(v)), 0);
    expect(peak(output)).toBeLessThan(peak(input) * 1.1);
  });
});

/** A held note per entry (MIDI, seconds), back to back. */
function melodyOf(notes: Array<[number, number]>): Float32Array {
  const total = notes.reduce((sum, [, seconds]) => sum + Math.floor(RATE * seconds), 0);
  const out = new Float32Array(total);
  let at = 0;
  let phase = 0;
  for (const [midi, seconds] of notes) {
    const hz = 440 * Math.pow(2, (midi - 69) / 12);
    const n = Math.floor(RATE * seconds);
    for (let i = 0; i < n; i++) {
      phase += (2 * Math.PI * hz) / RATE;
      out[at + i] = 0.3 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.3 * Math.sin(3 * phase));
    }
    at += n;
  }
  return out;
}

const hzOf = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

describe("tune worklet: knowing what you mean", () => {
  it("pulls a far-off note onto the song's melody, in your octave", () => {
    // The original sings E4 (64) for three seconds; you sing D4 and a bit (62.2),
    // or D3 and a bit (50.2): both are taken to mean E, in the octave sung.
    const melody = { melody: [0, 3000, 64], clock: { positionMs: 0, at: 0, playing: true } };
    for (const [sung, meant] of [[62.2, 64], [50.2, 52]]) {
      const output = render(note(hzOf(sung), 1.5), undefined, melody);
      expect(Math.abs(centsFrom(pitch(output, RATE, RATE + 4000), hzOf(meant)))).toBeLessThan(25);
    }
    // Once the song moves past that note, it no longer applies.
    const later = { melody: [0, 3000, 64], clock: { positionMs: 10000, at: 0, playing: true } };
    const output = render(note(hzOf(62.2), 1.5), undefined, later);
    expect(Math.abs(centsFrom(pitch(output, RATE, RATE + 4000), hzOf(62)))).toBeLessThan(15);
  });

  it("learns the key from the notes you hold when the song's is unknown", () => {
    // Eight seconds of a C major tune, then a note between C# and D, nearer C#:
    // having heard the key, it is taken to be D.
    const tune: Array<[number, number]> = [];
    const steps = [60, 62, 64, 65, 67, 69, 71, 72, 67, 64, 60, 62, 64, 67, 65, 64];
    for (let i = 0; i < 16; i++) tune.push([steps[i], 0.5]);
    tune.push([61.3, 1.2]);
    const input = melodyOf(tune);
    const output = render(input);
    const at = input.length - RATE / 2;
    expect(Math.abs(centsFrom(pitch(output, at, at + 4000), hzOf(62)))).toBeLessThan(25);
  });

  it("natural style lets a vibrato through and still centres it on the note", () => {
    const input = new Float32Array(RATE * 2);
    let phase = 0;
    for (let i = 0; i < input.length; i++) {
      const cents = 40 + 35 * Math.sin((2 * Math.PI * 5.5 * i) / RATE);
      phase += (2 * Math.PI * 220 * Math.pow(2, cents / 1200)) / RATE;
      input[i] = 0.3 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.3 * Math.sin(3 * phase));
    }
    const output = render(input, { style: "natural" });
    const cents: number[] = [];
    for (let at = RATE; at < RATE * 1.9; at += 600) cents.push(centsFrom(pitch(output, at, at + 1200), 220));
    const mean = cents.reduce((a, b) => a + b, 0) / cents.length;
    expect(Math.abs(mean)).toBeLessThan(12);
    expect(Math.max(...cents) - Math.min(...cents)).toBeGreaterThan(30);
  });
});

describe("camelotScale", () => {
  it("reads a Camelot key as its notes", async () => {
    const { camelotScale } = await import("../app/lib/voice-effects");
    expect(camelotScale("8B")).toEqual([0, 2, 4, 5, 7, 9, 11]); // C major
    expect(camelotScale("8A")).toEqual(camelotScale("8B")); // A minor: the same notes
    expect(camelotScale("9b")?.[0]).toBe(7); // G major
    expect(camelotScale("1B")?.[0]).toBe(11); // B major
    expect(camelotScale("13A")).toBeNull();
    expect(camelotScale(null)).toBeNull();
  });
});
