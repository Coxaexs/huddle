/**
 * The standard voice sounds, designed as one family instead of loose beeps.
 *
 * Every cue is played on the same instrument, the soft FM mallet in
 * `cue-kit.ts`, and all of them sit in D major pentatonic, so any two that
 * overlap (someone joins while you unmute) still agree.
 *
 * Opposites mirror each other: turning something on rises and opens up the
 * filter, turning it off falls and closes it. Frequent cues (mute, joins, push
 * to talk) stay short and soft; rare ones (streams, calls) get more room.
 */

import { strike, sweep, thump, tick, whoosh, type SoundSet } from "./cue-kit";

/* Notes: D major pentatonic ------------------------------------------------ */

const D4 = 293.66;
const F4s = 369.99;
const A4 = 440;
const D5 = 587.33;
const E5 = 659.25;
const F5s = 739.99;
const A5 = 880;
const B5 = 987.77;
const D6 = 1174.66;

/* The cues ----------------------------------------------------------------- */

const cues: SoundSet["cues"] = {
  // A round "bwop" that drops a fifth while the filter closes.
  mute: {
    level: 1.45,
    room: 0.12,
    play: (ctx, out, at) => {
      const lp = sweep(ctx, out, at, { from: 5200, to: 1500, time: 0.16 });
      tick(ctx, out, at, { freq: 2600, peak: 0.035 });
      strike(ctx, lp, at, { f: E5, from: B5, glide: 0.022, t: 0, dur: 0.22, peak: 0.24, bright: 0.7, shine: 0.06 });
    },
  },
  // The same drop in reverse: a droplet "bwip" that opens up.
  unmute: {
    level: 1.45,
    room: 0.12,
    play: (ctx, out, at) => {
      const lp = sweep(ctx, out, at, { from: 1800, to: 6500, time: 0.14 });
      tick(ctx, out, at, { freq: 3400, peak: 0.035 });
      strike(ctx, lp, at, { f: B5, from: E5, glide: 0.022, t: 0, dur: 0.24, peak: 0.22, bright: 0.8, shine: 0.1 });
    },
  },
  // Two notes falling as if your ears were being covered.
  deafen: {
    room: 0.16,
    play: (ctx, out, at) => {
      const lp = sweep(ctx, out, at, { from: 4200, to: 650, time: 0.38 });
      strike(ctx, lp, at, { f: D5, t: 0, dur: 0.3, peak: 0.22, body: 0.25 });
      strike(ctx, lp, at, { f: A4, t: 0.085, dur: 0.45, peak: 0.24, body: 0.35, drop: 0.5 });
    },
  },
  // ...and uncovered: the same two notes rising, the filter opening.
  undeafen: {
    room: 0.16,
    play: (ctx, out, at) => {
      const lp = sweep(ctx, out, at, { from: 900, to: 6000, time: 0.3 });
      strike(ctx, lp, at, { f: A4, t: 0, dur: 0.3, peak: 0.22, body: 0.25 });
      strike(ctx, lp, at, { f: D5, t: 0.085, dur: 0.45, peak: 0.24, body: 0.2, shine: 0.14 });
    },
  },
  // Up a fifth, bright and a little airy: someone's here.
  userJoin: {
    level: 1.1,
    room: 0.26,
    play: (ctx, out, at) => {
      strike(ctx, out, at, { f: D5, t: 0, dur: 0.25, peak: 0.16, bright: 1.1 });
      strike(ctx, out, at, { f: A5, t: 0.075, dur: 0.5, peak: 0.19, bright: 1.2, shine: 0.16 });
    },
  },
  // Down the same fifth, darker: they've gone.
  userLeave: {
    room: 0.22,
    play: (ctx, out, at) => {
      const lp = sweep(ctx, out, at, { from: 3800, to: 1800, time: 0.3 });
      strike(ctx, lp, at, { f: A5, t: 0, dur: 0.22, peak: 0.15 });
      strike(ctx, lp, at, { f: D5, t: 0.075, dur: 0.42, peak: 0.18, body: 0.15 });
    },
  },
  // Three steps down to a felt thump: you're out.
  disconnect: {
    level: 0.85,
    room: 0.2,
    play: (ctx, out, at) => {
      const lp = sweep(ctx, out, at, { from: 4500, to: 900, time: 0.45 });
      strike(ctx, lp, at, { f: F5s, t: 0, dur: 0.2, peak: 0.16 });
      strike(ctx, lp, at, { f: D5, t: 0.075, dur: 0.24, peak: 0.17 });
      strike(ctx, lp, at, { f: A4, t: 0.15, dur: 0.55, peak: 0.2, body: 0.4, drop: 0.7 });
      thump(ctx, out, at, { t: 0.15, peak: 0.22 });
    },
  },
  // Push to talk fires on every key press, so these are barely-there ticks.
  pttOn: {
    level: 1.3,
    room: 0.06,
    play: (ctx, out, at) => {
      tick(ctx, out, at, { freq: 3800, peak: 0.05 });
      strike(ctx, out, at, { f: A5, t: 0.004, dur: 0.08, peak: 0.1, bright: 0.6, shine: 0.05 });
    },
  },
  pttOff: {
    level: 1.4,
    room: 0.06,
    play: (ctx, out, at) => {
      tick(ctx, out, at, { freq: 2400, peak: 0.045 });
      strike(ctx, out, at, { f: E5, t: 0.004, dur: 0.08, peak: 0.09, bright: 0.4, shine: 0 });
    },
  },
  // A shutter's two clicks, then a short rise.
  cameraOn: {
    room: 0.14,
    play: (ctx, out, at) => {
      tick(ctx, out, at, { freq: 2200, peak: 0.05 });
      tick(ctx, out, at, { t: 0.028, freq: 4600, peak: 0.04 });
      strike(ctx, out, at, { f: E5, t: 0.03, dur: 0.16, peak: 0.13 });
      strike(ctx, out, at, { f: B5, t: 0.085, dur: 0.3, peak: 0.15, shine: 0.14 });
    },
  },
  cameraOff: {
    room: 0.14,
    play: (ctx, out, at) => {
      const lp = sweep(ctx, out, at, { from: 4200, to: 1800, time: 0.25 });
      tick(ctx, out, at, { freq: 4600, peak: 0.04 });
      tick(ctx, out, at, { t: 0.028, freq: 2200, peak: 0.05 });
      strike(ctx, lp, at, { f: B5, t: 0.03, dur: 0.16, peak: 0.13 });
      strike(ctx, lp, at, { f: E5, t: 0.085, dur: 0.3, peak: 0.15 });
    },
  },
  // Going live: air rushing up under a rising arpeggio that rings out.
  shareStart: {
    room: 0.3,
    play: (ctx, out, at) => {
      whoosh(ctx, out, at, { from: 500, to: 5000, dur: 0.24, peak: 0.05 });
      [D5, F5s, A5].forEach((f, i) => strike(ctx, out, at, { f, t: 0.05 + i * 0.055, dur: 0.22, peak: 0.13 }));
      strike(ctx, out, at, { f: D6, t: 0.215, dur: 0.7, peak: 0.16, bright: 1.2, shine: 0.18 });
    },
  },
  // The stream winds down: a wider fall, quieter, closing.
  shareStop: {
    room: 0.24,
    play: (ctx, out, at) => {
      const lp = sweep(ctx, out, at, { from: 5000, to: 1200, time: 0.4 });
      whoosh(ctx, out, at, { from: 3500, to: 600, dur: 0.2, peak: 0.03 });
      strike(ctx, lp, at, { f: D6, t: 0, dur: 0.2, peak: 0.12 });
      strike(ctx, lp, at, { f: A5, t: 0.065, dur: 0.22, peak: 0.13 });
      strike(ctx, lp, at, { f: D5, t: 0.13, dur: 0.5, peak: 0.16, body: 0.2 });
    },
  },
  // Connected: a warm chord strummed open, the top note last.
  callAnswer: {
    level: 1.2,
    room: 0.3,
    play: (ctx, out, at) => {
      [D5, F5s, A5].forEach((f, i) => strike(ctx, out, at, { f, t: i * 0.03, dur: 0.6, peak: 0.1, body: i === 0 ? 0.3 : 0 }));
      strike(ctx, out, at, { f: D6, t: 0.12, dur: 0.75, peak: 0.13, bright: 1.2, shine: 0.16 });
    },
  },
  // Hung up: an open fifth drops a fourth and closes.
  callEnd: {
    level: 1.2,
    room: 0.18,
    play: (ctx, out, at) => {
      const lp = sweep(ctx, out, at, { from: 4000, to: 800, time: 0.4 });
      strike(ctx, lp, at, { f: D5, t: 0, dur: 0.22, peak: 0.12 });
      strike(ctx, lp, at, { f: A4, t: 0, dur: 0.22, peak: 0.1 });
      strike(ctx, lp, at, { f: A4, t: 0.12, dur: 0.45, peak: 0.13, drop: 0.6 });
      strike(ctx, lp, at, { f: D4, t: 0.12, dur: 0.5, peak: 0.13, body: 0.35, drop: 0.6 });
    },
  },
};

/** A bell trill: two notes struck back and forth, like an old phone's clapper. */
function trill(ctx: BaseAudioContext, out: AudioNode, start: number, low: number, high: number, strikes: number, peak: number): void {
  for (let i = 0; i < strikes; i++) {
    const fade = 1 - (i / strikes) * 0.35;
    strike(ctx, out, start, { f: i % 2 ? high : low, t: i * 0.055, dur: 0.18, peak: peak * fade, bright: 0.8, shine: 0.05, drop: 0.2 });
  }
}

const rings: SoundSet["rings"] = {
  // While you wait: a soft double "ring-ring", calm enough to sit through.
  ringOut: {
    level: 1.4,
    room: 0.2,
    period: 3200,
    play: (ctx, out, at) => {
      trill(ctx, out, at, D5, F5s, 7, 0.09);
      trill(ctx, out, at + 0.6, D5, F5s, 7, 0.09);
    },
  },
  // Someone's calling you: a phrase that climbs and answers itself.
  ringIn: {
    level: 1.2,
    room: 0.28,
    period: 2600,
    play: (ctx, out, at) => {
      [D5, F5s, A5].forEach((f, i) => strike(ctx, out, at, { f, t: i * 0.11, dur: 0.3, peak: 0.13 }));
      strike(ctx, out, at, { f: D6, t: 0.33, dur: 0.55, peak: 0.15, bright: 1.2, shine: 0.16 });
      strike(ctx, out, at, { f: B5, t: 0.66, dur: 0.25, peak: 0.12 });
      strike(ctx, out, at, { f: D6, t: 0.77, dur: 0.6, peak: 0.14, shine: 0.14 });
      strike(ctx, out, at, { f: F4s, t: 0.77, dur: 0.6, peak: 0.07, body: 0.2 });
    },
  },
};

export const STANDARD: SoundSet = { cues, rings };
