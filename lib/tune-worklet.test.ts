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

function render(input: Float32Array, key?: { scale: number[]; offset?: number }): Float32Array {
  const processor = new Processor({ processorOptions: {} });
  if (key) processor.port.onmessage({ data: key });
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
  ])("pulls a note %i cents off nearly in tune", (off, reference) => {
    const input = note(reference * Math.pow(2, off / 1200), 1.5);
    const output = render(input);
    const after = centsFrom(pitch(output, RATE, RATE + 4000), reference);
    // Most of the way, but not snapped dead on (that is the robot sound).
    expect(Math.abs(after)).toBeLessThan(Math.abs(off) * 0.3);
    expect(Math.abs(after)).toBeGreaterThan(Math.abs(off) * 0.05);
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
