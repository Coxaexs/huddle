/**
 * Audio for the voice bridge: Discord's 48 kHz stereo PCM in and out, the
 * mono float frames everything works on in between, a mixer for the Hoffle
 * side, and the voice effects a Discord person can pick with /hoffle-voice.
 *
 * Plain JavaScript with no native parts, so all of it is unit-tested.
 */

export const SAMPLE_RATE = 48_000;
/** Discord sends and takes 20 ms frames. */
export const FRAME = 960;

/** What /hoffle-voice offers, in the order it lists them. */
export const VOICE_EFFECTS = [
  { id: "none", label: "Normal", hint: "Your own voice" },
  { id: "deep", label: "Deep", hint: "An octave-ish lower" },
  { id: "high", label: "Chipmunk", hint: "High and quick" },
  { id: "robot", label: "Robot", hint: "Metallic and buzzy" },
  { id: "radio", label: "Radio", hint: "An old walkie-talkie" },
  { id: "echo", label: "Echo", hint: "Shouting into a canyon" },
  { id: "vampire", label: "Vampire", hint: "Deep, doubled, from a crypt (like Hoffle's)" },
  { id: "alien", label: "Alien", hint: "Up a little, warbling" },
];
export const EFFECT_IDS = new Set(VOICE_EFFECTS.map((effect) => effect.id));

// ---------------------------------------------------------------- formats

/** s16le stereo (what Discord's Opus decoder gives) → mono floats. */
export function stereoToMono(buffer) {
  const samples = Math.floor(buffer.length / 4);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = (buffer.readInt16LE(i * 4) + buffer.readInt16LE(i * 4 + 2)) / 65536;
  }
  return out;
}

/** Mono floats → s16le stereo (what Discord's Opus encoder takes). */
export function monoToStereo(samples) {
  const out = Buffer.alloc(samples.length * 4);
  for (let i = 0; i < samples.length; i++) {
    const value = toInt16(samples[i]);
    out.writeInt16LE(value, i * 4);
    out.writeInt16LE(value, i * 4 + 2);
  }
  return out;
}

/** Mono floats → Int16 (what LiveKit's AudioFrame takes). */
export function monoToInt16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = toInt16(samples[i]);
  return out;
}

/** Int16 → mono floats (what LiveKit's AudioStream gives). */
export function int16ToMono(samples) {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] / 32768;
  return out;
}

function toInt16(value) {
  const clamped = value > 1 ? 1 : value < -1 ? -1 : value;
  return Math.round(clamped * 32767);
}

/** Loudest sample of a frame, 0..1. */
export function peak(samples) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = Math.abs(samples[i]);
    if (value > max) max = value;
  }
  return max;
}

/**
 * Soft limiter: untouched below 0.7, then bent smoothly so several people
 * talking at once never clip into crackle.
 */
export function softLimit(samples) {
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    const size = Math.abs(value);
    if (size > 0.7) samples[i] = Math.sign(value) * (0.7 + 0.3 * Math.tanh((size - 0.7) / 0.3));
  }
  return samples;
}

/** A level in dBFS (0 = full scale). */
export const dbOf = (value) => 20 * Math.log10(Math.max(value, 1e-9));
const fromDb = (db) => 10 ** (db / 20);

/** Root-mean-square level of a frame, 0..1. */
export function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

// ---------------------------------------------------------------- levelling

/**
 * Brings a Discord voice to the loudness Hoffle's own microphones arrive at.
 * Browsers run automatic gain on every Hoffle mic, so a Discord voice passed
 * through untouched sounds faint next to them.
 *
 * It follows how loud the person speaks: up at once on a loud frame, back
 * down slowly (about half a second), and only from frames that are clearly
 * speech, so breathing and pauses never wind the gain up. The gain glides
 * across each frame so it never clicks, and the limiter catches what is left.
 */
export class Leveler {
  constructor({ targetDb = -18, maxGainDb = 18, minGainDb = -12, floorDb = -42, startDb = -30 } = {}) {
    this.targetDb = targetDb;
    this.maxGainDb = maxGainDb;
    this.minGainDb = minGainDb;
    this.floorDb = floorDb;
    /** How loud this person speaks, in dBFS; a modest guess until they do. */
    this.levelDb = startDb;
    this.gain = fromDb(this.wantedDb());
  }

  wantedDb() {
    return Math.max(this.minGainDb, Math.min(this.maxGainDb, this.targetDb - this.levelDb));
  }

  get gainDb() {
    return dbOf(this.gain);
  }

  /** Levels one frame in place and returns it. */
  process(samples) {
    const level = dbOf(rms(samples));
    if (level > this.floorDb) {
      this.levelDb = level > this.levelDb ? level : this.levelDb + 0.06 * (level - this.levelDb);
    }
    const from = this.gain;
    const to = fromDb(this.wantedDb());
    const count = samples.length;
    for (let i = 0; i < count; i++) samples[i] *= from + ((to - from) * (i + 1)) / count;
    this.gain = to;
    return softLimit(samples);
  }
}

// ---------------------------------------------------------------- mixer

/**
 * Mixes the Hoffle room for Discord: each person's track is pushed in as it
 * arrives (LiveKit hands over 10 ms frames), and one 20 ms frame of everyone
 * is pulled out on Discord's clock. A track only joins the mix once it has a
 * little buffered, so network jitter doesn't chop it; a track that runs ahead
 * is trimmed so the delay can't creep up.
 */
export class Mixer {
  constructor({ frame = FRAME, prime = FRAME * 2, maxQueue = FRAME * 10 } = {}) {
    this.frame = frame;
    this.prime = prime;
    this.maxQueue = maxQueue;
    /** id → { chunks: Float32Array[], offset, length, primed } */
    this.inputs = new Map();
  }

  push(id, samples) {
    if (!samples?.length) return;
    let input = this.inputs.get(id);
    if (!input) {
      input = { chunks: [], offset: 0, length: 0, primed: false };
      this.inputs.set(id, input);
    }
    input.chunks.push(samples);
    input.length += samples.length;
    if (input.length > this.maxQueue) this.skip(input, input.length - this.prime);
    if (input.length >= this.prime) input.primed = true;
  }

  drop(id) {
    this.inputs.delete(id);
  }

  get size() {
    return this.inputs.size;
  }

  /** One frame of everyone, limited; null when nobody had anything. */
  pull() {
    const out = new Float32Array(this.frame);
    let any = false;
    for (const input of this.inputs.values()) {
      if (!input.primed) continue;
      if (input.length < this.frame) {
        // Ran dry: wait to build up again rather than play it in crumbs.
        input.primed = false;
        continue;
      }
      this.take(input, out);
      any = true;
    }
    return any ? softLimit(out) : null;
  }

  take(input, out) {
    let written = 0;
    while (written < this.frame) {
      const chunk = input.chunks[0];
      const available = chunk.length - input.offset;
      const count = Math.min(available, this.frame - written);
      for (let i = 0; i < count; i++) out[written + i] += chunk[input.offset + i];
      written += count;
      input.offset += count;
      if (input.offset >= chunk.length) {
        input.chunks.shift();
        input.offset = 0;
      }
    }
    input.length -= this.frame;
  }

  skip(input, count) {
    let left = count;
    while (left > 0 && input.chunks.length) {
      const available = input.chunks[0].length - input.offset;
      if (available <= left) {
        left -= available;
        input.chunks.shift();
        input.offset = 0;
      } else {
        input.offset += left;
        left = 0;
      }
    }
    input.length -= count - left;
  }
}

// ---------------------------------------------------------------- building blocks

/** RBJ biquad, one channel. */
export class Biquad {
  constructor(type, frequency, q = 0.707, sampleRate = SAMPLE_RATE) {
    const w = (2 * Math.PI * frequency) / sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    let b0, b1, b2;
    if (type === "lowpass") {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
    } else {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }

  step(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/**
 * Real-time pitch shifter: two taps read a short delay line at a different
 * speed than it is written, crossfaded so each tap's jump back is silent.
 * Cheap, no lookahead, and natural enough on speech.
 */
export class PitchShifter {
  constructor(ratio, { windowMs = 40, sampleRate = SAMPLE_RATE } = {}) {
    this.ratio = ratio;
    this.window = Math.round((windowMs / 1000) * sampleRate);
    this.size = 1;
    while (this.size < this.window * 2 + 4) this.size <<= 1;
    this.buffer = new Float32Array(this.size);
    this.mask = this.size - 1;
    this.write = 0;
    this.phase = 0;
    this.step = (1 - ratio) / this.window;
  }

  read(delay) {
    const position = this.write - 1 - delay;
    const base = Math.floor(position);
    const fraction = position - base;
    const a = this.buffer[base & this.mask];
    const b = this.buffer[(base + 1) & this.mask];
    return a + (b - a) * fraction;
  }

  stepSample(x) {
    this.buffer[this.write & this.mask] = x;
    this.write++;
    const p1 = this.phase;
    const p2 = (p1 + 0.5) % 1;
    const w1 = Math.sin(Math.PI * p1) ** 2;
    const y = this.read(p1 * this.window) * w1 + this.read(p2 * this.window) * (1 - w1);
    this.phase = (this.phase + this.step) % 1;
    if (this.phase < 0) this.phase += 1;
    return y;
  }
}

/** Feedback delay (echo). */
export class Delay {
  constructor(ms, feedback, wet, sampleRate = SAMPLE_RATE) {
    this.length = Math.max(1, Math.round((ms / 1000) * sampleRate));
    this.buffer = new Float32Array(this.length);
    this.index = 0;
    this.feedback = feedback;
    this.wet = wet;
  }

  stepSample(x) {
    const delayed = this.buffer[this.index];
    this.buffer[this.index] = x + delayed * this.feedback;
    this.index = (this.index + 1) % this.length;
    return x + delayed * this.wet;
  }
}

/** Multiplies by a low sine: the Dalek / alien wobble. */
export class RingMod {
  constructor(frequency, depth = 1, sampleRate = SAMPLE_RATE) {
    this.increment = (2 * Math.PI * frequency) / sampleRate;
    this.depth = depth;
    this.phase = 0;
  }

  stepSample(x) {
    const y = x * (1 - this.depth + this.depth * Math.sin(this.phase));
    this.phase += this.increment;
    if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
    return y;
  }
}

// ---------------------------------------------------------------- effects

/**
 * A voice effect for one person: `process(frame)` returns the changed frame
 * (the same array, changed in place). Each person gets their own, since the
 * effects remember the last few hundred milliseconds.
 */
export function createEffect(id) {
  const chain = effectChain(EFFECT_IDS.has(id) ? id : "none");
  return {
    id: EFFECT_IDS.has(id) ? id : "none",
    process(samples) {
      if (!chain) return samples;
      for (let i = 0; i < samples.length; i++) samples[i] = chain(samples[i]);
      return softLimit(samples);
    },
  };
}

function effectChain(id) {
  switch (id) {
    case "deep": {
      const shift = new PitchShifter(0.72);
      const warmth = new Biquad("lowpass", 5200);
      return (x) => warmth.step(shift.stepSample(x)) * 1.15;
    }
    case "high": {
      const shift = new PitchShifter(1.5, { windowMs: 30 });
      const thin = new Biquad("highpass", 160);
      return (x) => thin.step(shift.stepSample(x));
    }
    case "robot": {
      const ring = new RingMod(52, 0.9);
      const comb = new Delay(6, 0.55, 0.6);
      const body = new Biquad("highpass", 140);
      return (x) => body.step(comb.stepSample(ring.stepSample(x))) * 1.3;
    }
    case "radio": {
      const low = new Biquad("highpass", 420, 0.9);
      const high = new Biquad("lowpass", 2900, 0.9);
      return (x) => {
        const band = high.step(low.step(x));
        return Math.tanh(band * 4) * 0.45;
      };
    }
    case "echo": {
      const echo = new Delay(240, 0.38, 0.45);
      return (x) => echo.stepSample(x) * 0.85;
    }
    case "vampire": {
      const shift = new PitchShifter(0.8);
      const double = new PitchShifter(0.78, { windowMs: 46 });
      const crypt = new Delay(170, 0.32, 0.35);
      const dark = new Biquad("lowpass", 4200);
      return (x) => dark.step(crypt.stepSample(shift.stepSample(x) * 0.75 + double.stepSample(x) * 0.45));
    }
    case "alien": {
      const shift = new PitchShifter(1.22);
      const wobble = new RingMod(7, 0.35);
      return (x) => wobble.stepSample(shift.stepSample(x)) * 1.1;
    }
    default:
      return null;
  }
}
