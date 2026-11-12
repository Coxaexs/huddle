/**
 * Hoffle Beatbox, the shared half: the pattern a voice room edits together.
 *
 * Only the pattern and the knobs are shared (through the room's activity
 * state). Every browser synthesises the sound itself and runs its own
 * transport, so no audio leaves anyone's machine.
 */

export const BEATBOX_STEPS = 16;
export const BEATBOX_BPM_MIN = 80;
export const BEATBOX_BPM_MAX = 160;
export const BEATBOX_BPM_DEFAULT = 128;
/** Bass notes are MIDI numbers in this range; 0 is a rest. */
export const BEATBOX_NOTE_MIN = 36;
export const BEATBOX_NOTE_MAX = 60;
/** Filter cutoff in Hz. */
export const BEATBOX_CUTOFF_MIN = 80;
export const BEATBOX_CUTOFF_MAX = 6000;
export const BEATBOX_RESONANCE_MIN = 1;
export const BEATBOX_RESONANCE_MAX = 18;

export const BEATBOX_DRUMS = ["kick", "snare", "hihat", "openhat", "clap"] as const;
export type BeatboxDrum = (typeof BEATBOX_DRUMS)[number];
export type BeatboxWave = "sawtooth" | "square";

export interface BeatboxPattern {
  kick: boolean[];
  snare: boolean[];
  /** Closed hi-hat. */
  hihat: boolean[];
  /** Open hi-hat; any later hat cuts it off. */
  openhat: boolean[];
  clap: boolean[];
  /** Per step: 0 for a rest, otherwise a MIDI note from 36 to 60. */
  bassNotes: number[];
  /** The step glides in from the note before it instead of retriggering. */
  bassSlides: boolean[];
  bassAccents: boolean[];
}

export interface BeatboxState {
  bpm: number;
  pattern: BeatboxPattern;
  filterCutoff: number;
  filterResonance: number;
  /** How far each note opens the filter above the cutoff, 0 to 1. */
  envMod: number;
  wave: BeatboxWave;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function flags(value: unknown): boolean[] {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: BEATBOX_STEPS }, (_, step) => list[step] === true);
}

function notes(value: unknown): number[] {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: BEATBOX_STEPS }, (_, step) => {
    const note = Math.round(Number(list[step]));
    return note >= BEATBOX_NOTE_MIN && note <= BEATBOX_NOTE_MAX ? note : 0;
  });
}

export function emptyBeatboxPattern(): BeatboxPattern {
  return {
    kick: flags(null),
    snare: flags(null),
    hihat: flags(null),
    openhat: flags(null),
    clap: flags(null),
    bassNotes: notes(null),
    bassSlides: flags(null),
    bassAccents: flags(null),
  };
}

/** Whatever is stored or sent, as a complete, in-range state. */
export function beatboxState(input: Record<string, unknown> | null | undefined): BeatboxState {
  const raw = input?.pattern;
  const pattern = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    bpm: Math.round(clamp(input?.bpm, BEATBOX_BPM_MIN, BEATBOX_BPM_MAX, BEATBOX_BPM_DEFAULT)),
    pattern: {
      kick: flags(pattern.kick),
      snare: flags(pattern.snare),
      hihat: flags(pattern.hihat),
      openhat: flags(pattern.openhat),
      clap: flags(pattern.clap),
      bassNotes: notes(pattern.bassNotes),
      bassSlides: flags(pattern.bassSlides),
      bassAccents: flags(pattern.bassAccents),
    },
    filterCutoff: Math.round(clamp(input?.filterCutoff, BEATBOX_CUTOFF_MIN, BEATBOX_CUTOFF_MAX, 700)),
    filterResonance:
      Math.round(clamp(input?.filterResonance, BEATBOX_RESONANCE_MIN, BEATBOX_RESONANCE_MAX, 11) * 10) / 10,
    envMod: Math.round(clamp(input?.envMod, 0, 1, 0.6) * 100) / 100,
    wave: input?.wave === "square" ? "square" : "sawtooth",
  };
}

function steps(...on: number[]): boolean[] {
  return Array.from({ length: BEATBOX_STEPS }, (_, step) => on.includes(step));
}

/** What a room hears the first time it presses play. */
export function starterBeatboxState(): BeatboxState {
  return beatboxState({
    pattern: {
      kick: steps(0, 4, 8, 12),
      snare: steps(),
      hihat: steps(0, 4, 8, 12, 14),
      openhat: steps(2, 6, 10),
      clap: steps(4, 12),
      bassNotes: [36, 0, 36, 48, 0, 36, 39, 0, 36, 0, 48, 36, 0, 43, 41, 39],
      bassSlides: steps(3, 6, 15),
      bassAccents: steps(3, 10, 13),
    },
  });
}

/** Minor pentatonic with the flat second: the notes acid lines lean on. */
const ACID_SCALE = [0, 0, 0, 1, 3, 5, 7, 10, 12, 12];

/** A new groove that still sounds like one. `random` is injectable for tests. */
export function randomBeatboxPattern(random: () => number = Math.random): BeatboxPattern {
  const chance = (odds: number) => random() < odds;
  const pattern = emptyBeatboxPattern();
  const root = BEATBOX_NOTE_MIN + Math.floor(random() * 8);
  const broken = chance(0.3);
  for (let step = 0; step < BEATBOX_STEPS; step += 1) {
    const beat = step % 4;
    pattern.kick[step] = broken
      ? step === 0 || step === 10 || (beat !== 0 && chance(0.18))
      : beat === 0 || (step > 8 && beat === 3 && chance(0.25));
    pattern.snare[step] = (step === 4 || step === 12) && chance(0.6);
    pattern.clap[step] = (step === 4 || step === 12) && (!pattern.snare[step] || chance(0.4));
    pattern.openhat[step] = beat === 2 && chance(0.7);
    pattern.hihat[step] = !pattern.openhat[step] && chance(beat === 0 ? 0.5 : 0.65);
    if (chance(step === 0 ? 1 : 0.68)) {
      const degree = ACID_SCALE[Math.floor(random() * ACID_SCALE.length)];
      const octave = chance(0.2) ? 12 : 0;
      pattern.bassNotes[step] = Math.min(BEATBOX_NOTE_MAX, root + degree + octave);
      pattern.bassSlides[step] = step > 0 && pattern.bassNotes[step - 1] > 0 && chance(0.28);
      pattern.bassAccents[step] = chance(0.25);
    }
  }
  return pattern;
}

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/** "C2", "F♯3": MIDI 36 is C2. */
export function beatboxNoteName(note: number): string {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}
