/**
 * Theme-flavoured versions of the cues in `audio-cues.ts`: mute, deafen, screen
 * share and the call tones, re-voiced for themes with a strong character.
 * Everything is synthesized, so there is nothing to download and nothing to
 * fail to load.
 *
 * `audio-cues.ts` asks here first; a theme with no sound set (or a cue a set
 * leaves out) falls through to the standard sounds. MSN has its own sound
 * system and never reaches this file.
 */

export type CueName =
  | "mute"
  | "unmute"
  | "deafen"
  | "undeafen"
  | "shareStart"
  | "shareStop"
  | "callAnswer"
  | "callEnd";

export type LoopName = "calling" | "incoming";

type Player = (ctx: AudioContext, out: GainNode, now: number) => void;

interface SoundSet {
  cues: Partial<Record<CueName, Player>>;
  loops: Partial<Record<LoopName, { period: number; burst: Player }>>;
}

/* Building blocks ---------------------------------------------------------- */

function envelope(ctx: AudioContext, out: AudioNode, start: number, peak: number, attack: number, decay: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  gain.connect(out);
  return gain;
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  { freq, start, dur, type = "sine", peak = 0.15, attack = 0.005, to }: {
    freq: number; start: number; dur: number; type?: OscillatorType; peak?: number; attack?: number; to?: number;
  },
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  osc.connect(envelope(ctx, out, start, peak, attack, dur));
  osc.start(start);
  osc.stop(start + attack + dur + 0.05);
}

/** A struck bell: inharmonic partials with long, staggered decays. */
function bell(ctx: AudioContext, out: AudioNode, freq: number, start: number, dur: number, peak = 0.12): void {
  const partials: Array<[number, number, number]> = [
    [0.5, 0.6, 1.0], // hum
    [1, 1, 0.9],
    [1.19, 0.5, 0.6], // minor third: the "tolling" colour
    [1.5, 0.35, 0.5],
    [2, 0.4, 0.45],
    [2.74, 0.2, 0.3],
  ];
  for (const [ratio, level, life] of partials) {
    tone(ctx, out, { freq: freq * ratio, start, dur: dur * life, peak: peak * level, attack: 0.003 });
  }
}

/** Pipe organ: stacked octaves through a soft low-pass, slow attack. */
function organ(ctx: AudioContext, out: AudioNode, freq: number, start: number, dur: number, peak = 0.06): void {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  filter.connect(out);
  for (const [ratio, level, type] of [[0.5, 0.7, "sine"], [1, 1, "sawtooth"], [2, 0.35, "square"], [3, 0.15, "sine"]] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * ratio;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak * level, start + 0.04);
    gain.gain.setValueAtTime(peak * level, start + dur * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(filter);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }
}

/** Harpsichord-ish pluck: bright, quick decay. */
function pluck(ctx: AudioContext, out: AudioNode, freq: number, start: number, peak = 0.09): void {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(5200, start);
  filter.frequency.exponentialRampToValueAtTime(900, start + 0.35);
  filter.connect(out);
  tone(ctx, filter, { freq, start, dur: 0.4, type: "sawtooth", peak, attack: 0.002 });
  tone(ctx, filter, { freq: freq * 2.003, start, dur: 0.25, type: "square", peak: peak * 0.25, attack: 0.002 });
}

let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/** Filtered noise with a moving centre: paper, wood, wings. */
function rustle(
  ctx: AudioContext,
  out: AudioNode,
  { start, dur, from, to, q = 1.2, peak = 0.2, type = "bandpass" as BiquadFilterType }: {
    start: number; dur: number; from: number; to: number; q?: number; peak?: number; type?: BiquadFilterType;
  },
): void {
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + dur);
  source.connect(filter).connect(envelope(ctx, out, start, peak, Math.min(0.02, dur / 4), dur));
  source.start(start, Math.random() * 0.5);
  source.stop(start + dur + 0.05);
}

/** A soft, wooden impact. */
function thud(ctx: AudioContext, out: AudioNode, start: number, freq = 90, peak = 0.35): void {
  tone(ctx, out, { freq, to: freq * 0.55, start, dur: 0.18, peak, attack: 0.002 });
  rustle(ctx, out, { start, dur: 0.06, from: 900, to: 300, peak: peak * 0.5, type: "lowpass" });
}

const note = (name: string): number => {
  const table: Record<string, number> = { C: -9, "C#": -8, D: -7, "D#": -6, E: -5, F: -4, "F#": -3, G: -2, "G#": -1, A: 0, "A#": 1, B: 2 };
  const match = /^([A-G]#?)(\d)$/.exec(name)!;
  return 440 * Math.pow(2, (table[match[1]] + (Number(match[2]) - 4) * 12) / 12);
};

/* Vampire: a crypt, an organ loft, a bell tower --------------------------- */

const vampire: SoundSet = {
  cues: {
    // The coffin lid comes down.
    mute: (ctx, out, now) => {
      rustle(ctx, out, { start: now, dur: 0.16, from: 1800, to: 500, q: 6, peak: 0.08 });
      thud(ctx, out, now + 0.14, 70, 0.4);
      organ(ctx, out, note("D3"), now + 0.14, 0.4, 0.035);
    },
    // ...and creaks open again, with a thin, rising theremin-like whine.
    unmute: (ctx, out, now) => {
      rustle(ctx, out, { start: now, dur: 0.32, from: 500, to: 2200, q: 9, peak: 0.22 });
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(note("A4"), now + 0.05);
      osc.frequency.exponentialRampToValueAtTime(note("D5"), now + 0.4);
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 6;
      const depth = ctx.createGain();
      depth.gain.value = 12;
      vibrato.connect(depth).connect(osc.frequency);
      osc.connect(envelope(ctx, out, now + 0.05, 0.12, 0.08, 0.4));
      vibrato.start(now);
      osc.start(now + 0.05);
      vibrato.stop(now + 0.6);
      osc.stop(now + 0.6);
    },
    // A single toll from the bell tower.
    deafen: (ctx, out, now) => bell(ctx, out, note("D3"), now, 1.4, 0.13),
    // Bats scatter: quick bursts of wings and a high chirp.
    undeafen: (ctx, out, now) => {
      for (let i = 0; i < 7; i++) {
        rustle(ctx, out, { start: now + i * 0.045, dur: 0.035, from: 3000, to: 1600, q: 2, peak: 0.4 });
      }
      tone(ctx, out, { freq: 5200, to: 7400, start: now + 0.12, dur: 0.05, peak: 0.03 });
      tone(ctx, out, { freq: 6100, to: 4800, start: now + 0.2, dur: 0.05, peak: 0.025 });
    },
    shareStart: (ctx, out, now) => {
      ["D4", "F4", "A4", "D5"].forEach((n, i) => organ(ctx, out, note(n), now + i * 0.09, 0.32, 0.04));
    },
    shareStop: (ctx, out, now) => {
      ["D5", "A4", "F4", "D4"].forEach((n, i) => organ(ctx, out, note(n), now + i * 0.09, 0.32, 0.04));
    },
    // A minor chord resolving: you have been let in.
    callAnswer: (ctx, out, now) => {
      ["D3", "A3", "D4", "F4"].forEach((n) => organ(ctx, out, note(n), now, 0.7, 0.03));
    },
    callEnd: (ctx, out, now) => {
      thud(ctx, out, now, 65, 0.4);
      bell(ctx, out, note("A2"), now + 0.05, 1.1, 0.09);
    },
  },
  loops: {
    // Two slow tolls while you wait.
    calling: {
      period: 3600,
      burst: (ctx, out, now) => {
        bell(ctx, out, note("A3"), now, 1.3, 0.1);
        bell(ctx, out, note("F3"), now + 0.9, 1.4, 0.1);
      },
    },
    // The opening of Bach's Toccata and Fugue in D minor.
    incoming: {
      period: 3800,
      burst: (ctx, out, now) => {
        const motif: Array<[string, number, number]> = [
          ["A5", 0, 0.12], ["G5", 0.12, 0.1], ["A5", 0.22, 0.55],
          ["G5", 0.95, 0.08], ["F5", 1.03, 0.08], ["E5", 1.11, 0.08], ["D5", 1.19, 0.08],
          ["C#5", 1.27, 0.4], ["D5", 1.72, 0.9],
        ];
        for (const [n, t, d] of motif) {
          organ(ctx, out, note(n), now + t, d, 0.045);
          organ(ctx, out, note(n) / 2, now + t, d, 0.03);
        }
      },
    },
  },
};

/* Dark Academia: a library, a harpsichord, a grandfather clock ------------ */

const darkAcademia: SoundSet = {
  cues: {
    // A heavy book shut.
    mute: (ctx, out, now) => {
      rustle(ctx, out, { start: now, dur: 0.09, from: 2500, to: 800, peak: 0.07 });
      thud(ctx, out, now + 0.07, 110, 0.3);
    },
    // A page turned.
    unmute: (ctx, out, now) => {
      rustle(ctx, out, { start: now, dur: 0.22, from: 1200, to: 5200, q: 0.9, peak: 0.42 });
      rustle(ctx, out, { start: now + 0.16, dur: 0.08, from: 4000, to: 2500, q: 1.5, peak: 0.2 });
    },
    // The grandfather clock, low.
    deafen: (ctx, out, now) => {
      bell(ctx, out, note("E4"), now, 1.0, 0.09);
      bell(ctx, out, note("B3"), now + 0.38, 1.2, 0.09);
    },
    undeafen: (ctx, out, now) => {
      bell(ctx, out, note("B3"), now, 0.9, 0.08);
      bell(ctx, out, note("E4"), now + 0.3, 1.1, 0.09);
    },
    // A harpsichord flourish.
    shareStart: (ctx, out, now) => {
      ["G4", "B4", "D5", "G5"].forEach((n, i) => pluck(ctx, out, note(n), now + i * 0.07));
    },
    shareStop: (ctx, out, now) => {
      ["G5", "D5", "B4", "G4"].forEach((n, i) => pluck(ctx, out, note(n), now + i * 0.07));
    },
    callAnswer: (ctx, out, now) => {
      ["C5", "E5", "G5"].forEach((n) => pluck(ctx, out, note(n), now, 0.1));
      pluck(ctx, out, note("C6"), now + 0.12, 0.06);
    },
    callEnd: (ctx, out, now) => {
      rustle(ctx, out, { start: now, dur: 0.07, from: 2500, to: 800, peak: 0.06 });
      thud(ctx, out, now + 0.05, 100, 0.28);
    },
  },
  loops: {
    // A pendulum ticking, then one soft strike.
    calling: {
      period: 3200,
      burst: (ctx, out, now) => {
        for (let i = 0; i < 4; i++) {
          rustle(ctx, out, { start: now + i * 0.5, dur: 0.025, from: i % 2 ? 2600 : 3400, to: 1800, q: 8, peak: 0.35 });
        }
        bell(ctx, out, note("G4"), now + 2.05, 0.9, 0.06);
      },
    },
    // The Westminster Quarters.
    incoming: {
      period: 4200,
      burst: (ctx, out, now) => {
        ["E5", "G#5", "F#5", "B4", "E5", "F#5", "G#5", "E5"].forEach((n, i) =>
          bell(ctx, out, note(n), now + i * 0.42 + (i >= 4 ? 0.3 : 0), 1.0, 0.075),
        );
      },
    },
  },
};

const SETS: Record<string, SoundSet> = {
  vampire,
  "dark-academia": darkAcademia,
};

function activeSet(): SoundSet | null {
  if (typeof document === "undefined") return null;
  return SETS[document.documentElement.dataset.customThemeId || ""] || null;
}

/** Plays the themed version of a cue. Returns false when the theme has none. */
export function playThemedCue(ctx: AudioContext, name: CueName): boolean {
  const player = activeSet()?.cues[name];
  if (!player) return false;
  try {
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(ctx.destination);
    player(ctx, out, ctx.currentTime + 0.01);
  } catch {
    // A failed cue is silent, never an error.
  }
  return true;
}

/** The themed version of a looping tone, or null for the standard one. */
export function themedLoop(name: LoopName): { period: number; burst: (ctx: AudioContext) => GainNode | null } | null {
  const loop = activeSet()?.loops[name];
  if (!loop) return null;
  return {
    period: loop.period,
    burst: (ctx) => {
      try {
        const out = ctx.createGain();
        out.connect(ctx.destination);
        loop.burst(ctx, out, ctx.currentTime + 0.01);
        return out;
      } catch {
        return null;
      }
    },
  };
}
