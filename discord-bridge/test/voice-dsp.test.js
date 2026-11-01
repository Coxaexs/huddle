import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FRAME,
  Leveler,
  Mixer,
  dbOf,
  rms,
  PitchShifter,
  SAMPLE_RATE,
  VOICE_EFFECTS,
  createEffect,
  int16ToMono,
  monoToInt16,
  monoToStereo,
  peak,
  softLimit,
  stereoToMono,
} from "../src/voice/dsp.js";

const sine = (frequency, samples, amplitude = 0.5, start = 0) => {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) out[i] = amplitude * Math.sin((2 * Math.PI * frequency * (start + i)) / SAMPLE_RATE);
  return out;
};

/** Frequency from upward zero crossings. */
function frequencyOf(samples) {
  let crossings = 0;
  let first = -1;
  let last = -1;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1] <= 0 && samples[i] > 0) {
      crossings++;
      if (first < 0) first = i;
      last = i;
    }
  }
  return ((crossings - 1) * SAMPLE_RATE) / (last - first);
}

test("formats round-trip between Discord's stereo, LiveKit's Int16 and floats", () => {
  const mono = sine(440, FRAME);
  const back = stereoToMono(monoToStereo(mono));
  assert.equal(back.length, FRAME);
  for (let i = 0; i < FRAME; i += 97) assert.ok(Math.abs(back[i] - mono[i]) < 1e-3);
  const viaInt = int16ToMono(monoToInt16(mono));
  for (let i = 0; i < FRAME; i += 97) assert.ok(Math.abs(viaInt[i] - mono[i]) < 1e-3);
  // Out-of-range values clamp instead of wrapping around.
  assert.deepEqual([...monoToInt16(Float32Array.from([2, -2]))], [32767, -32767]);
});

test("the limiter leaves normal speech alone and never lets a mix clip", () => {
  const quiet = Float32Array.from([0.1, -0.5, 0.69]);
  assert.deepEqual([...softLimit(Float32Array.from(quiet))], [...quiet]);
  const loud = softLimit(Float32Array.from([1.8, -3, 0.95]));
  assert.ok(peak(loud) <= 1);
  assert.ok(loud[2] > 0.7 && loud[2] < 0.95);
});

test("the mixer waits for a little buffer, sums everyone, and stays quiet when nobody talks", () => {
  const mixer = new Mixer();
  assert.equal(mixer.pull(), null);
  mixer.push("a", new Float32Array(480).fill(0.1));
  assert.equal(mixer.pull(), null, "10 ms isn't enough to start");
  for (let i = 0; i < 3; i++) mixer.push("a", new Float32Array(480).fill(0.1));
  mixer.push("b", new Float32Array(FRAME * 2).fill(0.2));
  const frame = mixer.pull();
  assert.equal(frame.length, FRAME);
  assert.ok(Math.abs(frame[0] - 0.3) < 1e-6);
  // a has 20 ms left, b 20 ms: one more mixed frame, then both have run dry.
  assert.ok(Math.abs(mixer.pull()[500] - 0.3) < 1e-6);
  assert.equal(mixer.pull(), null);
  // A dry track has to build up again before it plays.
  mixer.push("a", new Float32Array(480).fill(0.1));
  assert.equal(mixer.pull(), null);
});

test("the mixer trims a track that runs ahead, so delay can't build up", () => {
  const mixer = new Mixer();
  for (let i = 0; i < 40; i++) mixer.push("a", new Float32Array(480).fill(i / 100));
  const input = mixer.inputs.get("a");
  assert.ok(input.length <= FRAME * 10);
  // Trimmed back to the 40 ms start buffer each time: what plays is recent audio.
  assert.ok(mixer.pull()[0] >= 0.34 - 1e-6);
  mixer.drop("a");
  assert.equal(mixer.size, 0);
});

test("pitch shifting moves a tone by the ratio asked", () => {
  for (const ratio of [0.72, 1.5]) {
    const shifter = new PitchShifter(ratio);
    const input = sine(220, SAMPLE_RATE);
    const output = input.map((x) => shifter.stepSample(x));
    const measured = frequencyOf(output.subarray(SAMPLE_RATE / 4));
    assert.ok(Math.abs(measured / 220 - ratio) < 0.08, `ratio ${ratio}: heard ${measured.toFixed(1)} Hz`);
  }
});

test("every effect gives sound back, inside the range, and Normal changes nothing", () => {
  for (const { id } of VOICE_EFFECTS) {
    const effect = createEffect(id);
    let loudest = 0;
    for (let frame = 0; frame < 50; frame++) {
      const out = effect.process(sine(180, FRAME, 0.6, frame * FRAME));
      for (const value of out) assert.ok(Number.isFinite(value), id);
      loudest = Math.max(loudest, peak(out));
    }
    assert.ok(loudest <= 1, `${id} peaks at ${loudest}`);
    assert.ok(loudest > 0.05, `${id} went silent`);
  }
  const plain = sine(180, FRAME);
  assert.deepEqual([...createEffect("none").process(Float32Array.from(plain))], [...plain]);
  assert.equal(createEffect("made-up").id, "none");
});

/** Runs `seconds` of a 220 Hz tone at `amplitude` through a leveler, frame by frame. */
function level(leveler, amplitude, seconds, start = 0) {
  const frames = Math.round((seconds * SAMPLE_RATE) / FRAME);
  let out;
  for (let f = 0; f < frames; f++) out = leveler.process(sine(220, FRAME, amplitude, start + f * FRAME));
  return out;
}

test("the leveler lifts a quiet Discord voice up to Hoffle's microphone level", () => {
  const leveler = new Leveler();
  // About -36 dBFS: what a quiet Discord mic sounds like.
  const out = level(leveler, 0.022, 2);
  assert.ok(dbOf(rms(out)) > -20, `quiet voice came out at ${dbOf(rms(out)).toFixed(1)} dBFS`);
  // A whisper-quiet one gets the most boost there is, and no more.
  level(leveler, 0.003, 2);
  assert.ok(leveler.gainDb <= 18.01, `boosted ${leveler.gainDb.toFixed(1)} dB`);
});

test("the leveler brings a shouting voice down at once and never clips", () => {
  const leveler = new Leveler();
  const first = leveler.process(sine(220, FRAME, 0.9));
  assert.ok(peak(first) <= 1, "the first loud frame stays inside the range");
  const out = level(leveler, 0.9, 1, FRAME);
  const outDb = dbOf(rms(out));
  assert.ok(outDb < -13 && outDb > -23, `loud voice came out at ${outDb.toFixed(1)} dBFS`);
});

test("pauses and breathing never wind the leveler's gain up", () => {
  const leveler = new Leveler();
  level(leveler, 0.1, 1);
  const speaking = leveler.gainDb;
  // -60 dBFS hiss for three seconds.
  level(leveler, 0.001, 3);
  assert.ok(Math.abs(leveler.gainDb - speaking) < 0.01, "the gain held through the pause");
});

test("a voice already at Hoffle's level passes through about unchanged", () => {
  const leveler = new Leveler();
  const out = level(leveler, 0.18, 2);
  assert.ok(Math.abs(leveler.gainDb) < 2, `gain was ${leveler.gainDb.toFixed(1)} dB`);
  assert.ok(Math.abs(dbOf(rms(out)) - dbOf(0.18 / Math.SQRT2)) < 2);
});
