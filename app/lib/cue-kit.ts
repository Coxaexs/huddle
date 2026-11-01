/**
 * What every voice sound is made from, standard or themed: one output bus (a
 * dry path, two synthesized spaces and a limiter) and a set of small
 * instruments. Everything is synthesized, so nothing downloads and nothing can
 * fail to load, and it all runs on an OfflineAudioContext as well.
 *
 * Every instrument takes the cue's start time `at` plus its own offset `t`, so
 * a cue reads as a little score.
 */

import type { VoiceSoundId } from "./audio-cues";

export type Player = (ctx: BaseAudioContext, out: AudioNode, at: number) => void;
export type Space = "room" | "hall";

/** A cue: how much of it goes to its space (0 is fully dry), which space, and its fader. */
export interface Cue {
  room: number;
  space?: Space;
  level?: number;
  play: Player;
}

export type RingId = "ringOut" | "ringIn";
export type CueId = Exclude<VoiceSoundId, RingId>;

/** A ringtone: `play` is one burst, repeated every `period` ms while it rings. */
export interface Ring extends Cue {
  period: number;
}

/** A full set: every cue and both rings, so a theme never falls back mid-call. */
export interface SoundSet {
  cues: Record<CueId, Cue>;
  rings: Record<RingId, Ring>;
}

export const semitones = (n: number) => Math.pow(2, n / 12);

const STEPS: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** "A4" → 440; also "C#5" and "Bb3". */
export function note(name: string): number {
  const match = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!match) return 440;
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return 440 * semitones(STEPS[match[1]] + accidental + (Number(match[3]) - 4) * 12);
}

/* The bus ------------------------------------------------------------------ */

const SPACES: Record<Space, { seconds: number; decay: number; predelay: number; bright: number; gain: number }> = {
  // A small, soft room.
  room: { seconds: 0.9, decay: 7, predelay: 0.012, bright: 0.6, gain: 2.2 },
  // Stone and height: a crypt, a library, an empty street at night.
  hall: { seconds: 2.6, decay: 2.6, predelay: 0.028, bright: 0.42, gain: 1.1 },
};

/** Decaying stereo noise that darkens as it fades: walls soak up the highs first. */
function impulse(ctx: BaseAudioContext, space: Space): AudioBuffer {
  const { seconds, decay, predelay, bright } = SPACES[space];
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  const start = Math.floor(rate * predelay);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let smoothed = 0;
    for (let i = start; i < length; i++) {
      const t = (i - start) / rate;
      const damping = bright - (bright - 0.12) * Math.min(1, t / (seconds * 0.55));
      smoothed += damping * (Math.random() * 2 - 1 - smoothed);
      data[i] = smoothed * Math.exp(-t * decay);
    }
  }
  return buffer;
}

interface Bus {
  dry: GainNode;
  spaces: Partial<Record<Space, GainNode>>;
}

const buses = new WeakMap<BaseAudioContext, Bus>();

function bus(ctx: BaseAudioContext): Bus {
  const existing = buses.get(ctx);
  if (existing) return existing;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 4;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.15;
  limiter.connect(ctx.destination);

  // Trimmed so the sounds sit at about the loudness of the ones they replaced.
  const dry = ctx.createGain();
  dry.gain.value = 0.45;
  dry.connect(limiter);

  const created: Bus = { dry, spaces: {} };
  buses.set(ctx, created);
  return created;
}

/** A space's reverb input, built the first time a cue asks for it. */
function spaceInput(ctx: BaseAudioContext, space: Space): GainNode {
  const b = bus(ctx);
  const existing = b.spaces[space];
  if (existing) return existing;
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, space);
  const input = ctx.createGain();
  input.gain.value = SPACES[space].gain;
  input.connect(reverb).connect(b.dry);
  b.spaces[space] = input;
  return input;
}

/** Where one cue plays: its fader into the bus, with `room` of it sent to its space. */
export function cueOutput(ctx: BaseAudioContext, { room, space = "room", level = 1 }: Omit<Cue, "play">): GainNode {
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(bus(ctx).dry);
  if (room > 0) {
    const send = ctx.createGain();
    send.gain.value = room;
    out.connect(send).connect(spaceInput(ctx, space));
  }
  return out;
}

/* Shaping ------------------------------------------------------------------ */

/** A filter that moves from one frequency to another over `time`; low-pass by default. */
export function sweep(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  { from, to, time, t = 0, type = "lowpass", q = 0.6 }: { from: number; to: number; time: number; t?: number; type?: BiquadFilterType; q?: number },
): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, at + t);
  filter.frequency.exponentialRampToValueAtTime(to, at + t + time);
  filter.connect(out);
  return filter;
}

/** A fixed band, e.g. 300–3400 Hz for a radio or phone line. */
export function band(ctx: BaseAudioContext, out: AudioNode, low: number, high: number): BiquadFilterNode {
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = low;
  highpass.Q.value = 0.7;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = high;
  lowpass.Q.value = 0.7;
  highpass.connect(lowpass).connect(out);
  return highpass;
}

const curves = new Map<string, Float32Array<ArrayBuffer>>();

function shaper(ctx: BaseAudioContext, out: AudioNode, key: string, shape: (x: number) => number): WaveShaperNode {
  let curve = curves.get(key);
  if (!curve) {
    curve = new Float32Array(1025);
    for (let i = 0; i < curve.length; i++) curve[i] = shape((i / 1024) * 2 - 1);
    curves.set(key, curve);
  }
  const node = ctx.createWaveShaper();
  node.curve = curve;
  node.oversample = "2x";
  node.connect(out);
  return node;
}

/** Soft saturation: `amount` 1 is warm, 6 is overdriven. */
export function drive(ctx: BaseAudioContext, out: AudioNode, amount: number): WaveShaperNode {
  return shaper(ctx, out, `drive:${amount}`, (x) => Math.tanh(x * amount) / Math.tanh(amount));
}

/** Amplitude quantized to a few steps: the grain of cheap digital audio. */
export function crush(ctx: BaseAudioContext, out: AudioNode, steps: number): WaveShaperNode {
  return shaper(ctx, out, `crush:${steps}`, (x) => Math.round(x * steps) / steps);
}

/* Sources ------------------------------------------------------------------ */

let noiseBuffer: AudioBuffer | null = null;
export function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/** A plain oscillator note, optionally gliding to `to`. */
export function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  { f, t = 0, dur, peak, type = "sine", attack = 0.005, to, detune = 0 }: {
    f: number; t?: number; dur: number; peak: number; type?: OscillatorType; attack?: number; to?: number; detune?: number;
  },
): void {
  const start = at + t;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(f, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + attack);
  env.gain.setTargetAtTime(0, start + attack, Math.max(0.005, (dur - attack) / 5));
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.1);
}

/** Filtered noise with a moving centre: paper, wings, wind, steam. */
export function rustle(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  { t = 0, dur, from, to, q = 1.2, peak, type = "bandpass", attack }: {
    t?: number; dur: number; from: number; to: number; q?: number; peak: number; type?: BiquadFilterType; attack?: number;
  },
): void {
  const start = at + t;
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + dur);
  const rise = attack ?? Math.min(0.02, dur / 4);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + rise);
  env.gain.setTargetAtTime(0, start + rise, Math.max(0.004, (dur - rise) / 4));
  source.connect(filter).connect(env).connect(out);
  source.start(start, Math.random() * 0.5);
  source.stop(start + dur + 0.1);
}

/** A tiny tactile click, like a soft switch under the finger. */
export function tick(ctx: BaseAudioContext, out: AudioNode, at: number, { t = 0, freq, peak, q = 1.4 }: { t?: number; freq: number; peak: number; q?: number }): void {
  const start = at + t;
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + 0.001);
  env.gain.setTargetAtTime(0, start + 0.001, 0.004);
  source.connect(filter).connect(env).connect(out);
  source.start(start, Math.random() * 0.5);
  source.stop(start + 0.05);
}

/** Air moving: band-passed noise swelling as it sweeps from one centre to another. */
export function whoosh(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  { t = 0, from, to, dur, peak, q = 1.6 }: { t?: number; from: number; to: number; dur: number; peak: number; q?: number },
): void {
  const start = at + t;
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + dur * 0.65);
  env.gain.linearRampToValueAtTime(0, start + dur);
  source.connect(filter).connect(env).connect(out);
  source.start(start, Math.random() * 0.4);
  source.stop(start + dur + 0.02);
}

export interface Strike {
  f: number;
  t?: number;
  /** Seconds until the ring has died away. */
  dur: number;
  peak: number;
  /** How bright the strike is before it settles (FM depth). */
  bright?: number;
  /** Frequency ratio of the modulator: 1 is warm, 3.5 glassy, 14 an electric piano tine. */
  ratio?: number;
  /** Start this many semitones sharp and settle onto the note. */
  drop?: number;
  /** Or start on this frequency and glide to `f`. */
  from?: number;
  /** Time constant of that settle, in seconds. */
  glide?: number;
  /** A sub-octave under the note, for weight. */
  body?: number;
  /** A two-octave glint on the attack. */
  shine?: number;
}

/**
 * The house instrument: a soft FM mallet. A sine carrier, modulated hard at
 * first so it strikes bright, settling to a pure tone; a slight pitch drop on
 * the attack like a real struck bar.
 */
export function strike(ctx: BaseAudioContext, out: AudioNode, at: number, s: Strike): void {
  const { f, dur, peak, bright = 1, ratio = 1, drop = 0.3, body = 0, shine = 0.1, glide = 0.012 } = s;
  const start = at + (s.t ?? 0);
  const end = start + dur + 0.12;
  const from = s.from ?? f * semitones(drop);

  // Strike, a quick fall into the ring, then the ring decays to silence.
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + 0.004);
  env.gain.setTargetAtTime(peak * 0.45, start + 0.004, 0.03);
  env.gain.setTargetAtTime(0, start + 0.05, dur / 6);
  env.connect(out);

  const carrier = ctx.createOscillator();
  const modulator = ctx.createOscillator();
  carrier.frequency.setValueAtTime(from, start);
  carrier.frequency.setTargetAtTime(f, start, glide);
  modulator.frequency.setValueAtTime(from * ratio, start);
  modulator.frequency.setTargetAtTime(f * ratio, start, glide);
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(f * 1.6 * bright, start);
  depth.gain.setTargetAtTime(f * 0.05 * bright, start, 0.035);
  modulator.connect(depth).connect(carrier.frequency);
  carrier.connect(env);
  const oscillators = [carrier, modulator];

  if (shine > 0) {
    const glint = ctx.createOscillator();
    glint.frequency.setValueAtTime(from * 4, start);
    glint.frequency.setTargetAtTime(f * 4, start, glide);
    const glintEnv = ctx.createGain();
    glintEnv.gain.setValueAtTime(0, start);
    glintEnv.gain.linearRampToValueAtTime(peak * shine, start + 0.002);
    glintEnv.gain.setTargetAtTime(0, start + 0.002, 0.022);
    glint.connect(glintEnv).connect(out);
    oscillators.push(glint);
  }

  if (body > 0) {
    const sub = ctx.createOscillator();
    sub.frequency.setValueAtTime(from / 2, start);
    sub.frequency.setTargetAtTime(f / 2, start, glide);
    const subEnv = ctx.createGain();
    subEnv.gain.setValueAtTime(0, start);
    subEnv.gain.linearRampToValueAtTime(peak * body, start + 0.008);
    subEnv.gain.setTargetAtTime(0, start + 0.008, dur / 7);
    sub.connect(subEnv).connect(out);
    oscillators.push(sub);
  }

  for (const osc of oscillators) {
    osc.start(start);
    osc.stop(end);
  }
}

/** A soft, felt-covered thump under a cue that ends something. */
export function thump(ctx: BaseAudioContext, out: AudioNode, at: number, { t = 0, peak, f = 70 }: { t?: number; peak: number; f?: number }): void {
  strike(ctx, out, at, { f, from: f * 1.7, glide: 0.03, t, dur: 0.22, peak, bright: 0.3, shine: 0 });
}

const strings = new Map<string, AudioBuffer>();

/**
 * A plucked string (Karplus-Strong), rendered once per pitch and kept. `bright`
 * is how hard it is plucked; `ring` is roughly how long it sounds.
 */
function stringBuffer(ctx: BaseAudioContext, f: number, bright: number, ring: number): { buffer: AudioBuffer; rate: number } {
  const sampleRate = ctx.sampleRate;
  const period = Math.max(2, Math.floor(sampleRate / f - 0.5));
  // The averaging filter adds half a sample of delay; playbackRate makes up the rest.
  const rate = (f * (period + 0.5)) / sampleRate;
  const key = `${sampleRate}:${period}:${bright}:${ring}`;
  let buffer = strings.get(key);
  if (!buffer) {
    const length = Math.floor(sampleRate * ring);
    buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    // Seeded, so a note sounds (and measures) the same every time it is plucked.
    let seed = Math.imul(period, 2654435761) >>> 0;
    const random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let x = Math.imul(seed ^ (seed >>> 15), seed | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    let smoothed = 0;
    let mean = 0;
    for (let i = 0; i < period; i++) {
      smoothed += bright * (random() * 2 - 1 - smoothed);
      data[i] = smoothed;
      mean += smoothed / period;
    }
    for (let i = 0; i < period; i++) data[i] -= mean;
    const loss = Math.pow(10, -3 / (ring * f));
    for (let i = period; i < length; i++) {
      data[i] = loss * 0.5 * (data[i - period] + (i > period ? data[i - period - 1] : 0));
    }
    let peak = 0;
    for (let i = 0; i < period * 2; i++) peak = Math.max(peak, Math.abs(data[i]));
    const fade = Math.floor(sampleRate * 0.01);
    for (let i = 0; i < length; i++) {
      data[i] /= peak || 1;
      if (i > length - fade) data[i] *= (length - i) / fade;
    }
    strings.set(key, buffer);
  }
  return { buffer, rate };
}

export function pluck(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  { f, t = 0, peak, bright = 0.7, ring = 1.2 }: { f: number; t?: number; peak: number; bright?: number; ring?: number },
): void {
  const start = at + t;
  const { buffer, rate } = stringBuffer(ctx, f, bright, ring);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const gain = ctx.createGain();
  gain.gain.value = peak;
  source.connect(gain).connect(out);
  source.start(start);
}

/** A struck bell: inharmonic partials, each a hair detuned so it shimmers, with staggered decays. */
export function bell(ctx: BaseAudioContext, out: AudioNode, at: number, { f, t = 0, dur, peak }: { f: number; t?: number; dur: number; peak: number }): void {
  const partials: Array<[number, number, number]> = [
    [0.5, 0.55, 1.0], // hum
    [1, 1, 0.85],
    [1.19, 0.45, 0.6], // minor third: the "tolling" colour
    [1.5, 0.3, 0.45],
    [2, 0.4, 0.4],
    [2.74, 0.18, 0.25],
    [3.76, 0.1, 0.15],
  ];
  for (const [ratio, level, life] of partials) {
    tone(ctx, out, at, { f: f * ratio, t, dur: dur * life, peak: peak * level, attack: 0.003, detune: 0 });
    tone(ctx, out, at, { f: f * ratio, t, dur: dur * life * 0.9, peak: peak * level * 0.35, attack: 0.003, detune: 3.5 });
  }
  tick(ctx, out, at, { t, freq: f * 4, peak: peak * 0.4, q: 2 });
}

/** A pipe organ: sine ranks (16', 8', 4', 2⅔', 2') with a breathy "chiff" as the pipe speaks. */
export function organ(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  { f, t = 0, dur, peak, ranks = [[0.5, 0.5], [1, 1], [2, 0.55], [3, 0.25], [4, 0.2]] }: {
    f: number; t?: number; dur: number; peak: number; ranks?: Array<[number, number]>;
  },
): void {
  const start = at + t;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + 0.035);
  env.gain.setValueAtTime(peak, start + dur);
  env.gain.setTargetAtTime(0, start + dur, 0.07);
  env.connect(out);
  for (const [ratio, level] of ranks) {
    for (const detune of [0, 4]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f * ratio;
      osc.detune.value = detune;
      const gain = ctx.createGain();
      gain.gain.value = level * (detune ? 0.4 : 1);
      osc.connect(gain).connect(env);
      osc.start(start);
      osc.stop(start + dur + 0.5);
    }
  }
  rustle(ctx, out, at, { t, dur: 0.05, from: f * 3, to: f * 2.5, q: 5, peak: peak * 0.9 });
}

/**
 * Wood under stress: a slow train of clicks (the stick-slip of a hinge) through
 * a resonant band. `rate` moves from one click rate to the other.
 */
export function creak(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  { t = 0, dur, rate, freq = 1100, peak }: { t?: number; dur: number; rate: [number, number]; freq?: number; peak: number },
): void {
  const start = at + t;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(rate[0], start);
  osc.frequency.linearRampToValueAtTime((rate[0] + rate[1]) / 2 * 1.15, start + dur * 0.45);
  osc.frequency.linearRampToValueAtTime(rate[1], start + dur);
  const resonance = ctx.createBiquadFilter();
  resonance.type = "bandpass";
  resonance.frequency.value = freq;
  resonance.Q.value = 7;
  const second = ctx.createBiquadFilter();
  second.type = "bandpass";
  second.frequency.value = freq * 2.3;
  second.Q.value = 5;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + dur * 0.2);
  env.gain.setValueAtTime(peak, start + dur * 0.75);
  env.gain.linearRampToValueAtTime(0, start + dur);
  osc.connect(resonance).connect(env);
  osc.connect(second).connect(env);
  env.connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}
