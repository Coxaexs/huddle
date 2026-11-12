/**
 * Hoffle Study Hall, the shared half: an endless lofi backdrop (rain, vinyl
 * crackle, Rhodes chords) that everyone in a voice room hears the same way.
 *
 * No audio is sent anywhere. The room shares five numbers (the activity
 * state), and every bar of music is a pure function of them: the same seed
 * and bar number give the same notes on every device. Each browser works out
 * which bar the room is in from the shared clock and synthesises it itself.
 */

export const AMBIENT_BPM_MIN = 60;
export const AMBIENT_BPM_MAX = 90;
export const AMBIENT_BPM_DEFAULT = 74;
export const AMBIENT_BEATS = 4;
/** The chords change every bar and the progression every this many bars. */
export const AMBIENT_SECTION_BARS = 16;
export const AMBIENT_CHORD_INDEX_MAX = 1_000_000;

export const AMBIENT_INTENSITIES = ["calm", "rainy", "focus"] as const;
export type AmbientIntensity = (typeof AMBIENT_INTENSITIES)[number];

export interface AmbientState {
  /** Integer seed for the deterministic generator. */
  seed: number;
  /** Epoch ms (on the server's clock) when bar 0 started. */
  startedAt: number;
  intensity: AmbientIntensity;
  bpm: number;
  /** How many chords the room has skipped ahead: bar 0 plays this chord. */
  chordIndex: number;
}

export type AmbientVoice = "keys" | "bass" | "kick" | "snare" | "hat" | "crackle";

export interface AmbientEvent {
  voice: AmbientVoice;
  /** Where in the bar it starts, in beats from 0 up to 4. */
  beat: number;
  /** MIDI note; 0 for the voices that have no pitch. */
  midi: number;
  /** 0 to 1. */
  velocity: number;
  /** How long it is held, in beats. */
  beats: number;
}

export interface AmbientChord {
  /** "Dm9", "G9", "Cmaj9". */
  name: string;
  /** MIDI note of the root, from C3 to B3. */
  root: number;
  /** MIDI notes of the voicing, low to high. */
  notes: number[];
}

export interface AmbientBar {
  bar: number;
  chord: AmbientChord;
  events: AmbientEvent[];
}

/* ------------------------------------------------------------------ */
/* Randomness                                                          */
/* ------------------------------------------------------------------ */

/** A small, fast seeded generator: the same seed gives the same numbers everywhere. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Folds numbers into one 32-bit seed, so each bar and each layer gets its own
 * stream and a client can jump straight to bar 9000 without playing the rest.
 */
export function mixSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    h = Math.imul(h ^ (part | 0), 0x01000193);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

/** Whatever is stored or sent, as a complete, in-range state. */
export function ambientState(
  input: Record<string, unknown> | null | undefined,
  now: number = Date.now(),
): AmbientState {
  const seed = Number(input?.seed);
  const startedAt = Number(input?.startedAt);
  const bpm = Number(input?.bpm);
  const chordIndex = Number(input?.chordIndex);
  return {
    seed: Number.isFinite(seed) ? Math.floor(Math.abs(seed)) % 4294967296 : 1,
    startedAt: Number.isFinite(startedAt) && startedAt > 0 ? Math.round(startedAt) : Math.round(now),
    intensity: AMBIENT_INTENSITIES.includes(input?.intensity as AmbientIntensity)
      ? (input?.intensity as AmbientIntensity)
      : "rainy",
    bpm: Number.isFinite(bpm)
      ? Math.round(Math.max(AMBIENT_BPM_MIN, Math.min(AMBIENT_BPM_MAX, bpm)))
      : AMBIENT_BPM_DEFAULT,
    chordIndex: Number.isFinite(chordIndex)
      ? Math.max(0, Math.min(AMBIENT_CHORD_INDEX_MAX, Math.floor(chordIndex)))
      : 0,
  };
}

/** A new session. `random` is injectable for tests. */
export function starterAmbientState(now: number = Date.now(), random: () => number = Math.random): AmbientState {
  return ambientState({ seed: Math.floor(random() * 4294967296), startedAt: now }, now);
}

export function ambientBarMs(state: AmbientState): number {
  return (60_000 / state.bpm) * AMBIENT_BEATS;
}

/** Epoch ms at which a bar starts. */
export function ambientBarStart(state: AmbientState, bar: number): number {
  return state.startedAt + bar * ambientBarMs(state);
}

/** Which bar the room is in at `now`, and how many beats into it. */
export function ambientPosition(state: AmbientState, now: number): { bar: number; beat: number } {
  const bars = (now - state.startedAt) / ambientBarMs(state);
  const bar = Math.floor(bars);
  return { bar, beat: (bars - bar) * AMBIENT_BEATS };
}

/**
 * A tempo change that keeps the room's place: the start time moves so the
 * bar and beat everyone is in stay where they were.
 */
export function retimeAmbient(state: AmbientState, bpm: number, now: number): AmbientState {
  const bars = (now - state.startedAt) / ambientBarMs(state);
  const next = ambientState({ ...state, bpm }, now);
  return { ...next, startedAt: Math.round(now - bars * ambientBarMs(next)) };
}

/* ------------------------------------------------------------------ */
/* Harmony                                                             */
/* ------------------------------------------------------------------ */

type Quality = "maj9" | "min9" | "min7" | "dom9";

/** Voicings as semitones above the root. */
const VOICINGS: Record<Quality, number[]> = {
  maj9: [0, 4, 7, 11, 14],
  min9: [0, 3, 7, 10, 14],
  min7: [0, 3, 7, 10],
  dom9: [0, 4, 10, 14],
};
const SUFFIX: Record<Quality, string> = { maj9: "maj9", min9: "m9", min7: "m7", dom9: "9" };

/** Four-bar loops as [semitones above the key, quality]. */
const PROGRESSIONS: Array<Array<[number, Quality]>> = [
  [[2, "min9"], [7, "dom9"], [0, "maj9"], [9, "min9"]],
  [[0, "maj9"], [9, "min9"], [5, "maj9"], [7, "dom9"]],
  [[5, "maj9"], [4, "min7"], [2, "min9"], [0, "maj9"]],
  [[9, "min9"], [5, "maj9"], [0, "maj9"], [7, "dom9"]],
  [[0, "maj9"], [4, "min7"], [5, "maj9"], [5, "min9"]],
  [[2, "min9"], [1, "maj9"], [0, "maj9"], [9, "min9"]],
];

const NOTE_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

function modulo(value: number, by: number): number {
  return ((value % by) + by) % by;
}

/** The chord at a place in the song (bar plus the chords skipped). */
function chordAt(seed: number, place: number): AmbientChord {
  const key = mixSeed(seed, 0x6b6579) % 12;
  const section = Math.floor(place / AMBIENT_SECTION_BARS);
  const progression = PROGRESSIONS[mixSeed(seed, section, 0x70726f67) % PROGRESSIONS.length];
  const [degree, quality] = progression[modulo(place, progression.length)];
  const pitch = (key + degree) % 12;
  const root = 48 + pitch;
  return {
    name: `${NOTE_NAMES[pitch]}${SUFFIX[quality]}`,
    root,
    notes: VOICINGS[quality].map((interval) => root + interval),
  };
}

/** The chord playing in a bar. */
export function ambientChord(state: AmbientState, bar: number): AmbientChord {
  return chordAt(state.seed, bar + state.chordIndex);
}

/* ------------------------------------------------------------------ */
/* The score                                                           */
/* ------------------------------------------------------------------ */

/** Off-beat eighths land late, the lazy swing of a lofi beat. */
const SWING = 0.6;
/** How many of a bar's possible melody notes and crackles each mood keeps. */
const MELODY_DENSITY: Record<AmbientIntensity, number> = { calm: 0.14, rainy: 0.22, focus: 0.32 };
const CRACKLES: Record<AmbientIntensity, number> = { calm: 10, rainy: 6, focus: 8 };
const BASS_LEVEL: Record<AmbientIntensity, number> = { calm: 0.4, rainy: 0.55, focus: 0.7 };

/**
 * Everything one bar plays. Pure: the same state and bar give the same events
 * on every device. Each layer draws from its own stream, and draws the same
 * numbers whatever the mood, so changing the mood adds or removes notes
 * without reshuffling the ones that stay.
 */
export function ambientBar(state: AmbientState, bar: number): AmbientBar {
  const place = bar + state.chordIndex;
  const chord = chordAt(state.seed, place);
  const events: AmbientEvent[] = [];
  const layer = (salt: number) => mulberry32(mixSeed(state.seed, place, salt));

  // Rhodes: the chord rolled from the bottom up, sometimes answered late in the bar.
  const keys = layer(1);
  const openBass = keys() < 0.35;
  chord.notes.forEach((note, index) => {
    const lag = index * (0.04 + keys() * 0.05);
    const velocity = 0.5 + keys() * 0.22 - index * 0.03;
    events.push({
      voice: "keys",
      beat: lag,
      midi: index === 0 && openBass ? note - 12 : note,
      velocity,
      beats: 3.7 - lag,
    });
  });
  const answer = keys();
  const answerBeat = keys() < 0.5 ? 2 + SWING : 3;
  if (answer < 0.45) {
    chord.notes.slice(-3).forEach((note, index) => {
      events.push({
        voice: "keys",
        beat: answerBeat + index * 0.03,
        midi: note,
        velocity: 0.3 + keys() * 0.1,
        beats: AMBIENT_BEATS - answerBeat - 0.1,
      });
    });
  }

  // A sparse melody an octave up, on swung eighths, out of the chord's own notes.
  const melody = layer(2);
  const density = MELODY_DENSITY[state.intensity];
  for (let slot = 1; slot < 8; slot += 1) {
    const keep = melody();
    const pick = melody();
    const push = melody();
    if (keep >= density) continue;
    events.push({
      voice: "keys",
      beat: Math.floor(slot / 2) + (slot % 2 ? SWING : 0),
      midi: chord.notes[Math.floor(pick * chord.notes.length)] + 12,
      velocity: 0.32 + push * 0.2,
      beats: 0.9 + push,
    });
  }

  // Bass: the root, with a pickup into the next bar now and then.
  const bass = layer(3);
  const level = BASS_LEVEL[state.intensity];
  events.push({ voice: "bass", beat: 0, midi: chord.root - 12, velocity: level, beats: 2.6 });
  const pickup = bass();
  if (pickup < 0.4 && state.intensity !== "calm") {
    events.push({ voice: "bass", beat: 3 + SWING, midi: chord.root - 12 + (pickup < 0.2 ? 7 : 0), velocity: level * 0.7, beats: 0.4 });
  }

  // Focus adds a dusty boom-bap: kick, rim on two and four, swung hats.
  const drums = layer(4);
  const lateKick = drums();
  const ghostKick = drums();
  const hats = Array.from({ length: 8 }, () => [drums(), drums()]);
  if (state.intensity === "focus") {
    events.push({ voice: "kick", beat: 0, midi: 0, velocity: 0.9, beats: 0.5 });
    events.push({ voice: "kick", beat: lateKick < 0.6 ? 2 + SWING : 2, midi: 0, velocity: 0.75, beats: 0.5 });
    if (ghostKick < 0.25) events.push({ voice: "kick", beat: 3 + SWING, midi: 0, velocity: 0.5, beats: 0.5 });
    events.push({ voice: "snare", beat: 1, midi: 0, velocity: 0.7, beats: 0.25 });
    events.push({ voice: "snare", beat: 3, midi: 0, velocity: 0.8, beats: 0.25 });
    hats.forEach(([keep, push], slot) => {
      if (keep >= 0.85) return;
      events.push({
        voice: "hat",
        beat: Math.floor(slot / 2) + (slot % 2 ? SWING : 0),
        midi: 0,
        velocity: (slot % 2 ? 0.35 : 0.6) + push * 0.25,
        beats: 0.1,
      });
    });
  }

  // Vinyl: pops scattered through the bar, mostly quiet with the odd loud one.
  const dust = layer(5);
  for (let pop = 0; pop < CRACKLES[state.intensity]; pop += 1) {
    const beat = dust() * AMBIENT_BEATS;
    const loud = dust();
    events.push({ voice: "crackle", beat, midi: 0, velocity: 0.15 + loud ** 3 * 0.85, beats: 0 });
  }

  events.sort((a, b) => a.beat - b.beat);
  return { bar, chord, events };
}
