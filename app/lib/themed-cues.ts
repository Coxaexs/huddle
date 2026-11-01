/**
 * Theme sound sets: the voice sounds re-voiced for themes with a strong
 * character. Every set covers every sound (the types make sure), so a call in
 * the Vampire theme never drops back to the standard mallet halfway through.
 *
 * They share the standard sounds' bus and loudness (see MIX at the bottom),
 * and their logic: switching something off falls and closes, switching it on
 * rises and opens, frequent sounds stay small.
 *
 * `audio-cues.ts` asks here first and plays the standard set otherwise. MSN's
 * message and nudge sounds live in `msn-sounds.ts`; this file is only voice.
 */

import type { VoiceSoundId } from "./audio-cues";
import {
  band,
  bell,
  creak,
  crush,
  drive,
  noise,
  note,
  organ,
  pluck,
  rustle,
  semitones,
  strike,
  sweep,
  thump,
  tick,
  tone,
  whoosh,
  type Cue,
  type CueId,
  type Ring,
  type RingId,
  type SoundSet,
} from "./cue-kit";

type Ctx = BaseAudioContext;

/* Theme instruments -------------------------------------------------------- */

/** A burst of band-passed noise: a data packet, static, a bad contact. */
function glitch(ctx: Ctx, out: AudioNode, at: number, { t = 0, dur, freq = 3800, peak, q = 5 }: { t?: number; dur: number; freq?: number; peak: number; q?: number }) {
  rustle(ctx, out, at, { t, dur, from: freq, to: freq * 0.9, q, peak, attack: 0.002 });
}

/** A digital blip: a bright wave swept through a band that follows it. */
function blip(
  ctx: Ctx,
  out: AudioNode,
  at: number,
  { t = 0, f, to = f, dur, peak, type = "square", q = 3 }: { t?: number; f: number; to?: number; dur: number; peak: number; type?: OscillatorType; q?: number },
) {
  const start = at + t;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = q;
  filter.frequency.setValueAtTime(f * 1.5, start);
  filter.frequency.exponentialRampToValueAtTime(to * 1.5, start + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + 0.003);
  env.gain.setTargetAtTime(0, start + 0.003, dur / 4);
  osc.connect(filter).connect(env).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.1);
}

/** A modem-like data burst: a square wave hopping between two tones, drifting up or down. */
function data(
  ctx: Ctx,
  out: AudioNode,
  at: number,
  { t = 0, tones, steps, step = 0.011, peak, drift = 0 }: { t?: number; tones: [number, number]; steps: number; step?: number; peak: number; drift?: number },
) {
  const start = at + t;
  const bits = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1];
  const osc = ctx.createOscillator();
  osc.type = "square";
  for (let i = 0; i < steps; i++) {
    osc.frequency.setValueAtTime(tones[bits[i % bits.length]] * semitones(drift * i), start + i * step);
  }
  const end = start + steps * step;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + 0.003);
  env.gain.setValueAtTime(peak, end - 0.004);
  env.gain.linearRampToValueAtTime(0, end);
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 4200;
  osc.connect(lowpass).connect(env).connect(out);
  osc.start(start);
  osc.stop(end + 0.02);
}

/** Two detuned saws and a sub through a resonant filter, overdriven: neon. */
function neon(
  ctx: Ctx,
  out: AudioNode,
  at: number,
  { t = 0, f, to, dur, peak, open = [800, 3000], q = 5 }: { t?: number; f: number; to?: number; dur: number; peak: number; open?: [number, number]; q?: number },
) {
  const start = at + t;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = q;
  filter.frequency.setValueAtTime(open[0], start);
  filter.frequency.exponentialRampToValueAtTime(open[1], start + dur * 0.6);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + 0.004);
  env.gain.setTargetAtTime(peak * 0.6, start + 0.004, dur * 0.3);
  env.gain.setTargetAtTime(0, start + dur * 0.7, dur * 0.1);
  filter.connect(env).connect(drive(ctx, out, 3));
  for (const [ratio, detune, level, type] of [[1, -14, 1, "sawtooth"], [1, 14, 1, "sawtooth"], [0.5, 0, 0.5, "square"]] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(f * ratio, start);
    if (to) osc.frequency.exponentialRampToValueAtTime(to * ratio, start + dur * 0.8);
    const gain = ctx.createGain();
    gain.gain.value = level;
    osc.connect(gain).connect(filter);
    osc.start(start);
    osc.stop(start + dur + 0.15);
  }
}

/** A sine with a singer's vibrato that slides between two notes: a theremin. */
function theremin(ctx: Ctx, out: AudioNode, at: number, { t = 0, f, to, dur, peak }: { t?: number; f: number; to: number; dur: number; peak: number }) {
  const start = at + t;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(f, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + dur * 0.7);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 6;
  const depth = ctx.createGain();
  depth.gain.value = to * 0.018;
  vibrato.connect(depth).connect(osc.frequency);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + dur * 0.3);
  env.gain.setTargetAtTime(0, start + dur * 0.6, dur * 0.12);
  osc.connect(env).connect(out);
  for (const o of [osc, vibrato]) {
    o.start(start);
    o.stop(start + dur + 0.2);
  }
}

/** Glass, rubbed or lightly struck: a pure tone with faint upper partials. */
function glass(ctx: Ctx, out: AudioNode, at: number, { t = 0, f, dur, peak }: { t?: number; f: number; dur: number; peak: number }) {
  tone(ctx, out, at, { t, f, dur, peak, attack: 0.012 });
  tone(ctx, out, at, { t, f: f * 2.01, dur: dur * 0.6, peak: peak * 0.22, attack: 0.008 });
  tone(ctx, out, at, { t, f: f * 3.03, dur: dur * 0.35, peak: peak * 0.08, attack: 0.005 });
}

/** A harpsichord: a bright plucked string with an octave stop and the click of the quill. */
function harpsichord(ctx: Ctx, out: AudioNode, at: number, { t = 0, f, peak }: { t?: number; f: number; peak: number }) {
  pluck(ctx, out, at, { t, f, peak, bright: 0.95, ring: 1.5 });
  pluck(ctx, out, at, { t, f: f * 2, peak: peak * 0.35, bright: 0.9, ring: 0.9 });
  tick(ctx, out, at, { t, freq: Math.min(8000, f * 6), peak: peak * 0.25 });
}

/** A wooden note block: a short, round pluck. */
function noteBlock(ctx: Ctx, out: AudioNode, at: number, { t = 0, f, peak }: { t?: number; f: number; peak: number }) {
  pluck(ctx, out, at, { t, f, peak, bright: 0.45, ring: 0.6 });
  tone(ctx, out, at, { t, f, dur: 0.25, peak: peak * 0.35, attack: 0.003 });
}

/** A round 2000s "bloop": a soft mallet that slides up into its note. */
function bloop(ctx: Ctx, out: AudioNode, at: number, { t = 0, f, dur = 0.18, peak, shine = 0.12 }: { t?: number; f: number; dur?: number; peak: number; shine?: number }) {
  strike(ctx, out, at, { t, f, from: f * 0.78, glide: 0.014, dur, peak, bright: 0.55, ratio: 2, shine });
}

/** A soft synth chord: detuned triangles under a gentle low-pass. */
function pad(ctx: Ctx, out: AudioNode, at: number, { t = 0, notes, dur, peak }: { t?: number; notes: number[]; dur: number; peak: number }) {
  const start = at + t;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2800;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + 0.02);
  env.gain.setTargetAtTime(peak * 0.7, start + 0.02, dur * 0.3);
  env.gain.setTargetAtTime(0, start + dur * 0.6, dur * 0.15);
  filter.connect(env).connect(out);
  for (const f of notes) {
    for (const [type, detune, level] of [["triangle", -6, 1], ["triangle", 6, 1], ["sawtooth", 0, 0.18]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      osc.detune.value = detune;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(filter);
      osc.start(start);
      osc.stop(start + dur + 0.3);
    }
  }
}

/** A chord on tape: `from` and `to` are tape speeds, so 1 → 0.3 is a tape stop. */
function tape(ctx: Ctx, out: AudioNode, at: number, { t = 0, notes, from, to, dur, peak }: { t?: number; notes: number[]; from: number; to: number; dur: number; peak: number }) {
  const start = at + t;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(4200 * from, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(200, 4200 * to), start + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + 0.01);
  if (to < from) {
    env.gain.setValueAtTime(peak, start + dur * 0.5);
    env.gain.linearRampToValueAtTime(0, start + dur);
  } else {
    env.gain.setValueAtTime(peak, start + dur);
    env.gain.setTargetAtTime(0, start + dur, 0.08);
  }
  filter.connect(env).connect(out);
  for (const f of notes) {
    for (const [type, level] of [["sawtooth", 0.6], ["triangle", 1]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f * from, start);
      osc.frequency.exponentialRampToValueAtTime(f * to, start + dur);
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(filter);
      osc.start(start);
      osc.stop(start + dur + 0.5);
    }
  }
}

/** An energy blade: a buzzing, beating hum that sweeps up as it extends, down as it retracts. */
function blade(ctx: Ctx, out: AudioNode, at: number, { t = 0, on, dur, peak }: { t?: number; on: boolean; dur: number; peak: number }) {
  const start = at + t;
  const [from, to] = on ? [42, 92] : [92, 36];
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(on ? 400 : 1600, start);
  filter.frequency.exponentialRampToValueAtTime(on ? 1800 : 260, start + dur * 0.7);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + (on ? 0.06 : 0.01));
  env.gain.setTargetAtTime(0, start + dur * (on ? 0.6 : 0.3), dur * 0.15);
  filter.connect(env).connect(out);
  for (const [ratio, type, level] of [[1, "sawtooth", 1], [1.012, "sawtooth", 1], [2, "square", 0.3]] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from * ratio, start);
    osc.frequency.exponentialRampToValueAtTime(to * ratio, start + dur * 0.55);
    const gain = ctx.createGain();
    gain.gain.value = level;
    osc.connect(gain).connect(filter);
    osc.start(start);
    osc.stop(start + dur + 0.3);
  }
  rustle(ctx, out, at, { t, dur: dur * 0.45, from: on ? 2500 : 4000, to: on ? 4500 : 1800, q: 1, peak: peak * 0.35 });
}

/** A droid's chirp: a sine darting between pitches with a fast warble. */
function chirp(ctx: Ctx, out: AudioNode, at: number, { t = 0, path, step = 0.045, peak }: { t?: number; path: number[]; step?: number; peak: number }) {
  const start = at + t;
  const end = start + (path.length - 1) * step;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(path[0], start);
  path.slice(1).forEach((f, i) => osc.frequency.exponentialRampToValueAtTime(f, start + (i + 1) * step));
  const warble = ctx.createOscillator();
  warble.frequency.value = 32;
  const depth = ctx.createGain();
  depth.gain.value = 70;
  warble.connect(depth).connect(osc.frequency);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + 0.006);
  env.gain.setValueAtTime(peak, end - 0.01);
  env.gain.setTargetAtTime(0, end - 0.01, 0.02);
  osc.connect(env).connect(out);
  for (const o of [osc, warble]) {
    o.start(start);
    o.stop(end + 0.15);
  }
}

/** Radio squelch: a hiss of open channel, cut off clean. */
function squelch(ctx: Ctx, out: AudioNode, at: number, { t = 0, dur, peak }: { t?: number; dur: number; peak: number }) {
  const start = at + t;
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 0.5;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + 0.003);
  env.gain.setValueAtTime(peak, start + dur - 0.008);
  env.gain.linearRampToValueAtTime(0, start + dur);
  source.connect(filter).connect(env).connect(out);
  source.start(start, Math.random() * 0.5);
  source.stop(start + dur + 0.02);
}

/** A small knock on wood or plastic, under a click so it has some body. */
function knock(ctx: Ctx, out: AudioNode, at: number, { t = 0, f, peak }: { t?: number; f: number; peak: number }) {
  strike(ctx, out, at, { t, f, dur: 0.05, peak, bright: 0.35, drop: 1.5, shine: 0 });
}

/** A short, square-cornered radio beep. */
function beep(ctx: Ctx, out: AudioNode, at: number, { t = 0, f, dur = 0.08, peak }: { t?: number; f: number; dur?: number; peak: number }) {
  const start = at + t;
  const osc = ctx.createOscillator();
  osc.frequency.value = f;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + 0.004);
  env.gain.setValueAtTime(peak, start + dur - 0.006);
  env.gain.linearRampToValueAtTime(0, start + dur);
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** A siren's wail between two pitches, with a fast tremolo. */
function siren(ctx: Ctx, out: AudioNode, at: number, { t = 0, from, to, dur, peak }: { t?: number; from: number; to: number; dur: number; peak: number }) {
  const start = at + t;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + dur * 0.25);
  env.gain.setValueAtTime(peak, start + dur * 0.7);
  env.gain.linearRampToValueAtTime(0, start + dur);
  const tremolo = ctx.createOscillator();
  tremolo.frequency.value = 11;
  const depth = ctx.createGain();
  depth.gain.value = peak * 0.3;
  tremolo.connect(depth).connect(env.gain);
  env.connect(out);
  for (const [type, ratio, level] of [["triangle", 1, 1], ["sine", 2, 0.25]] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from * ratio, start);
    osc.frequency.linearRampToValueAtTime(to * ratio, start + dur);
    const gain = ctx.createGain();
    gain.gain.value = level;
    osc.connect(gain).connect(env);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }
  tremolo.start(start);
  tremolo.stop(start + dur + 0.05);
}

/** A low, wet groan: a buzzing voice through two vowel formants, sagging in pitch. */
function groan(ctx: Ctx, out: AudioNode, at: number, { t = 0, from, to, dur, peak }: { t?: number; from: number; to: number; dur: number; peak: number }) {
  const start = at + t;
  const voice = ctx.createOscillator();
  voice.type = "sawtooth";
  voice.frequency.setValueAtTime(from, start);
  voice.frequency.exponentialRampToValueAtTime(to, start + dur);
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 6.5;
  const depth = ctx.createGain();
  depth.gain.value = from * 0.05;
  wobble.connect(depth).connect(voice.frequency);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(peak, start + dur * 0.25);
  env.gain.setValueAtTime(peak, start + dur * 0.6);
  env.gain.linearRampToValueAtTime(0, start + dur);
  env.connect(out);
  for (const [freq, q, level] of [[560, 6, 1], [950, 7, 0.6], [2400, 8, 0.15]] as const) {
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.value = freq;
    formant.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = level;
    voice.connect(formant).connect(gain).connect(env);
  }
  for (const o of [voice, wobble]) {
    o.start(start);
    o.stop(start + dur + 0.05);
  }
  rustle(ctx, out, at, { t, dur, from: 1300, to: 900, q: 0.8, peak: peak * 0.12 });
}

/** "Lub-dub". */
function heartbeat(ctx: Ctx, out: AudioNode, at: number, { t = 0, peak }: { t?: number; peak: number }) {
  thump(ctx, out, at, { t, peak, f: 58 });
  thump(ctx, out, at, { t: t + 0.17, peak: peak * 0.7, f: 50 });
}

/** A thin, slightly out-of-tune music box tine. */
function musicBox(ctx: Ctx, out: AudioNode, at: number, { t = 0, f, peak }: { t?: number; f: number; peak: number }) {
  strike(ctx, out, at, { t, f, dur: 0.6, peak, bright: 0.7, ratio: 3.5, shine: 0.2, drop: 0 });
  strike(ctx, out, at, { t, f: f * 1.007, dur: 0.45, peak: peak * 0.45, bright: 0.4, ratio: 3.5, shine: 0, drop: 0 });
}

/** A heavy metal door meeting its frame. */
function clang(ctx: Ctx, out: AudioNode, at: number, { t = 0, peak }: { t?: number; peak: number }) {
  thump(ctx, out, at, { t, peak, f: 55 });
  for (const [f, level, dur] of [[187, 1, 0.5], [412, 0.6, 0.35], [693, 0.35, 0.25], [1130, 0.2, 0.18]] as const) {
    tone(ctx, out, at, { t, f, dur, peak: peak * 0.25 * level, attack: 0.002 });
  }
  tick(ctx, out, at, { t, freq: 1800, peak: peak * 0.6, q: 0.8 });
}

/** The telephone band, lightly driven: everything on the radio goes through this. */
const radio = (ctx: Ctx, out: AudioNode) => band(ctx, drive(ctx, out, 1.6), 300, 3400);

/* Vampire: a crypt, an organ loft, a bell tower ---------------------------- */

const vampire: SoundSet = {
  cues: {
    // The coffin lid comes down.
    mute: {
      room: 0.22,
      space: "hall",
      play: (ctx, out, at) => {
        creak(ctx, out, at, { dur: 0.16, rate: [40, 24], freq: 850, peak: 0.12 });
        thump(ctx, out, at, { t: 0.14, peak: 0.3, f: 72 });
        organ(ctx, out, at, { f: note("D3"), t: 0.14, dur: 0.22, peak: 0.05 });
      },
    },
    // ...and creaks open, a theremin rising out of it.
    unmute: {
      room: 0.22,
      space: "hall",
      play: (ctx, out, at) => {
        creak(ctx, out, at, { dur: 0.22, rate: [22, 44], freq: 1000, peak: 0.12 });
        theremin(ctx, out, at, { t: 0.05, f: note("A4"), to: note("D5"), dur: 0.38, peak: 0.1 });
      },
    },
    // One toll from the bell tower.
    deafen: { room: 0.32, space: "hall", play: (ctx, out, at) => bell(ctx, out, at, { f: note("D3"), dur: 1.4, peak: 0.12 }) },
    // Bats scatter: a flurry of wings and two high squeaks.
    undeafen: {
      room: 0.2,
      space: "hall",
      play: (ctx, out, at) => {
        for (let i = 0; i < 7; i++) {
          rustle(ctx, out, at, { t: i * 0.042, dur: 0.035, from: 3000 - i * 120, to: 1600, q: 2, peak: 0.36 });
        }
        tone(ctx, out, at, { t: 0.12, f: 5200, to: 7400, dur: 0.05, peak: 0.03 });
        tone(ctx, out, at, { t: 0.2, f: 6100, to: 4800, dur: 0.05, peak: 0.025 });
      },
    },
    // A guest at the crypt door: the organ answers up a fourth...
    userJoin: {
      room: 0.3,
      space: "hall",
      play: (ctx, out, at) => {
        organ(ctx, out, at, { f: note("A3"), dur: 0.13, peak: 0.05 });
        organ(ctx, out, at, { f: note("D4"), t: 0.12, dur: 0.32, peak: 0.055 });
      },
    },
    // ...and down it again when they go.
    userLeave: {
      room: 0.3,
      space: "hall",
      play: (ctx, out, at) => {
        organ(ctx, out, at, { f: note("D4"), dur: 0.13, peak: 0.05 });
        organ(ctx, out, at, { f: note("A3"), t: 0.12, dur: 0.32, peak: 0.05 });
      },
    },
    // The lid slams and the tower answers.
    disconnect: {
      room: 0.3,
      space: "hall",
      play: (ctx, out, at) => {
        creak(ctx, out, at, { dur: 0.12, rate: [44, 30], freq: 800, peak: 0.1 });
        thump(ctx, out, at, { t: 0.11, peak: 0.4, f: 62 });
        bell(ctx, out, at, { f: note("A2"), t: 0.12, dur: 1.1, peak: 0.08 });
      },
    },
    // A candle flame: the faintest touch of glass.
    pttOn: { room: 0.2, space: "hall", play: (ctx, out, at) => glass(ctx, out, at, { f: note("D6"), dur: 0.12, peak: 0.05 }) },
    pttOff: { room: 0.2, space: "hall", play: (ctx, out, at) => glass(ctx, out, at, { f: note("A5"), dur: 0.12, peak: 0.045 }) },
    // The mirror stays empty: glass that rises...
    cameraOn: {
      room: 0.3,
      space: "hall",
      play: (ctx, out, at) => {
        glass(ctx, out, at, { f: note("D5"), dur: 0.3, peak: 0.07 });
        glass(ctx, out, at, { t: 0.08, f: note("A5"), dur: 0.5, peak: 0.08 });
      },
    },
    // ...and falls.
    cameraOff: {
      room: 0.3,
      space: "hall",
      play: (ctx, out, at) => {
        glass(ctx, out, at, { f: note("A5"), dur: 0.3, peak: 0.07 });
        glass(ctx, out, at, { t: 0.08, f: note("D5"), dur: 0.5, peak: 0.08 });
      },
    },
    shareStart: {
      room: 0.3,
      space: "hall",
      play: (ctx, out, at) => ["D4", "F4", "A4", "D5"].forEach((n, i) => organ(ctx, out, at, { f: note(n), t: i * 0.09, dur: 0.3 - i * 0.02 + (i === 3 ? 0.25 : 0), peak: 0.04 })),
    },
    shareStop: {
      room: 0.3,
      space: "hall",
      play: (ctx, out, at) => ["D5", "A4", "F4", "D4"].forEach((n, i) => organ(ctx, out, at, { f: note(n), t: i * 0.09, dur: i === 3 ? 0.5 : 0.25, peak: 0.04 })),
    },
    // The doors open on a D minor chord.
    callAnswer: {
      room: 0.32,
      space: "hall",
      play: (ctx, out, at) => ["D3", "A3", "D4", "F4"].forEach((n, i) => organ(ctx, out, at, { f: note(n), t: i * 0.02, dur: 0.7, peak: 0.03 })),
    },
    // Amen: G minor falls to D minor and fades.
    callEnd: {
      room: 0.32,
      space: "hall",
      play: (ctx, out, at) => {
        const lp = sweep(ctx, out, at, { from: 3200, to: 700, time: 0.8 });
        ["G3", "Bb3", "D4"].forEach((n) => organ(ctx, lp, at, { f: note(n), dur: 0.26, peak: 0.035 }));
        ["D3", "A3", "D4", "F4"].forEach((n) => organ(ctx, lp, at, { f: note(n), t: 0.28, dur: 0.45, peak: 0.03 }));
      },
    },
  },
  rings: {
    // Two slow tolls while you wait.
    ringOut: {
      room: 0.32,
      space: "hall",
      period: 3600,
      play: (ctx, out, at) => {
        bell(ctx, out, at, { f: note("A3"), dur: 1.3, peak: 0.1 });
        bell(ctx, out, at, { f: note("F3"), t: 0.9, dur: 1.4, peak: 0.1 });
      },
    },
    // The opening of Bach's Toccata and Fugue in D minor, with the pedal an octave down.
    ringIn: {
      room: 0.3,
      space: "hall",
      period: 3800,
      play: (ctx, out, at) => {
        const motif: Array<[string, number, number]> = [
          ["A5", 0, 0.12], ["G5", 0.12, 0.1], ["A5", 0.22, 0.55],
          ["G5", 0.95, 0.08], ["F5", 1.03, 0.08], ["E5", 1.11, 0.08], ["D5", 1.19, 0.08],
          ["C#5", 1.27, 0.4], ["D5", 1.72, 0.9],
        ];
        for (const [n, t, dur] of motif) {
          organ(ctx, out, at, { f: note(n), t, dur, peak: 0.04 });
          organ(ctx, out, at, { f: note(n) / 2, t, dur, peak: 0.025 });
        }
      },
    },
  },
};

/* Dark Academia: a library, a harpsichord, a grandfather clock ------------- */

const darkAcademia: SoundSet = {
  cues: {
    // A heavy book shut.
    mute: {
      room: 0.16,
      space: "hall",
      play: (ctx, out, at) => {
        rustle(ctx, out, at, { dur: 0.08, from: 2600, to: 900, peak: 0.08 });
        thump(ctx, out, at, { t: 0.06, peak: 0.3, f: 110 });
        tick(ctx, out, at, { t: 0.06, freq: 1400, peak: 0.12, q: 0.8 });
      },
    },
    // A page turned.
    unmute: {
      room: 0.16,
      space: "hall",
      play: (ctx, out, at) => {
        rustle(ctx, out, at, { dur: 0.2, from: 1200, to: 5200, q: 0.9, peak: 0.38 });
        rustle(ctx, out, at, { t: 0.15, dur: 0.07, from: 4000, to: 2500, q: 1.5, peak: 0.2 });
      },
    },
    // The grandfather clock, low...
    deafen: {
      room: 0.26,
      space: "hall",
      play: (ctx, out, at) => {
        bell(ctx, out, at, { f: note("E4"), dur: 0.9, peak: 0.08 });
        bell(ctx, out, at, { f: note("B3"), t: 0.3, dur: 1.1, peak: 0.085 });
      },
    },
    // ...and back up.
    undeafen: {
      room: 0.26,
      space: "hall",
      play: (ctx, out, at) => {
        bell(ctx, out, at, { f: note("B3"), dur: 0.8, peak: 0.075 });
        bell(ctx, out, at, { f: note("E4"), t: 0.26, dur: 1.0, peak: 0.085 });
      },
    },
    // The little bell over the reading-room door.
    userJoin: {
      room: 0.22,
      space: "hall",
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 1800, peak: 0.08, q: 2 });
        ([["E6", 0], ["B6", 0.07], ["E6", 0.14]] as const).forEach(([n, t]) => strike(ctx, out, at, { f: note(n), t, dur: 0.35, peak: 0.07, ratio: 3.5, bright: 0.6, drop: 0 }));
      },
    },
    // One soft ring as the door swings shut.
    userLeave: {
      room: 0.22,
      space: "hall",
      play: (ctx, out, at) => {
        strike(ctx, out, at, { f: note("B5"), dur: 0.4, peak: 0.07, ratio: 3.5, bright: 0.5, drop: 0 });
        thump(ctx, out, at, { t: 0.1, peak: 0.16, f: 120 });
        tick(ctx, out, at, { t: 0.1, freq: 1600, peak: 0.08, q: 1 });
      },
    },
    // A book shut and the clock striking the hour, low.
    disconnect: {
      room: 0.26,
      space: "hall",
      play: (ctx, out, at) => {
        rustle(ctx, out, at, { dur: 0.08, from: 2600, to: 900, peak: 0.08 });
        thump(ctx, out, at, { t: 0.06, peak: 0.3, f: 100 });
        bell(ctx, out, at, { f: note("E3"), t: 0.1, dur: 1.2, peak: 0.08 });
      },
    },
    // A pen nib on the desk.
    pttOn: {
      room: 0.1,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 4200, peak: 0.07, q: 3 });
        knock(ctx, out, at, { t: 0.002, f: 1900, peak: 0.1 });
      },
    },
    pttOff: {
      room: 0.1,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 3000, peak: 0.06, q: 3 });
        knock(ctx, out, at, { t: 0.002, f: 1500, peak: 0.1 });
      },
    },
    // The brass desk lamp's pull chain.
    cameraOn: {
      room: 0.14,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 5200, peak: 0.08, q: 6 });
        tick(ctx, out, at, { t: 0.05, freq: 3600, peak: 0.1, q: 6 });
        strike(ctx, out, at, { t: 0.05, f: note("B5"), dur: 0.25, peak: 0.05, ratio: 2.7, bright: 0.6, drop: 0 });
      },
    },
    cameraOff: {
      room: 0.14,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 3600, peak: 0.1, q: 6 });
        tick(ctx, out, at, { t: 0.05, freq: 5200, peak: 0.08, q: 6 });
        strike(ctx, out, at, { t: 0.05, f: note("E5"), dur: 0.25, peak: 0.05, ratio: 2.7, bright: 0.5, drop: 0 });
      },
    },
    // A harpsichord flourish.
    shareStart: {
      room: 0.2,
      space: "hall",
      play: (ctx, out, at) => ["G4", "B4", "D5", "G5"].forEach((n, i) => harpsichord(ctx, out, at, { f: note(n), t: i * 0.07, peak: 0.14 })),
    },
    shareStop: {
      room: 0.2,
      space: "hall",
      play: (ctx, out, at) => ["G5", "D5", "B4", "G4"].forEach((n, i) => harpsichord(ctx, out, at, { f: note(n), t: i * 0.07, peak: 0.13 })),
    },
    // A chord swept across the keys.
    callAnswer: {
      room: 0.22,
      space: "hall",
      play: (ctx, out, at) => {
        ["G3", "D4", "G4", "B4", "D5"].forEach((n, i) => harpsichord(ctx, out, at, { f: note(n), t: i * 0.025, peak: 0.1 }));
        harpsichord(ctx, out, at, { f: note("G5"), t: 0.15, peak: 0.12 });
      },
    },
    callEnd: {
      room: 0.2,
      space: "hall",
      play: (ctx, out, at) => {
        harpsichord(ctx, out, at, { f: note("D5"), peak: 0.13 });
        harpsichord(ctx, out, at, { f: note("G4"), t: 0.11, peak: 0.14 });
        thump(ctx, out, at, { t: 0.11, peak: 0.18, f: 110 });
      },
    },
  },
  rings: {
    // A pendulum ticking, then one soft strike.
    ringOut: {
      room: 0.22,
      space: "hall",
      period: 3200,
      play: (ctx, out, at) => {
        for (let i = 0; i < 4; i++) {
          tick(ctx, out, at, { t: i * 0.5, freq: i % 2 ? 2600 : 3400, peak: 0.16, q: 6 });
          thump(ctx, out, at, { t: i * 0.5, peak: 0.05, f: 160 });
        }
        bell(ctx, out, at, { f: note("G4"), t: 2.05, dur: 0.9, peak: 0.06 });
      },
    },
    // The Westminster Quarters.
    ringIn: {
      room: 0.26,
      space: "hall",
      period: 4200,
      play: (ctx, out, at) => {
        ["E5", "G#5", "F#5", "B4", "E5", "F#5", "G#5", "E5"].forEach((n, i) =>
          bell(ctx, out, at, { f: note(n), t: i * 0.42 + (i >= 4 ? 0.3 : 0), dur: 1.0, peak: 0.07 }),
        );
      },
    },
  },
};

/* Matrix: green phosphor, telemetry, a phone line in the dark --------------- */

const matrix: SoundSet = {
  cues: {
    // Optic shutter closing: a downward sweep and the carrier dropping out.
    mute: {
      room: 0.08,
      play: (ctx, out, at) => {
        const d = crush(ctx, out, 40);
        glitch(ctx, d, at, { dur: 0.04, freq: 4500, peak: 0.2 });
        blip(ctx, d, at, { f: 2400, to: 320, dur: 0.09, peak: 0.3, type: "sawtooth", q: 4 });
        tone(ctx, out, at, { t: 0.02, f: 110, to: 45, dur: 0.12, peak: 0.3, attack: 0.002 });
      },
    },
    // Jacking in: two quick blips up and a green tone.
    unmute: {
      room: 0.08,
      play: (ctx, out, at) => {
        const d = crush(ctx, out, 40);
        glitch(ctx, d, at, { dur: 0.02, freq: 5200, peak: 0.16 });
        blip(ctx, d, at, { f: 960, to: 2200, dur: 0.045, peak: 0.25, type: "sawtooth" });
        blip(ctx, d, at, { t: 0.045, f: 1400, to: 3200, dur: 0.065, peak: 0.28, type: "sine", q: 2.5 });
        tone(ctx, out, at, { t: 0.08, f: note("E5"), dur: 0.18, peak: 0.13, attack: 0.002 });
      },
    },
    // Signal lost: the carrier falls away under static.
    deafen: {
      room: 0.08,
      play: (ctx, out, at) => {
        const d = crush(ctx, out, 24);
        glitch(ctx, d, at, { dur: 0.06, freq: 2800, peak: 0.22 });
        blip(ctx, d, at, { f: 880, to: 110, dur: 0.22, peak: 0.32, type: "sawtooth", q: 2 });
        tone(ctx, out, at, { t: 0.06, f: 75, to: 35, dur: 0.25, peak: 0.35, attack: 0.002 });
      },
    },
    // Handshake: two tones lock and climb.
    undeafen: {
      room: 0.08,
      play: (ctx, out, at) => {
        glitch(ctx, out, at, { dur: 0.03, freq: 4200, peak: 0.18 });
        tone(ctx, out, at, { f: 440, dur: 0.08, peak: 0.18, attack: 0.002 });
        tone(ctx, out, at, { t: 0.06, f: 880, dur: 0.1, peak: 0.22, attack: 0.002 });
        blip(ctx, out, at, { t: 0.12, f: 1760, to: 2640, dur: 0.1, peak: 0.25, type: "sine" });
      },
    },
    // A packet arrives: a burst of data climbing to a phosphor ping.
    userJoin: {
      room: 0.1,
      play: (ctx, out, at) => {
        data(ctx, crush(ctx, out, 32), at, { tones: [1200, 2200], steps: 10, peak: 0.07, drift: 0.6 });
        tone(ctx, out, at, { t: 0.12, f: note("A5"), dur: 0.22, peak: 0.14, attack: 0.002 });
      },
    },
    userLeave: {
      room: 0.1,
      play: (ctx, out, at) => {
        data(ctx, crush(ctx, out, 32), at, { tones: [1200, 2200], steps: 10, peak: 0.06, drift: -0.6 });
        tone(ctx, out, at, { t: 0.12, f: note("A4"), dur: 0.22, peak: 0.14, attack: 0.002 });
      },
    },
    // The line is cut: a click, the carrier falling, static that stops dead.
    disconnect: {
      room: 0.08,
      play: (ctx, out, at) => {
        const d = crush(ctx, out, 16);
        tick(ctx, out, at, { freq: 2000, peak: 0.12 });
        blip(ctx, d, at, { t: 0.01, f: 1200, to: 60, dur: 0.35, peak: 0.3, type: "sawtooth", q: 1.5 });
        glitch(ctx, d, at, { t: 0.2, dur: 0.14, freq: 2400, peak: 0.12, q: 0.8 });
      },
    },
    pttOn: { room: 0.04, play: (ctx, out, at) => blip(ctx, crush(ctx, out, 24), at, { f: 2000, to: 2400, dur: 0.025, peak: 0.12 }) },
    pttOff: { room: 0.04, play: (ctx, out, at) => blip(ctx, crush(ctx, out, 24), at, { f: 1300, to: 1000, dur: 0.025, peak: 0.12 }) },
    // A scanline sweeps the screen as the camera comes up...
    cameraOn: {
      room: 0.08,
      play: (ctx, out, at) => {
        rustle(ctx, out, at, { dur: 0.12, from: 1500, to: 9000, q: 3, peak: 0.12 });
        tone(ctx, out, at, { t: 0.1, f: 1760, dur: 0.12, peak: 0.08, attack: 0.002 });
      },
    },
    // ...and back down as it goes.
    cameraOff: {
      room: 0.08,
      play: (ctx, out, at) => {
        rustle(ctx, out, at, { dur: 0.12, from: 9000, to: 1500, q: 3, peak: 0.12 });
        tone(ctx, out, at, { t: 0.1, f: 880, dur: 0.12, peak: 0.08, attack: 0.002 });
      },
    },
    // Uplink: four telemetry packets climbing.
    shareStart: {
      room: 0.1,
      play: (ctx, out, at) => {
        const d = crush(ctx, out, 32);
        ["A4", "C5", "E5", "A5"].forEach((n, i) => blip(ctx, d, at, { t: i * 0.045, f: note(n), to: note(n) * 1.5, dur: 0.05, peak: 0.2, type: "sawtooth", q: 4 }));
        tone(ctx, out, at, { t: 0.2, f: note("E6"), dur: 0.25, peak: 0.07 });
      },
    },
    shareStop: {
      room: 0.1,
      play: (ctx, out, at) => {
        const d = crush(ctx, out, 32);
        ["A5", "E5", "C5", "A4"].forEach((n, i) => blip(ctx, d, at, { t: i * 0.045, f: note(n) * 1.5, to: note(n), dur: 0.05, peak: 0.2, type: "sawtooth", q: 4 }));
      },
    },
    // The operator dials you in: two touch-tones, static, a clean tone.
    callAnswer: {
      room: 0.1,
      play: (ctx, out, at) => {
        tone(ctx, out, at, { f: 941, dur: 0.09, peak: 0.16 });
        tone(ctx, out, at, { f: 1336, dur: 0.09, peak: 0.16 });
        tone(ctx, out, at, { t: 0.11, f: 1209, dur: 0.12, peak: 0.18 });
        tone(ctx, out, at, { t: 0.11, f: 697, dur: 0.12, peak: 0.18 });
        glitch(ctx, out, at, { t: 0.24, dur: 0.04, freq: 3800, peak: 0.16 });
        tone(ctx, out, at, { t: 0.26, f: 880, dur: 0.35, peak: 0.22 });
      },
    },
    callEnd: {
      room: 0.08,
      play: (ctx, out, at) => {
        const d = crush(ctx, out, 24);
        glitch(ctx, d, at, { dur: 0.08, freq: 1800, peak: 0.22 });
        blip(ctx, d, at, { f: 880, to: 80, dur: 0.18, peak: 0.3, type: "sawtooth", q: 2 });
      },
    },
  },
  rings: {
    // A carrier pulse while the line connects.
    ringOut: {
      room: 0.12,
      period: 2800,
      play: (ctx, out, at) => {
        blip(ctx, out, at, { f: 440, to: 880, dur: 0.08, peak: 0.2, type: "sine" });
        glitch(ctx, out, at, { t: 0.09, dur: 0.03, freq: 4000, peak: 0.1 });
        blip(ctx, out, at, { t: 0.5, f: 440, to: 880, dur: 0.08, peak: 0.14, type: "sine" });
      },
    },
    // An old desk phone ringing in an empty room.
    ringIn: {
      room: 0.16,
      period: 3200,
      play: (ctx, out, at) => {
        const line = band(ctx, out, 350, 3000);
        for (let b = 0; b < 2; b++) {
          tone(ctx, line, at, { t: b * 0.45, f: 440, dur: 0.32, peak: 0.2, attack: 0.01 });
          tone(ctx, line, at, { t: b * 0.45, f: 480, dur: 0.32, peak: 0.2, attack: 0.01 });
          glitch(ctx, out, at, { t: b * 0.45 + 0.1, dur: 0.1, freq: 3200, peak: 0.05 });
        }
      },
    },
  },
};

/* Cyberpunk: overdriven neon, servos, industrial sub-bass ------------------- */

const cyberpunk: SoundSet = {
  cues: {
    mute: {
      room: 0.1,
      play: (ctx, out, at) => {
        glitch(ctx, out, at, { dur: 0.05, freq: 2400, peak: 0.22 });
        neon(ctx, out, at, { f: note("E5"), to: note("B4"), dur: 0.16, peak: 0.1, open: [3200, 500] });
        tone(ctx, out, at, { t: 0.02, f: 95, to: 35, dur: 0.16, peak: 0.28, attack: 0.002 });
      },
    },
    unmute: {
      room: 0.1,
      play: (ctx, out, at) => {
        glitch(ctx, out, at, { dur: 0.03, freq: 4800, peak: 0.18 });
        neon(ctx, out, at, { f: note("B4"), to: note("E5"), dur: 0.18, peak: 0.1, open: [600, 4200] });
      },
    },
    // Power down: the lead dives two octaves, the sub drops out.
    deafen: {
      room: 0.12,
      play: (ctx, out, at) => {
        glitch(ctx, out, at, { dur: 0.07, freq: 1900, peak: 0.24 });
        neon(ctx, out, at, { f: note("E4"), to: note("E2"), dur: 0.32, peak: 0.12, open: [2600, 200] });
        tone(ctx, out, at, { t: 0.04, f: 80, to: 30, dur: 0.3, peak: 0.3, attack: 0.002 });
      },
    },
    // Power up.
    undeafen: {
      room: 0.12,
      play: (ctx, out, at) => {
        glitch(ctx, out, at, { dur: 0.03, freq: 3800, peak: 0.2 });
        neon(ctx, out, at, { f: note("E2"), to: note("E4"), dur: 0.28, peak: 0.12, open: [300, 3800] });
      },
    },
    // A synthwave stab that opens up...
    userJoin: {
      room: 0.16,
      play: (ctx, out, at) => {
        ["E4", "B4"].forEach((n) => neon(ctx, out, at, { f: note(n), dur: 0.14, peak: 0.06, open: [700, 1800] }));
        ["G4", "D5"].forEach((n) => neon(ctx, out, at, { f: note(n), t: 0.09, dur: 0.3, peak: 0.065, open: [900, 4200] }));
      },
    },
    // ...and one that closes down.
    userLeave: {
      room: 0.16,
      play: (ctx, out, at) => {
        ["G4", "D5"].forEach((n) => neon(ctx, out, at, { f: note(n), dur: 0.14, peak: 0.06, open: [3000, 1500] }));
        ["E4", "B4"].forEach((n) => neon(ctx, out, at, { f: note(n), t: 0.09, dur: 0.3, peak: 0.06, open: [2000, 400] }));
      },
    },
    // Hard shutdown: the signal stutters, then everything dives.
    disconnect: {
      room: 0.14,
      play: (ctx, out, at) => {
        for (const t of [0, 0.045, 0.09]) glitch(ctx, out, at, { t, dur: 0.03, freq: 2200 + t * 8000, peak: 0.2 });
        neon(ctx, out, at, { t: 0.1, f: note("E3"), to: note("E1"), dur: 0.45, peak: 0.13, open: [2400, 150] });
        tone(ctx, out, at, { t: 0.1, f: 70, to: 28, dur: 0.4, peak: 0.32, attack: 0.002 });
      },
    },
    // A servo clicking in and out.
    pttOn: {
      room: 0.05,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 3000, peak: 0.06 });
        blip(ctx, out, at, { f: 900, to: 1300, dur: 0.05, peak: 0.14, q: 4 });
      },
    },
    pttOff: {
      room: 0.05,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 2400, peak: 0.06 });
        blip(ctx, out, at, { f: 1100, to: 700, dur: 0.05, peak: 0.13, q: 4 });
      },
    },
    // An optic implant focusing...
    cameraOn: {
      room: 0.1,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 2800, peak: 0.08 });
        tone(ctx, out, at, { f: 700, to: 2400, dur: 0.18, peak: 0.07, type: "triangle", attack: 0.01 });
        glitch(ctx, out, at, { t: 0.17, dur: 0.02, freq: 5000, peak: 0.1 });
      },
    },
    // ...and powering down.
    cameraOff: {
      room: 0.1,
      play: (ctx, out, at) => {
        glitch(ctx, out, at, { dur: 0.02, freq: 5000, peak: 0.1 });
        tone(ctx, out, at, { f: 2400, to: 700, dur: 0.18, peak: 0.07, type: "triangle", attack: 0.01 });
        tick(ctx, out, at, { t: 0.18, freq: 2400, peak: 0.08 });
      },
    },
    // Going live: an overdriven arpeggio tearing upward.
    shareStart: {
      room: 0.14,
      play: (ctx, out, at) => {
        glitch(ctx, out, at, { dur: 0.03, freq: 4000, peak: 0.16 });
        ["E4", "G4", "B4", "E5", "G5"].forEach((n, i) => neon(ctx, out, at, { f: note(n), t: i * 0.045, dur: i === 4 ? 0.35 : 0.1, peak: 0.08, open: [900 + i * 500, 4500] }));
      },
    },
    shareStop: {
      room: 0.14,
      play: (ctx, out, at) => {
        ["G5", "E5", "B4", "G4", "E4"].forEach((n, i) => neon(ctx, out, at, { f: note(n), t: i * 0.045, dur: i === 4 ? 0.3 : 0.1, peak: 0.075, open: [4000 - i * 600, 500] }));
        glitch(ctx, out, at, { t: 0.2, dur: 0.04, freq: 1800, peak: 0.14 });
      },
    },
    // Connection open: a full chord hit over the sub.
    callAnswer: {
      room: 0.16,
      play: (ctx, out, at) => {
        glitch(ctx, out, at, { dur: 0.04, freq: 3000, peak: 0.2 });
        ["E3", "B3", "E4", "G4"].forEach((n) => neon(ctx, out, at, { t: 0.03, f: note(n), dur: 0.45, peak: 0.045, open: [500, 3600] }));
        tone(ctx, out, at, { t: 0.03, f: 55, dur: 0.35, peak: 0.35, attack: 0.004 });
      },
    },
    callEnd: {
      room: 0.12,
      play: (ctx, out, at) => {
        glitch(ctx, out, at, { dur: 0.08, freq: 1400, peak: 0.24 });
        neon(ctx, out, at, { f: note("E4"), to: note("E2"), dur: 0.26, peak: 0.12, open: [2600, 200] });
      },
    },
  },
  rings: {
    // A bass sequence pulsing while you wait.
    ringOut: {
      room: 0.12,
      period: 2800,
      play: (ctx, out, at) => {
        ["E2", "E2", "G2", "E2"].forEach((n, i) => neon(ctx, out, at, { f: note(n), t: i * 0.17, dur: 0.14, peak: 0.12, open: [1800, 300], q: 8 }));
      },
    },
    // A neon riff, plucked short.
    ringIn: {
      room: 0.16,
      period: 2600,
      play: (ctx, out, at) => {
        ["E5", "B5", "G5", "E6", "D6", "B5", "G5", "B5"].forEach((n, i) => neon(ctx, out, at, { f: note(n), t: i * 0.1, dur: 0.12, peak: 0.07, open: [3600, 700], q: 6 }));
        neon(ctx, out, at, { f: note("E2"), dur: 0.7, peak: 0.08, open: [600, 300] });
      },
    },
  },
};

/* MSN / Retro 2000s: round bloops, soft pads, a desk phone ------------------ */

const retro: SoundSet = {
  cues: {
    // Down a minor third, like a device unplugged...
    mute: {
      room: 0.12,
      play: (ctx, out, at) => {
        bloop(ctx, out, at, { f: note("E5"), dur: 0.14, peak: 0.16 });
        bloop(ctx, out, at, { f: note("C#5"), t: 0.1, dur: 0.38, peak: 0.18 });
      },
    },
    // ...and up it again, plugged back in.
    unmute: {
      room: 0.12,
      play: (ctx, out, at) => {
        bloop(ctx, out, at, { f: note("C#5"), dur: 0.14, peak: 0.16 });
        bloop(ctx, out, at, { f: note("E5"), t: 0.09, dur: 0.4, peak: 0.18, shine: 0.18 });
      },
    },
    deafen: {
      room: 0.14,
      play: (ctx, out, at) => {
        bloop(ctx, out, at, { f: note("A4"), dur: 0.16, peak: 0.2 });
        bloop(ctx, out, at, { f: note("C4"), t: 0.11, dur: 0.45, peak: 0.22 });
      },
    },
    undeafen: {
      room: 0.14,
      play: (ctx, out, at) => {
        bloop(ctx, out, at, { f: note("C4"), dur: 0.16, peak: 0.2 });
        bloop(ctx, out, at, { f: note("C5"), t: 0.1, dur: 0.45, peak: 0.2, shine: 0.18 });
      },
    },
    // A buddy signs in: three bubbles rising.
    userJoin: {
      room: 0.16,
      play: (ctx, out, at) => ["E5", "G5", "C6"].forEach((n, i) => bloop(ctx, out, at, { f: note(n), t: i * 0.06, dur: i === 2 ? 0.45 : 0.15, peak: 0.13, shine: 0.16 })),
    },
    userLeave: {
      room: 0.16,
      play: (ctx, out, at) => ["C6", "G5", "E5"].forEach((n, i) => bloop(ctx, out, at, { f: note(n), t: i * 0.06, dur: i === 2 ? 0.4 : 0.14, peak: 0.12, shine: 0.05 })),
    },
    disconnect: {
      room: 0.14,
      play: (ctx, out, at) => {
        ["C5", "G4", "C4"].forEach((n, i) => bloop(ctx, out, at, { f: note(n), t: i * 0.08, dur: i === 2 ? 0.5 : 0.15, peak: 0.16 }));
        thump(ctx, out, at, { t: 0.16, peak: 0.12, f: 90 });
      },
    },
    pttOn: { room: 0.06, play: (ctx, out, at) => bloop(ctx, out, at, { f: 1200, dur: 0.07, peak: 0.08, shine: 0 }) },
    pttOff: { room: 0.06, play: (ctx, out, at) => bloop(ctx, out, at, { f: 800, dur: 0.07, peak: 0.08, shine: 0 }) },
    cameraOn: {
      room: 0.12,
      play: (ctx, out, at) => {
        bloop(ctx, out, at, { f: note("G5"), dur: 0.12, peak: 0.1 });
        bloop(ctx, out, at, { f: note("D6"), t: 0.07, dur: 0.3, peak: 0.11 });
      },
    },
    cameraOff: {
      room: 0.12,
      play: (ctx, out, at) => {
        bloop(ctx, out, at, { f: note("D6"), dur: 0.12, peak: 0.1 });
        bloop(ctx, out, at, { f: note("G5"), t: 0.07, dur: 0.3, peak: 0.11 });
      },
    },
    shareStart: {
      room: 0.16,
      play: (ctx, out, at) => {
        ["C5", "E5", "G5"].forEach((n, i) => bloop(ctx, out, at, { f: note(n), t: i * 0.08, dur: i === 2 ? 0.45 : 0.16, peak: 0.15, shine: 0.16 }));
        pad(ctx, out, at, { t: 0.16, notes: [note("C5"), note("G5")], dur: 0.4, peak: 0.025 });
      },
    },
    shareStop: {
      room: 0.16,
      play: (ctx, out, at) => ["G5", "E5", "C5"].forEach((n, i) => bloop(ctx, out, at, { f: note(n), t: i * 0.08, dur: i === 2 ? 0.4 : 0.15, peak: 0.14 })),
    },
    // Ta-da: an arpeggio up into a big soft chord.
    callAnswer: {
      room: 0.2,
      play: (ctx, out, at) => {
        ["G4", "C5", "E5"].forEach((n, i) => bloop(ctx, out, at, { f: note(n), t: i * 0.08, dur: 0.14, peak: 0.13 }));
        pad(ctx, out, at, { t: 0.24, notes: ["C4", "G4", "C5", "E5", "G5"].map(note), dur: 0.8, peak: 0.03 });
      },
    },
    callEnd: {
      room: 0.14,
      play: (ctx, out, at) => ["E5", "C#5", "A4"].forEach((n, i) => bloop(ctx, out, at, { f: note(n), t: i * 0.09, dur: i === 2 ? 0.4 : 0.14, peak: 0.16 })),
    },
  },
  rings: {
    // The ringback of a landline.
    ringOut: {
      room: 0.1,
      period: 3000,
      play: (ctx, out, at) => {
        const line = band(ctx, out, 350, 3000);
        tone(ctx, line, at, { f: 440, dur: 0.85, peak: 0.13, attack: 0.02 });
        tone(ctx, line, at, { f: 480, dur: 0.85, peak: 0.13, attack: 0.02 });
      },
    },
    // A bubbly double ring.
    ringIn: {
      room: 0.16,
      period: 3200,
      play: (ctx, out, at) => {
        for (let b = 0; b < 2; b++) {
          for (let i = 0; i < 6; i++) bloop(ctx, out, at, { f: note(i % 2 ? "C6" : "E6"), t: b * 0.55 + i * 0.055, dur: 0.12, peak: 0.1 - i * 0.008, shine: 0.06 });
        }
      },
    },
  },
};

/* Star Wars: energy blades, droids, blast doors, hyperspace ----------------- */

const starWars: SoundSet = {
  cues: {
    mute: { room: 0.12, play: (ctx, out, at) => blade(ctx, out, at, { on: false, dur: 0.3, peak: 0.14 }) },
    unmute: { room: 0.12, play: (ctx, out, at) => blade(ctx, out, at, { on: true, dur: 0.38, peak: 0.13 }) },
    // A blast door hisses shut...
    deafen: {
      room: 0.18,
      play: (ctx, out, at) => {
        rustle(ctx, out, at, { dur: 0.3, from: 3400, to: 900, q: 0.7, peak: 0.12, attack: 0.03 });
        clang(ctx, out, at, { t: 0.27, peak: 0.3 });
      },
    },
    // ...and grinds open.
    undeafen: {
      room: 0.18,
      play: (ctx, out, at) => {
        clang(ctx, out, at, { peak: 0.24 });
        rustle(ctx, out, at, { t: 0.04, dur: 0.3, from: 900, to: 3400, q: 0.7, peak: 0.12, attack: 0.08 });
      },
    },
    // A droid whistles hello...
    userJoin: { room: 0.12, play: (ctx, out, at) => chirp(ctx, out, at, { path: [1400, 2600, 1900, 3100], peak: 0.11 }) },
    // ...and a sad, sliding "oh".
    userLeave: { room: 0.12, play: (ctx, out, at) => chirp(ctx, out, at, { path: [2600, 1500, 1900, 800], step: 0.065, peak: 0.1 }) },
    // Systems powering down.
    disconnect: {
      room: 0.16,
      play: (ctx, out, at) => {
        const lp = sweep(ctx, out, at, { from: 4000, to: 300, time: 0.55 });
        tone(ctx, lp, at, { f: 1800, to: 120, dur: 0.55, peak: 0.12, type: "sawtooth", attack: 0.01 });
        clang(ctx, out, at, { t: 0.5, peak: 0.18 });
      },
    },
    // The comlink keyed open and closed.
    pttOn: {
      room: 0.05,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 2500, peak: 0.07 });
        beep(ctx, out, at, { t: 0.01, f: 1400, dur: 0.05, peak: 0.07 });
      },
    },
    pttOff: {
      room: 0.05,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 2000, peak: 0.07 });
        beep(ctx, out, at, { t: 0.01, f: 950, dur: 0.05, peak: 0.07 });
      },
    },
    // A hologram flickering into view...
    cameraOn: {
      room: 0.14,
      play: (ctx, out, at) => {
        for (let i = 0; i < 5; i++) glitch(ctx, out, at, { t: i * 0.035, dur: 0.02, freq: 3800, peak: 0.08, q: 2 });
        tone(ctx, out, at, { f: 600, to: 1200, dur: 0.25, peak: 0.07, attack: 0.03 });
        tone(ctx, out, at, { f: 603, to: 1206, dur: 0.25, peak: 0.05, attack: 0.03, type: "triangle" });
      },
    },
    // ...and out of it.
    cameraOff: {
      room: 0.14,
      play: (ctx, out, at) => {
        tone(ctx, out, at, { f: 1200, to: 600, dur: 0.22, peak: 0.07, attack: 0.01 });
        for (let i = 0; i < 4; i++) glitch(ctx, out, at, { t: 0.08 + i * 0.035, dur: 0.02, freq: 3200, peak: 0.07 - i * 0.012, q: 2 });
      },
    },
    // Jump to hyperspace.
    shareStart: {
      room: 0.22,
      play: (ctx, out, at) => {
        whoosh(ctx, out, at, { from: 300, to: 6000, dur: 0.45, peak: 0.12, q: 0.9 });
        const lp = sweep(ctx, out, at, { from: 600, to: 5000, time: 0.45 });
        for (const ratio of [1, 1.5, 2.01]) tone(ctx, lp, at, { f: 110 * ratio, to: 880 * ratio, dur: 0.45, peak: 0.03, type: "sawtooth", attack: 0.2 });
        thump(ctx, out, at, { t: 0.44, peak: 0.3, f: 50 });
      },
    },
    // Dropping back out.
    shareStop: {
      room: 0.22,
      play: (ctx, out, at) => {
        whoosh(ctx, out, at, { from: 5000, to: 400, dur: 0.35, peak: 0.1, q: 0.9 });
        const lp = sweep(ctx, out, at, { from: 5000, to: 500, time: 0.35 });
        for (const ratio of [1, 1.5]) tone(ctx, lp, at, { f: 880 * ratio, to: 110 * ratio, dur: 0.35, peak: 0.03, type: "sawtooth", attack: 0.01 });
        thump(ctx, out, at, { t: 0.3, peak: 0.18, f: 60 });
      },
    },
    // A channel opens: crackle, two tones up, a droid's acknowledgement.
    callAnswer: {
      room: 0.14,
      play: (ctx, out, at) => {
        glitch(ctx, out, at, { dur: 0.05, freq: 3000, peak: 0.1, q: 1 });
        beep(ctx, out, at, { t: 0.04, f: 1200, peak: 0.08 });
        beep(ctx, out, at, { t: 0.13, f: 1800, peak: 0.08 });
        chirp(ctx, out, at, { t: 0.26, path: [1600, 2500, 2100], step: 0.04, peak: 0.09 });
      },
    },
    callEnd: {
      room: 0.12,
      play: (ctx, out, at) => {
        beep(ctx, out, at, { f: 1800, peak: 0.08 });
        beep(ctx, out, at, { t: 0.09, f: 1200, peak: 0.08 });
        glitch(ctx, out, at, { t: 0.18, dur: 0.07, freq: 2600, peak: 0.1, q: 1 });
      },
    },
  },
  rings: {
    // A scanner's ping, reaching out.
    ringOut: {
      room: 0.4,
      space: "hall",
      period: 3200,
      play: (ctx, out, at) => {
        tone(ctx, out, at, { f: 1480, dur: 0.6, peak: 0.12, attack: 0.004 });
        tone(ctx, out, at, { t: 1.1, f: 1480, dur: 0.5, peak: 0.07, attack: 0.004 });
      },
    },
    // An incoming transmission: alert tones in threes.
    ringIn: {
      room: 0.14,
      period: 2400,
      play: (ctx, out, at) => {
        for (const group of [0, 0.5]) {
          [1600, 2100, 1600].forEach((f, i) => beep(ctx, out, at, { t: group + i * 0.09, f, dur: 0.07, peak: 0.09 }));
        }
      },
    },
  },
};

/* Minecraft: wood, stone and note blocks (F♯ major pentatonic) ------------- */

const minecraft: SoundSet = {
  cues: {
    // A wooden trapdoor dropping shut...
    mute: {
      room: 0.1,
      play: (ctx, out, at) => {
        thump(ctx, out, at, { peak: 0.25, f: 140 });
        tick(ctx, out, at, { freq: 1500, peak: 0.12, q: 0.8 });
        noteBlock(ctx, out, at, { t: 0.02, f: note("F#4"), peak: 0.16 });
      },
    },
    // ...and swinging open.
    unmute: {
      room: 0.1,
      play: (ctx, out, at) => {
        creak(ctx, out, at, { dur: 0.08, rate: [30, 50], freq: 1200, peak: 0.08 });
        tick(ctx, out, at, { t: 0.07, freq: 2200, peak: 0.12, q: 0.8 });
        noteBlock(ctx, out, at, { t: 0.07, f: note("C#5"), peak: 0.15 });
      },
    },
    deafen: {
      room: 0.12,
      play: (ctx, out, at) => {
        const lp = sweep(ctx, out, at, { from: 4000, to: 700, time: 0.35 });
        noteBlock(ctx, lp, at, { f: note("C#5"), peak: 0.18 });
        noteBlock(ctx, lp, at, { t: 0.09, f: note("F#4"), peak: 0.2 });
      },
    },
    undeafen: {
      room: 0.12,
      play: (ctx, out, at) => {
        const lp = sweep(ctx, out, at, { from: 800, to: 5000, time: 0.3 });
        noteBlock(ctx, lp, at, { f: note("F#4"), peak: 0.18 });
        noteBlock(ctx, lp, at, { t: 0.09, f: note("C#5"), peak: 0.2 });
      },
    },
    // Two notes up and a little pop.
    userJoin: {
      room: 0.12,
      play: (ctx, out, at) => {
        noteBlock(ctx, out, at, { f: note("F#5"), peak: 0.14 });
        noteBlock(ctx, out, at, { t: 0.08, f: note("C#6"), peak: 0.15 });
        tone(ctx, out, at, { t: 0.08, f: 400, to: 1100, dur: 0.06, peak: 0.06, attack: 0.002 });
      },
    },
    userLeave: {
      room: 0.12,
      play: (ctx, out, at) => {
        noteBlock(ctx, out, at, { f: note("C#6"), peak: 0.13 });
        noteBlock(ctx, out, at, { t: 0.08, f: note("F#5"), peak: 0.14 });
        tick(ctx, out, at, { t: 0.08, freq: 1200, peak: 0.06, q: 0.8 });
      },
    },
    // Three notes down onto stone.
    disconnect: {
      room: 0.12,
      play: (ctx, out, at) => {
        ["C#5", "A#4", "F#4"].forEach((n, i) => noteBlock(ctx, out, at, { t: i * 0.08, f: note(n), peak: 0.16 }));
        thump(ctx, out, at, { t: 0.16, peak: 0.25, f: 90 });
        rustle(ctx, out, at, { t: 0.16, dur: 0.12, from: 900, to: 400, q: 0.7, peak: 0.12, type: "lowpass" });
      },
    },
    // A lever thrown.
    pttOn: {
      room: 0.05,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 1800, peak: 0.09, q: 0.8 });
        knock(ctx, out, at, { t: 0.012, f: 700, peak: 0.14 });
      },
    },
    pttOff: {
      room: 0.05,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 1400, peak: 0.08, q: 0.8 });
        knock(ctx, out, at, { t: 0.012, f: 560, peak: 0.14 });
      },
    },
    cameraOn: {
      room: 0.1,
      play: (ctx, out, at) => {
        tone(ctx, out, at, { f: 300, to: 900, dur: 0.07, peak: 0.1, attack: 0.002 });
        noteBlock(ctx, out, at, { t: 0.05, f: note("F#6"), peak: 0.08 });
      },
    },
    cameraOff: {
      room: 0.1,
      play: (ctx, out, at) => {
        tone(ctx, out, at, { f: 900, to: 300, dur: 0.07, peak: 0.1, attack: 0.002 });
        noteBlock(ctx, out, at, { t: 0.05, f: note("F#5"), peak: 0.08 });
      },
    },
    shareStart: {
      room: 0.16,
      play: (ctx, out, at) => {
        ["F#5", "A#5", "C#6", "F#6"].forEach((n, i) => noteBlock(ctx, out, at, { t: i * 0.07, f: note(n), peak: 0.13 }));
        strike(ctx, out, at, { t: 0.21, f: note("F#6"), dur: 0.5, peak: 0.06, ratio: 3.5, shine: 0.2, drop: 0 });
      },
    },
    shareStop: {
      room: 0.16,
      play: (ctx, out, at) => ["F#6", "C#6", "A#5", "F#5"].forEach((n, i) => noteBlock(ctx, out, at, { t: i * 0.07, f: note(n), peak: 0.13 })),
    },
    callAnswer: {
      room: 0.18,
      play: (ctx, out, at) => {
        ["F#4", "A#4", "C#5", "F#5"].forEach((n, i) => noteBlock(ctx, out, at, { t: i * 0.03, f: note(n), peak: 0.1 }));
        strike(ctx, out, at, { t: 0.13, f: note("C#6"), dur: 0.6, peak: 0.08, ratio: 3.5, shine: 0.2, drop: 0 });
      },
    },
    callEnd: {
      room: 0.12,
      play: (ctx, out, at) => {
        noteBlock(ctx, out, at, { f: note("C#4"), peak: 0.18 });
        noteBlock(ctx, out, at, { t: 0.1, f: note("F#3"), peak: 0.2 });
        thump(ctx, out, at, { t: 0.1, peak: 0.2, f: 130 });
      },
    },
  },
  rings: {
    ringOut: {
      room: 0.14,
      period: 3000,
      play: (ctx, out, at) => {
        ([["C#6", 0], ["F#5", 0.18], ["C#6", 0.6], ["F#5", 0.78]] as const).forEach(([n, t]) => noteBlock(ctx, out, at, { t, f: note(n), peak: 0.13 }));
      },
    },
    // A little note-block tune.
    ringIn: {
      room: 0.16,
      period: 2800,
      play: (ctx, out, at) => {
        const tune: Array<[string, number]> = [["F#5", 0], ["G#5", 0.12], ["A#5", 0.24], ["C#6", 0.36], ["A#5", 0.6], ["C#6", 0.72], ["F#6", 0.84]];
        for (const [n, t] of tune) noteBlock(ctx, out, at, { t, f: note(n), peak: 0.13 });
        noteBlock(ctx, out, at, { t: 0.84, f: note("F#4"), peak: 0.1 });
      },
    },
  },
};

/* Zombie: heartbeats, groans, a walkie-talkie, an empty street ------------- */

const zombie: SoundSet = {
  cues: {
    // Your heart, muffled.
    mute: {
      room: 0.18,
      space: "hall",
      play: (ctx, out, at) => heartbeat(ctx, sweep(ctx, out, at, { from: 1500, to: 300, time: 0.3 }), at, { peak: 0.38 }),
    },
    // A sharp breath in.
    unmute: {
      room: 0.16,
      space: "hall",
      play: (ctx, out, at) => {
        rustle(ctx, out, at, { dur: 0.22, from: 700, to: 2600, q: 0.8, peak: 0.22, attack: 0.15 });
        heartbeat(ctx, out, at, { t: 0.2, peak: 0.22 });
      },
    },
    // A low, dissonant drone closing in.
    deafen: {
      room: 0.28,
      space: "hall",
      play: (ctx, out, at) => {
        const lp = sweep(ctx, out, at, { from: 1400, to: 180, time: 0.6 });
        tone(ctx, lp, at, { f: note("A2"), dur: 0.7, peak: 0.12, type: "sawtooth", attack: 0.08 });
        tone(ctx, lp, at, { f: note("Bb2"), dur: 0.7, peak: 0.11, type: "sawtooth", attack: 0.08 });
      },
    },
    // The drone lifting, a thin high whine above it.
    undeafen: {
      room: 0.28,
      space: "hall",
      play: (ctx, out, at) => {
        const lp = sweep(ctx, out, at, { from: 200, to: 1600, time: 0.4 });
        tone(ctx, lp, at, { f: note("A2"), dur: 0.5, peak: 0.12, type: "sawtooth", attack: 0.08 });
        tone(ctx, lp, at, { f: note("Bb2"), dur: 0.5, peak: 0.11, type: "sawtooth", attack: 0.08 });
        tone(ctx, out, at, { t: 0.15, f: note("E6"), dur: 0.45, peak: 0.025, attack: 0.1 });
        tone(ctx, out, at, { t: 0.15, f: note("F6"), dur: 0.45, peak: 0.02, attack: 0.1 });
      },
    },
    // Something shambles in, groaning upward...
    userJoin: { room: 0.22, space: "hall", play: (ctx, out, at) => groan(ctx, out, at, { from: 82, to: 118, dur: 0.6, peak: 0.28 }) },
    // ...and drags itself away.
    userLeave: {
      room: 0.22,
      space: "hall",
      play: (ctx, out, at) => {
        groan(ctx, out, at, { from: 112, to: 72, dur: 0.6, peak: 0.26 });
        rustle(ctx, out, at, { t: 0.35, dur: 0.18, from: 900, to: 500, q: 0.8, peak: 0.08, type: "lowpass" });
      },
    },
    // A door creaks and slams behind you.
    disconnect: {
      room: 0.3,
      space: "hall",
      play: (ctx, out, at) => {
        creak(ctx, out, at, { dur: 0.3, rate: [18, 40], freq: 900, peak: 0.12 });
        thump(ctx, out, at, { t: 0.3, peak: 0.42, f: 60 });
        tick(ctx, out, at, { t: 0.3, freq: 1200, peak: 0.16, q: 0.7 });
      },
    },
    // The survivors' walkie: key down, key up.
    pttOn: {
      room: 0.06,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        tick(ctx, r, at, { freq: 2000, peak: 0.1 });
        squelch(ctx, r, at, { t: 0.005, dur: 0.03, peak: 0.05 });
      },
    },
    pttOff: { room: 0.06, play: (ctx, out, at) => squelch(ctx, radio(ctx, out), at, { dur: 0.08, peak: 0.06 }) },
    // A flashlight clicked on, its bulb buzzing...
    cameraOn: {
      room: 0.14,
      space: "hall",
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 3000, peak: 0.12 });
        knock(ctx, out, at, { t: 0.006, f: 2200, peak: 0.1 });
        tone(ctx, sweep(ctx, out, at, { from: 2400, to: 2400, time: 0.1 }), at, { t: 0.02, f: 120, dur: 0.2, peak: 0.08, type: "sawtooth", attack: 0.01 });
      },
    },
    // ...and off.
    cameraOff: {
      room: 0.14,
      space: "hall",
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 2600, peak: 0.12 });
        knock(ctx, out, at, { t: 0.006, f: 1800, peak: 0.1 });
      },
    },
    // An emergency broadcast going out: the siren rises...
    shareStart: { room: 0.3, space: "hall", play: (ctx, out, at) => siren(ctx, out, at, { from: 480, to: 1050, dur: 0.65, peak: 0.08 }) },
    // ...and winds down.
    shareStop: { room: 0.3, space: "hall", play: (ctx, out, at) => siren(ctx, out, at, { from: 1050, to: 420, dur: 0.6, peak: 0.07 }) },
    // A survivor answers on the walkie.
    callAnswer: {
      room: 0.1,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        squelch(ctx, r, at, { dur: 0.06, peak: 0.08 });
        beep(ctx, r, at, { t: 0.07, f: 1000, dur: 0.12, peak: 0.1 });
        rustle(ctx, r, at, { t: 0.2, dur: 0.25, from: 2000, to: 1800, q: 0.4, peak: 0.025 });
      },
    },
    callEnd: {
      room: 0.1,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        beep(ctx, r, at, { f: 700, dur: 0.12, peak: 0.1 });
        squelch(ctx, r, at, { t: 0.13, dur: 0.12, peak: 0.08 });
      },
    },
  },
  rings: {
    // A slow heartbeat and a far-off bell.
    ringOut: {
      room: 0.3,
      space: "hall",
      period: 3200,
      play: (ctx, out, at) => {
        heartbeat(ctx, out, at, { peak: 0.3 });
        heartbeat(ctx, out, at, { t: 0.9, peak: 0.26 });
        bell(ctx, out, at, { f: note("A2"), t: 1.6, dur: 1.2, peak: 0.05 });
      },
    },
    // A music box, slightly out of tune.
    ringIn: {
      room: 0.32,
      space: "hall",
      period: 3000,
      play: (ctx, out, at) => {
        ["A5", "C6", "E6", "D6", "C6", "B5", "G#5", "A5"].forEach((n, i) => musicBox(ctx, out, at, { t: i * 0.17, f: note(n), peak: 0.1 }));
      },
    },
  },
};

/* Winamp: tape decks, plastic buttons, FM keys ----------------------------- */

const winamp: SoundSet = {
  cues: {
    // A tape stop...
    mute: { room: 0.1, play: (ctx, out, at) => tape(ctx, out, at, { notes: ["C4", "E4", "G4"].map(note), from: 1, to: 0.3, dur: 0.3, peak: 0.07 }) },
    // ...and the tape catching speed again.
    unmute: { room: 0.1, play: (ctx, out, at) => tape(ctx, out, at, { notes: ["C4", "E4", "G4"].map(note), from: 0.35, to: 1, dur: 0.22, peak: 0.07 }) },
    // A turntable braked to a stop.
    deafen: {
      room: 0.12,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 1600, peak: 0.08 });
        tape(ctx, out, at, { notes: ["C3", "G3", "C4", "E4"].map(note), from: 1, to: 0.18, dur: 0.5, peak: 0.06 });
      },
    },
    // And spun back up.
    undeafen: {
      room: 0.12,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 1600, peak: 0.08 });
        tape(ctx, out, at, { notes: ["C3", "G3", "C4", "E4"].map(note), from: 0.2, to: 1, dur: 0.35, peak: 0.06 });
      },
    },
    // Play: a button press and a bright FM stab.
    userJoin: {
      room: 0.12,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 2400, peak: 0.07 });
        tick(ctx, out, at, { t: 0.006, freq: 300, peak: 0.06 });
        strike(ctx, out, at, { t: 0.01, f: note("C5"), dur: 0.2, peak: 0.13, ratio: 1, bright: 1.3, shine: 0.25 });
        strike(ctx, out, at, { t: 0.08, f: note("G5"), dur: 0.4, peak: 0.15, ratio: 1, bright: 1.3, shine: 0.25 });
      },
    },
    // Stop.
    userLeave: {
      room: 0.12,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 2000, peak: 0.07 });
        tick(ctx, out, at, { t: 0.006, freq: 260, peak: 0.06 });
        strike(ctx, out, at, { t: 0.01, f: note("G5"), dur: 0.2, peak: 0.12, bright: 1 });
        strike(ctx, out, at, { t: 0.08, f: note("C5"), dur: 0.38, peak: 0.14, bright: 1 });
      },
    },
    // The power switch: everything winds down to a thunk.
    disconnect: {
      room: 0.12,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 1800, peak: 0.1 });
        tape(ctx, out, at, { notes: ["C4", "G4", "C5"].map(note), from: 1, to: 0.1, dur: 0.55, peak: 0.06 });
        thump(ctx, out, at, { t: 0.5, peak: 0.2, f: 80 });
      },
    },
    // A plastic button, down and up.
    pttOn: {
      room: 0.04,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 2400, peak: 0.08 });
        knock(ctx, out, at, { t: 0.004, f: 1400, peak: 0.1 });
      },
    },
    pttOff: {
      room: 0.04,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 1800, peak: 0.07 });
        knock(ctx, out, at, { t: 0.004, f: 1100, peak: 0.1 });
      },
    },
    // A webcam found: two square-wave blips up...
    cameraOn: {
      room: 0.08,
      play: (ctx, out, at) => {
        const lp = band(ctx, out, 200, 4000);
        tone(ctx, lp, at, { f: note("C6"), dur: 0.06, peak: 0.05, type: "square", attack: 0.002 });
        tone(ctx, lp, at, { t: 0.07, f: note("G6"), dur: 0.1, peak: 0.05, type: "square", attack: 0.002 });
      },
    },
    // ...and down.
    cameraOff: {
      room: 0.08,
      play: (ctx, out, at) => {
        const lp = band(ctx, out, 200, 4000);
        tone(ctx, lp, at, { f: note("G6"), dur: 0.06, peak: 0.05, type: "square", attack: 0.002 });
        tone(ctx, lp, at, { t: 0.07, f: note("C6"), dur: 0.1, peak: 0.05, type: "square", attack: 0.002 });
      },
    },
    // The equalizer swept open under an arpeggio.
    shareStart: {
      room: 0.14,
      play: (ctx, out, at) => {
        whoosh(ctx, out, at, { from: 200, to: 6000, dur: 0.35, peak: 0.06, q: 3 });
        ["C5", "E5", "G5", "C6"].forEach((n, i) => strike(ctx, out, at, { t: 0.04 + i * 0.06, f: note(n), dur: i === 3 ? 0.5 : 0.18, peak: 0.12, bright: 1.3, shine: 0.22 }));
      },
    },
    shareStop: {
      room: 0.14,
      play: (ctx, out, at) => {
        whoosh(ctx, out, at, { from: 6000, to: 200, dur: 0.3, peak: 0.05, q: 3 });
        ["C6", "G5", "C5"].forEach((n, i) => strike(ctx, out, at, { t: i * 0.06, f: note(n), dur: i === 2 ? 0.45 : 0.16, peak: 0.12 }));
      },
    },
    // An electric piano chord, rolled.
    callAnswer: {
      room: 0.18,
      play: (ctx, out, at) => {
        ["C4", "E4", "G4", "B4", "D5"].forEach((n, i) => strike(ctx, out, at, { t: i * 0.02, f: note(n), dur: 0.8, peak: 0.07, ratio: 1, bright: 0.9, body: i === 0 ? 0.4 : 0 }));
      },
    },
    // A cassette ejected.
    callEnd: {
      room: 0.1,
      play: (ctx, out, at) => {
        tick(ctx, out, at, { freq: 900, peak: 0.14, q: 0.7 });
        thump(ctx, out, at, { peak: 0.2, f: 120 });
        tick(ctx, out, at, { t: 0.05, freq: 2500, peak: 0.08, q: 3 });
        strike(ctx, out, at, { t: 0.08, f: note("G4"), dur: 0.18, peak: 0.1 });
        strike(ctx, out, at, { t: 0.16, f: note("C4"), dur: 0.35, peak: 0.12, body: 0.3 });
      },
    },
  },
  rings: {
    // A PC's double beep, twice.
    ringOut: {
      room: 0.08,
      period: 3000,
      play: (ctx, out, at) => {
        const lp = band(ctx, out, 200, 3000);
        for (const t of [0, 0.15, 0.6, 0.75]) tone(ctx, lp, at, { t, f: 1000, dur: 0.09, peak: 0.06, type: "square", attack: 0.002 });
      },
    },
    // A polyphonic ringtone on FM keys.
    ringIn: {
      room: 0.14,
      period: 2600,
      play: (ctx, out, at) => {
        ["C6", "E6", "G6", "E6", "C6", "G5", "A5", "B5", "C6"].forEach((n, i) => strike(ctx, out, at, { t: i * 0.11, f: note(n), dur: i === 8 ? 0.45 : 0.16, peak: 0.1, bright: 1.2, shine: 0.15 }));
        strike(ctx, out, at, { t: 0.88, f: note("C4"), dur: 0.5, peak: 0.08, body: 0.3 });
      },
    },
  },
};

/* TeamSpeak: everything on the radio, 300–3400 Hz ------------------------- */

const teamspeak: SoundSet = {
  cues: {
    mute: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        beep(ctx, r, at, { f: 1200, dur: 0.06, peak: 0.12 });
        beep(ctx, r, at, { t: 0.07, f: 800, dur: 0.1, peak: 0.12 });
        squelch(ctx, r, at, { t: 0.18, dur: 0.05, peak: 0.05 });
      },
    },
    unmute: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        tick(ctx, r, at, { freq: 2000, peak: 0.08 });
        beep(ctx, r, at, { t: 0.01, f: 800, dur: 0.06, peak: 0.12 });
        beep(ctx, r, at, { t: 0.08, f: 1200, dur: 0.1, peak: 0.12 });
      },
    },
    deafen: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        squelch(ctx, r, at, { dur: 0.05, peak: 0.06 });
        [1000, 700, 500].forEach((f, i) => beep(ctx, r, at, { t: 0.06 + i * 0.09, f, dur: i === 2 ? 0.16 : 0.08, peak: 0.12 }));
      },
    },
    undeafen: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        squelch(ctx, r, at, { dur: 0.05, peak: 0.06 });
        [500, 700, 1000].forEach((f, i) => beep(ctx, r, at, { t: 0.06 + i * 0.09, f, dur: i === 2 ? 0.16 : 0.08, peak: 0.12 }));
      },
    },
    // A data burst climbing, then a beep: someone's on the channel...
    userJoin: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        data(ctx, r, at, { tones: [1200, 1800], steps: 12, step: 0.01, peak: 0.06, drift: 0.4 });
        beep(ctx, r, at, { t: 0.14, f: 1400, dur: 0.09, peak: 0.12 });
      },
    },
    // ...or the burst falling: they've dropped off.
    userLeave: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        data(ctx, r, at, { tones: [1200, 1800], steps: 12, step: 0.01, peak: 0.06, drift: -0.4 });
        beep(ctx, r, at, { t: 0.14, f: 700, dur: 0.09, peak: 0.12 });
      },
    },
    // Static, cut dead, and a low tone.
    disconnect: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        squelch(ctx, r, at, { dur: 0.25, peak: 0.08 });
        beep(ctx, r, at, { t: 0.27, f: 400, dur: 0.22, peak: 0.13 });
      },
    },
    // The classic key-down click and key-up "pssht".
    pttOn: {
      room: 0.03,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        tick(ctx, r, at, { freq: 1800, peak: 0.1 });
        squelch(ctx, r, at, { t: 0.004, dur: 0.02, peak: 0.04 });
      },
    },
    pttOff: { room: 0.03, play: (ctx, out, at) => squelch(ctx, radio(ctx, out), at, { dur: 0.09, peak: 0.05 }) },
    cameraOn: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        tick(ctx, r, at, { freq: 1500, peak: 0.1, q: 3 });
        beep(ctx, r, at, { t: 0.02, f: 900, dur: 0.05, peak: 0.09 });
        beep(ctx, r, at, { t: 0.08, f: 1300, dur: 0.07, peak: 0.09 });
      },
    },
    cameraOff: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        tick(ctx, r, at, { freq: 1500, peak: 0.1, q: 3 });
        beep(ctx, r, at, { t: 0.02, f: 1300, dur: 0.05, peak: 0.09 });
        beep(ctx, r, at, { t: 0.08, f: 900, dur: 0.07, peak: 0.09 });
      },
    },
    shareStart: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        [800, 1000, 1200].forEach((f, i) => beep(ctx, r, at, { t: i * 0.07, f, dur: 0.06, peak: 0.11 }));
        data(ctx, r, at, { t: 0.22, tones: [1200, 2200], steps: 16, step: 0.01, peak: 0.05 });
      },
    },
    shareStop: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        [1200, 1000, 800].forEach((f, i) => beep(ctx, r, at, { t: i * 0.07, f, dur: 0.06, peak: 0.11 }));
        squelch(ctx, r, at, { t: 0.22, dur: 0.06, peak: 0.05 });
      },
    },
    callAnswer: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        squelch(ctx, r, at, { dur: 0.05, peak: 0.06 });
        beep(ctx, r, at, { t: 0.06, f: 900, dur: 0.08, peak: 0.11 });
        beep(ctx, r, at, { t: 0.15, f: 1400, dur: 0.25, peak: 0.12 });
      },
    },
    callEnd: {
      room: 0.04,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        beep(ctx, r, at, { f: 1400, dur: 0.08, peak: 0.11 });
        beep(ctx, r, at, { t: 0.09, f: 900, dur: 0.14, peak: 0.12 });
        squelch(ctx, r, at, { t: 0.24, dur: 0.1, peak: 0.05 });
      },
    },
  },
  rings: {
    ringOut: {
      room: 0.04,
      period: 3500,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        tone(ctx, r, at, { f: 440, dur: 1.1, peak: 0.1, attack: 0.02 });
        tone(ctx, r, at, { f: 480, dur: 1.1, peak: 0.1, attack: 0.02 });
      },
    },
    // An intercom trill, twice.
    ringIn: {
      room: 0.04,
      period: 2600,
      play: (ctx, out, at) => {
        const r = radio(ctx, out);
        for (const group of [0, 0.55]) {
          for (let i = 0; i < 8; i++) beep(ctx, r, at, { t: group + i * 0.05, f: i % 2 ? 1400 : 1000, dur: 0.05, peak: 0.1 });
        }
      },
    },
  },
};

/* Which theme gets which set ----------------------------------------------- */

export const THEME_SETS = {
  vampire,
  "dark-academia": darkAcademia,
  matrix,
  cyberpunk,
  retro,
  "star-wars": starWars,
  minecraft,
  zombie,
  winamp,
  teamspeak,
} satisfies Record<string, SoundSet>;

export type ThemeSetName = keyof typeof THEME_SETS;

/** Themes that share a set with another name. */
const ALIASES: Record<string, ThemeSetName> = { msn: "retro", "msn-dark": "retro", legacy: "retro" };

/**
 * Faders per set, measured: each cue was rendered at level 1 and set to the
 * loudness of the matching standard sound, so changing theme never changes
 * how loud a sound is.
 */
const MIX: Record<ThemeSetName, Partial<Record<VoiceSoundId, number>>> = {
  vampire: { deafen: 1.16, undeafen: 3.32, mute: 0.72, unmute: 1.21, userJoin: 1.17, userLeave: 1.11, disconnect: 0.65, pttOn: 3.91, pttOff: 4.33, cameraOn: 1.57, cameraOff: 1.69, shareStart: 1.08, shareStop: 0.94, callAnswer: 1.24, callEnd: 1.1, ringOut: 0.72, ringIn: 1.02 },
  "dark-academia": { deafen: 1.3, undeafen: 1.38, mute: 0.82, unmute: 2.75, userJoin: 1.95, userLeave: 1.2, disconnect: 0.82, pttOn: 1.15, pttOff: 1.13, cameraOn: 3.3, cameraOff: 3.63, shareStart: 2.22, shareStop: 1.78, callAnswer: 2.15, callEnd: 1.29, ringOut: 1.27, ringIn: 1.24 },
  matrix: { deafen: 0.99, undeafen: 1.94, mute: 2.06, unmute: 1.91, userJoin: 1.18, userLeave: 1.21, disconnect: 2.19, pttOn: 9.33, pttOff: 9.14, cameraOn: 2.63, cameraOff: 3.17, shareStart: 3.03, shareStop: 5.41, callAnswer: 0.92, callEnd: 4.73, ringOut: 5.68, ringIn: 0.62 },
  cyberpunk: { deafen: 0.47, undeafen: 0.52, mute: 0.45, unmute: 0.5, userJoin: 0.39, userLeave: 0.34, disconnect: 0.32, pttOn: 9.32, pttOff: 9.26, cameraOn: 6.4, cameraOff: 5.61, shareStart: 0.4, shareStop: 0.36, callAnswer: 0.42, callEnd: 0.54, ringOut: 0.28, ringIn: 0.36 },
  retro: { deafen: 1.2, undeafen: 1.3, mute: 1.19, unmute: 1.19, userJoin: 1.28, userLeave: 1.19, disconnect: 1.38, pttOn: 1.82, pttOff: 1.81, cameraOn: 1.47, cameraOff: 1.63, shareStart: 1.33, shareStop: 1.27, callAnswer: 1.47, callEnd: 1.4, ringOut: 0.71, ringIn: 1.62 },
  "star-wars": { deafen: 0.85, undeafen: 1.93, mute: 0.89, unmute: 0.73, userJoin: 0.98, userLeave: 0.85, disconnect: 1.44, pttOn: 1.23, pttOff: 1.23, cameraOn: 2.4, cameraOff: 4.42, shareStart: 0.86, shareStop: 1.1, callAnswer: 1.24, callEnd: 1.72, ringOut: 1.32, ringIn: 1.24 },
  minecraft: { deafen: 2.65, undeafen: 2.12, mute: 1.47, unmute: 2.61, userJoin: 3.29, userLeave: 2.52, disconnect: 1, pttOn: 0.87, pttOff: 0.85, cameraOn: 3.93, cameraOff: 4.43, shareStart: 1.57, shareStop: 1.63, callAnswer: 2.09, callEnd: 0.99, ringOut: 2.4, ringIn: 2.16 },
  zombie: { deafen: 1.81, undeafen: 2.34, mute: 0.86, unmute: 1.1, userJoin: 3.26, userLeave: 2.97, disconnect: 0.65, pttOn: 4.8, pttOff: 1.59, cameraOn: 2.12, cameraOff: 2.49, shareStart: 1.6, shareStop: 1.49, callAnswer: 0.6, callEnd: 0.85, ringOut: 0.74, ringIn: 1.32 },
  winamp: { deafen: 1.02, undeafen: 1.07, mute: 0.92, unmute: 0.88, userJoin: 1.31, userLeave: 1.25, disconnect: 1.15, pttOn: 1.21, pttOff: 1.17, cameraOn: 4.16, cameraOff: 4.49, shareStart: 1.25, shareStop: 1.25, callAnswer: 1.67, callEnd: 1.96, ringOut: 3.75, ringIn: 1.4 },
  teamspeak: { deafen: 0.56, undeafen: 0.6, mute: 0.53, unmute: 0.5, userJoin: 0.5, userLeave: 0.46, disconnect: 0.51, pttOn: 8.42, pttOff: 1.58, cameraOn: 0.54, cameraOff: 0.59, shareStart: 0.59, shareStop: 0.5, callAnswer: 0.46, callEnd: 0.57, ringOut: 0.52, ringIn: 0.59 },
};

function activeSetName(): ThemeSetName | null {
  if (typeof document === "undefined") return null;
  const root = document.documentElement;
  const customId = root.dataset.customThemeId || "";
  if (customId in THEME_SETS) return customId as ThemeSetName;
  if (ALIASES[customId]) return ALIASES[customId];
  if (root.dataset.theme === "legacy") return "retro";
  try {
    if (window.localStorage.getItem("huddle_retro_sounds") === "1") return "retro";
  } catch {
    // ignore
  }
  return null;
}

const faded = <T extends Cue>(name: ThemeSetName, id: VoiceSoundId, sound: T): T => ({
  ...sound,
  level: (sound.level ?? 1) * (MIX[name][id] ?? 1),
});

/** A set's version of a sound, with its fader applied. */
export function themeSound(name: ThemeSetName, id: VoiceSoundId): Cue {
  const set = THEME_SETS[name];
  return faded(name, id, id === "ringOut" || id === "ringIn" ? set.rings[id] : set.cues[id]);
}

/** The current theme's version of a cue, or null when the theme has no sound set. */
export function themedCue(id: CueId): Cue | null {
  const name = activeSetName();
  return name ? faded(name, id, THEME_SETS[name].cues[id]) : null;
}

/** The current theme's ringtone, or null for the standard one. */
export function themedRing(id: RingId): Ring | null {
  const name = activeSetName();
  return name ? faded(name, id, THEME_SETS[name].rings[id]) : null;
}
