import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The screen-share echo canceller, loaded the same way as the mic worklet (see
 * mic-worklet.test.ts). The room's voices go out through a simulated audio
 * router (a delay, some colouring, a level change) and come back mixed into
 * "game" audio, which is what a whole-screen share through SteelSeries Sonar
 * picks up.
 */

const ROOT = join(import.meta.dirname, "..");
const RATE = 48000;
const QUANTUM = 128;
/** The worklet answers one block behind. */
const LATENCY = 512;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Processor: any;

beforeAll(() => {
  const source = readFileSync(join(ROOT, "public/screen-echo-worklet.js"), "utf8");
  const sandbox: Record<string, unknown> = {
    sampleRate: RATE,
    Math,
    Number,
    Array,
    Float32Array,
    Float64Array,
    Uint16Array,
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

/** A small deterministic PRNG so every run hears the same thing. */
function noise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 31 - 1;
  };
}

/** Speech-like: coloured noise, syllables at ~4 Hz, two seconds of talk then one of silence. */
function voices(samples: number) {
  const rand = noise(7);
  const out = new Float32Array(samples);
  let lp = 0;
  let hp = 0;
  for (let n = 0; n < samples; n++) {
    const t = n / RATE;
    const talking = t % 3 < 2;
    const syllable = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4.3 * t + Math.sin(2 * Math.PI * 0.7 * t));
    lp += (rand() - lp) * 0.25;
    const band = lp - hp;
    hp += (lp - hp) * 0.02;
    out[n] = talking ? 0.6 * band * syllable : 0;
  }
  return out;
}

/** Game or film audio: chords with vibrato over noise, never silent. */
function game(samples: number, level: number) {
  const rand = noise(99);
  const out = new Float32Array(samples);
  let lp = 0;
  for (let n = 0; n < samples; n++) {
    const t = n / RATE;
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t);
    lp += (rand() - lp) * 0.1;
    out[n] = level * (
      0.3 * Math.sin(2 * Math.PI * 220 * vib * t) +
      0.2 * Math.sin(2 * Math.PI * 277 * vib * t) +
      0.15 * Math.sin(2 * Math.PI * 330 * t + Math.sin(t)) +
      0.35 * lp
    );
  }
  return out;
}

/** What a router does to the voices on their way back in: late, coloured, quieter. */
function echoOf(reference: Float32Array, delay: number, gain: number) {
  const out = new Float32Array(reference.length);
  const taps = [1, 0.35, -0.2, 0.1, 0.05];
  let lp = 0;
  for (let n = 0; n < reference.length; n++) {
    let v = 0;
    for (let k = 0; k < taps.length; k++) {
      const i = n - delay - k * 3;
      if (i >= 0) v += taps[k] * reference[i];
    }
    lp += (v - lp) * 0.6;
    out[n] = gain * lp;
  }
  return out;
}

function run(capture: Float32Array, reference: Float32Array | null) {
  const processor = new Processor();
  const out = new Float32Array(capture.length);
  for (let at = 0; at + QUANTUM <= capture.length; at += QUANTUM) {
    const c = capture.subarray(at, at + QUANTUM);
    const r = reference?.subarray(at, at + QUANTUM);
    const left = new Float32Array(QUANTUM);
    const right = new Float32Array(QUANTUM);
    processor.process([[c, c], r ? [r, r] : []], [[left, right]]);
    out.set(left, at);
  }
  return out;
}

/** Energy of a − b over [from, to), with b shifted by the worklet's latency. */
function energy(a: Float32Array, b: Float32Array | null, from: number, to: number) {
  let sum = 0;
  for (let n = from; n < to; n++) {
    const v = a[n] - (b ? b[n - LATENCY] : 0);
    sum += v * v;
  }
  return sum;
}

const db = (ratio: number) => 10 * Math.log10(ratio);

// Each case runs the canceller over ~25 seconds of 48 kHz audio: about 2.5 s
// alone, and well past vitest's 5 s default while the whole suite shares the
// CPU. The answers are deterministic (seeded noise); only the time varied.
describe("screen-share echo canceller", { timeout: 30_000 }, () => {
  const seconds = 24;
  const samples = seconds * RATE;
  const ref = voices(samples);
  const from = 16 * RATE;
  const to = samples;

  // The louder the shared audio, the less of the echo can be heard over it
  // anyway, and the harder it is to learn through.
  it.each([
    ["shared audio quieter than the echo", 0.15, 18],
    ["shared audio a little louder than the echo", 0.4, 12],
    ["shared audio far louder than the echo", 1, 8],
  ])("removes the room's voices with %s", (_label, level, wantDb) => {
    const near = game(samples, level);
    const echo = echoOf(ref, Math.round(0.09 * RATE), 0.7);
    const capture = near.map((v, n) => v + echo[n]);
    const started = performance.now();
    const out = run(capture, ref);
    const took = (performance.now() - started) / 1000;

    const echoEnergy = energy(echo, null, from - LATENCY, to - LATENCY);
    const residual = energy(out, near, from, to);
    expect(db(echoEnergy / residual)).toBeGreaterThan(wantDb);
    // Comfortably faster than real time on one core, both ears included.
    expect(took / seconds).toBeLessThan(0.25);
  });

  it("converges within a few seconds of talk", () => {
    const near = game(samples, 0.4);
    const echo = echoOf(ref, Math.round(0.12 * RATE), 0.7);
    const capture = near.map((v, n) => v + echo[n]);
    const out = run(capture, ref);
    // Seconds 3–5: the second talk spurt.
    const a = 3 * RATE;
    const b = 5 * RATE;
    expect(db(energy(echo, null, a - LATENCY, b - LATENCY) / energy(out, near, a, b))).toBeGreaterThan(8);
  });

  it("finds the echo again when its delay changes", () => {
    const near = game(samples, 0.4);
    const before = echoOf(ref, Math.round(0.09 * RATE), 0.7);
    const after = echoOf(ref, Math.round(0.16 * RATE), 0.7);
    const at = 12 * RATE;
    const echo = before.map((v, n) => (n < at ? v : after[n]));
    const capture = near.map((v, n) => v + echo[n]);
    const out = run(capture, ref);
    // Seconds 21–23, a talk spurt nine seconds after the jump.
    const a = 21 * RATE;
    const b = 23 * RATE;
    expect(db(energy(echo, null, a - LATENCY, b - LATENCY) / energy(out, near, a, b))).toBeGreaterThan(10);
  });

  it("leaves the shared audio alone when there is no echo in it", () => {
    const near = game(samples, 0.4);
    const out = run(near, ref);
    // What it added or took away, against the shared audio itself.
    expect(db(energy(out, near, from, to) / energy(near, null, from, to))).toBeLessThan(-30);
  });

  it("passes the capture through untouched while nobody talks", () => {
    const near = game(4 * RATE, 0.4);
    const out = run(near, null);
    let worst = 0;
    for (let n = LATENCY; n < near.length; n++) worst = Math.max(worst, Math.abs(out[n] - near[n - LATENCY]));
    expect(worst).toBeLessThan(1e-4);
  });
});
