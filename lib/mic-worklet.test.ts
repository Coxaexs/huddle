import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The microphone worklet is a plain script in `public/` because that is the
 * only shape `audioWorklet.addModule()` accepts, so it cannot simply be
 * imported. Loading it into a sandbox with the handful of globals an
 * AudioWorkletGlobalScope provides gets it under test anyway.
 */

const ROOT = join(import.meta.dirname, "..");
const SAMPLE_RATE = 48000;
const QUANTUM = 128;

interface Telemetry {
  inputDb: number;
  outputDb: number;
  floorDb: number;
  vad: number;
  gateOpen: boolean;
  gainDb: number;
}

interface Settings {
  mode?: string;
  gainDb?: number;
  autoGain?: boolean;
  sensitivity?: number | "auto";
  gate?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Processor: any;
/**
 * Raw bytes, not a compiled module: the worklet compiles the binary itself
 * because a `WebAssembly.Module` does not survive being posted into an audio
 * worklet. Keeping the test on the same contract is the point.
 */
let rnnoiseBytes: ArrayBuffer;

beforeAll(async () => {
  const source = readFileSync(join(ROOT, "public/mic-worklet.js"), "utf8");
  const sandbox: Record<string, unknown> = {
    sampleRate: SAMPLE_RATE,
    WebAssembly,
    Math,
    Float32Array,
    Uint8Array,
    Array,
    ArrayBuffer,
    Infinity,
    String,
    Number,
    console,
    AudioWorkletProcessor: class {
      port = { postMessage() {}, onmessage: null };
    },
    registerProcessor: (_name: string, cls: unknown) => {
      Processor = cls;
    },
  };
  createContext(sandbox);
  runInContext(source, sandbox);

  const file = readFileSync(join(ROOT, "public/rnnoise.wasm"));
  rnnoiseBytes = file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
});

/** Runs a signal through the processor and reports what came out. */
function render(
  settings: Settings,
  sample: (t: number) => number,
  { rnnoise = false, seconds = 8 } = {},
) {
  const processor = new Processor({ processorOptions: settings });
  let latest: Telemetry | null = null;
  processor.port.postMessage = (message: { type: string } & Telemetry) => {
    if (message.type === "telemetry") latest = message;
  };
  if (rnnoise) processor.handleMessage({ type: "wasm", bytes: rnnoiseBytes });

  const quanta = Math.round((seconds * SAMPLE_RATE) / QUANTUM);
  const rendered: number[] = [];
  let n = 0;
  for (let q = 0; q < quanta; q++) {
    const input = new Float32Array(QUANTUM);
    for (let i = 0; i < QUANTUM; i++) input[i] = sample(n++ / SAMPLE_RATE);
    const output = new Float32Array(QUANTUM);
    processor.process([[input]], [[output]]);
    rendered.push(...output);
  }

  // Judge the second half, once the gain loop and noise floor have settled.
  const tail = rendered.slice(rendered.length / 2);
  let energy = 0;
  let peak = 0;
  for (const value of tail) {
    energy += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  return {
    rmsDb: 20 * Math.log10(Math.sqrt(energy / tail.length) + 1e-12),
    peak,
    telemetry: latest as Telemetry | null,
  };
}

const tone = (t: number) =>
  Math.sin(2 * Math.PI * 220 * t) * 0.6 +
  Math.sin(2 * Math.PI * 440 * t) * 0.3 +
  Math.sin(2 * Math.PI * 880 * t) * 0.1;

/**
 * Bursts of ~1.2s with ~0.8s of pause. Continuous tones are indistinguishable
 * from steady noise to any energy detector, so a test built on one would only
 * prove the detector cannot cheat.
 */
const speech = (amplitude: number) => (t: number) =>
  t % 2 < 1.2 ? amplitude * tone(t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t)) : 0;

/**
 * Seeded noise. RNNoise converges on a stationary source at a rate that depends
 * on the exact samples it sees, so `Math.random` here makes the suppression
 * assertions flaky rather than wrong.
 */
const hiss = (amplitude: number) => {
  let seed = 0x9e3779b9;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return (((x ^ (x >>> 14)) >>> 0) / 4294967296 - 0.5) * 2 * amplitude;
  };
};
const both =
  (a: (t: number) => number, b: (t: number) => number) => (t: number) =>
    a(t) + b(t);

const OFF: Settings = { mode: "off", autoGain: false, gainDb: 0, gate: false };

describe("mic worklet", () => {
  it("passes audio through untouched when nothing is enabled", () => {
    const expected = 20 * Math.log10(0.2 * Math.sqrt((0.36 + 0.09 + 0.01) / 2));
    const { rmsDb } = render(OFF, (t) => 0.2 * tone(t), { seconds: 3 });
    expect(rmsDb).toBeCloseTo(expected, 1);
  });

  it("applies manual gain exactly", () => {
    const quiet = render(OFF, speech(0.1), { seconds: 3 });
    const boosted = render({ ...OFF, gainDb: 12 }, speech(0.1), { seconds: 3 });
    expect(boosted.rmsDb - quiet.rmsDb).toBeCloseTo(12, 0);
  });

  it("brings quiet and loud voices to the same level with auto gain", () => {
    const settings: Settings = { mode: "off", autoGain: true, gate: false };
    const quiet = render(settings, speech(0.02), { seconds: 16 });
    const loud = render(settings, speech(0.9), { seconds: 16 });

    expect(quiet.telemetry!.gainDb).toBeGreaterThan(12);
    expect(loud.telemetry!.gainDb).toBeLessThan(0);
    expect(Math.abs(quiet.rmsDb - loud.rmsDb)).toBeLessThan(3);
  });

  it("never lets a large boost clip", () => {
    const { peak } = render({ ...OFF, gainDb: 30 }, speech(0.3), { seconds: 3 });
    expect(peak).toBeLessThanOrEqual(1);
  });

  it("gates out an idle room but not a voice in it", () => {
    const gated: Settings = { mode: "off", autoGain: false, gainDb: 0, gate: true, sensitivity: "auto" };
    const idle = render(gated, hiss(0.004));
    const talking = render(gated, both(speech(0.2), hiss(0.004)));

    expect(idle.rmsDb).toBeLessThan(-80);
    expect(talking.rmsDb).toBeGreaterThan(-30);
  });

  it("honours a manual sensitivity threshold", () => {
    const settings = (sensitivity: number): Settings => ({
      mode: "off",
      autoGain: false,
      gainDb: 0,
      gate: true,
      sensitivity,
    });
    // The source sits near -26 dBFS, so a threshold either side of it decides.
    expect(render(settings(-10), speech(0.2)).rmsDb).toBeLessThan(-80);
    expect(render(settings(-45), speech(0.2)).rmsDb).toBeGreaterThan(-30);
  });

  it("does not mistake loud steady noise for speech", () => {
    const { telemetry } = render(OFF, hiss(0.06));
    expect(telemetry!.vad).toBe(0);
  });

  describe("with RNNoise", () => {
    const settings: Settings = { mode: "rnnoise", autoGain: false, gainDb: 0, gate: false };

    // RNNoise learns a stationary noise progressively rather than all at once,
    // so give it long enough to settle before judging it.
    it("strips steady noise that passes straight through otherwise", () => {
      const raw = render({ ...settings, mode: "off" }, hiss(0.06), { seconds: 16 });
      const denoised = render(settings, hiss(0.06), { rnnoise: true, seconds: 16 });
      expect(denoised.rmsDb).toBeLessThan(raw.rmsDb - 20);
    });

    it("keeps the voice and reports it as speech", () => {
      const { rmsDb } = render(settings, both(speech(0.2), hiss(0.06)), {
        rnnoise: true,
      });
      expect(rmsDb).toBeGreaterThan(-30);
    });

    it("still works alongside auto gain", () => {
      const withAgc: Settings = { mode: "rnnoise", autoGain: true, gate: true, sensitivity: "auto" };
      const quiet = render(withAgc, both(speech(0.02), hiss(0.02)), { rnnoise: true, seconds: 16 });
      const loud = render(withAgc, both(speech(0.6), hiss(0.02)), { rnnoise: true, seconds: 16 });
      expect(Math.abs(quiet.rmsDb - loud.rmsDb)).toBeLessThan(4);
    });
  });

  it("keeps working when RNNoise never arrives", () => {
    const { rmsDb, telemetry } = render(
      { mode: "rnnoise", autoGain: false, gainDb: 6, gate: false },
      speech(0.2),
      { seconds: 3 },
    );
    expect(telemetry).not.toBeNull();
    expect(rmsDb).toBeGreaterThan(-40);
  });
});
