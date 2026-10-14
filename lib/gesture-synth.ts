/**
 * Gesture Synth, the shared half: music theory, hand shapes and the wire format.
 *
 * One hand's shape picks a chord in the room's key (☝ is I, ✌ is ii, 🤘 is vi…),
 * the other hand plays a melody by height or opens up the sound. The browser that
 * sees the hands turns them into MIDI notes and sends only those (a SynthPlay)
 * through the hub, so everyone in the voice room synthesises the same chord on
 * their own machine: no camera frame and no audio ever leaves the player.
 */

/** Keys a room can play in, as stored in the activity state. */
export const SYNTH_KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
export type SynthKey = (typeof SYNTH_KEYS)[number];
export type SynthMode = "major" | "minor";

export const SYNTH_SOUNDS = ["warm", "glass", "choir", "pluck", "chip"] as const;
export type SynthSound = (typeof SYNTH_SOUNDS)[number];
export const SOUND_NAMES: Record<SynthSound, string> = {
  warm: "Warm Synth",
  glass: "Glass Keys",
  choir: "Choir Pad",
  pluck: "Pluck",
  chip: "8-bit",
};

/**
 * How a player's chord is played. Every listener renders the rhythm on their
 * own audio clock, on a beat grid shared through the hub's clock, so two
 * people pulsing at the room's tempo land on the same beats.
 */
export const SYNTH_RHYTHMS = ["hold", "pulse", "arp", "updown"] as const;
export type SynthRhythm = (typeof SYNTH_RHYTHMS)[number];
export const RHYTHM_NAMES: Record<SynthRhythm, string> = {
  hold: "Hold",
  pulse: "Pulse (8ths)",
  arp: "Arpeggio",
  updown: "Arp up-down (16ths)",
};

export function isSynthRhythm(value: unknown): value is SynthRhythm {
  return SYNTH_RHYTHMS.includes(value as SynthRhythm);
}

export const DEFAULT_BPM = 100;
export const BEATS_PER_BAR = 4;

export function cleanBpm(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(40, Math.min(240, Math.round(value))) : DEFAULT_BPM;
}

export function isSynthKey(value: unknown): value is SynthKey {
  return SYNTH_KEYS.includes(value as SynthKey);
}

export function isSynthSound(value: unknown): value is SynthSound {
  return SYNTH_SOUNDS.includes(value as SynthSound);
}

/** The room's key and tempo from an activity state; A major (the reel this came from) when unset. */
export function synthSettings(state: Record<string, unknown> | null | undefined): {
  key: SynthKey;
  mode: SynthMode;
  bpm: number;
} {
  return {
    key: isSynthKey(state?.key) ? state.key : "A",
    mode: state?.mode === "minor" ? "minor" : "major",
    bpm: cleanBpm(state?.bpm),
  };
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const SHARPS = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLATS = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

export function keyPitchClass(key: SynthKey): number {
  return SYNTH_KEYS.indexOf(key);
}

/** Display name of a key: "F♯", "B♭". */
export function keyName(key: SynthKey): string {
  return key.replace("#", "♯").replace(/^([A-G])b$/, "$1♭");
}

/** Flat keys spell with flats, sharp keys with sharps, natural ones as their relative major does. */
function prefersFlats(key: SynthKey, mode: SynthMode): boolean {
  if (key.includes("#")) return false;
  if (key.length > 1) return true;
  const major = mode === "major" ? keyPitchClass(key) : (keyPitchClass(key) + 3) % 12;
  return [1, 3, 5, 8, 10].includes(major);
}

function scaleOf(mode: SynthMode) {
  return mode === "minor" ? MINOR : MAJOR;
}

export function pitchName(pc: number, flats: boolean): string {
  return (flats ? FLATS : SHARPS)[((pc % 12) + 12) % 12];
}

/** "E5" for MIDI 76. */
export function noteName(midi: number, key: SynthKey, mode: SynthMode): string {
  return `${pitchName(midi, prefersFlats(key, mode))}${Math.floor(midi / 12) - 1}`;
}

export type ChordQuality = "major" | "minor" | "dim" | "aug";

export interface Chord {
  /** 0–6: I to VII. */
  degree: number;
  /** Pitch class of the root, 0 = C. */
  root: number;
  third: number;
  fifth: number;
  quality: ChordQuality;
  /** "B♭m". */
  name: string;
  /** "ii". */
  numeral: string;
  /** "B♭m (ii)". */
  label: string;
}

/**
 * The triad on one scale degree. Minor keys borrow the major V from harmonic
 * minor, because a minor v sounds like the song forgot where home is.
 */
export function chordFor(degree: number, key: SynthKey, mode: SynthMode): Chord {
  const d = ((Math.round(degree) % 7) + 7) % 7;
  const scale = scaleOf(mode);
  const tonic = keyPitchClass(key);
  const at = (step: number) => scale[step % 7] + (step >= 7 ? 12 : 0);
  let third = at(d + 2) - at(d);
  const fifth = at(d + 4) - at(d);
  if (mode === "minor" && d === 4) third = 4;
  const quality: ChordQuality =
    third === 4 ? (fifth === 8 ? "aug" : "major") : fifth === 6 ? "dim" : "minor";
  const root = (tonic + scale[d]) % 12;
  const mark = quality === "dim" ? "°" : quality === "aug" ? "+" : "";
  const numeral = (quality === "major" || quality === "aug" ? ROMAN[d] : ROMAN[d].toLowerCase()) + mark;
  const name = pitchName(root, prefersFlats(key, mode)) + (quality === "minor" ? "m" : mark);
  return { degree: d, root, third, fifth, quality, name, numeral, label: `${name} (${numeral})` };
}

/** Diatonic pitch letter names A–G. */
export const DIATONIC_LETTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;

/** Base letter 'A'..'G' for a chord (e.g. "C" from "C#m" or "B" from "B♭"). */
export function chordLetter(chord: Chord, key?: SynthKey): string {
  if (key) {
    const tonic = key.charAt(0).toUpperCase();
    const tonicIdx = DIATONIC_LETTERS.indexOf(tonic as (typeof DIATONIC_LETTERS)[number]);
    if (tonicIdx >= 0) {
      return DIATONIC_LETTERS[(tonicIdx + chord.degree) % 7];
    }
  }
  return chord.name.charAt(0).toUpperCase();
}

/**
 * Finds the degree (0–6) for a given note/chord letter ('A'..'G') in the given key.
 */
export function degreeForLetter(letter: string, key: SynthKey, _mode?: SynthMode): number | null {
  const target = letter.trim().charAt(0).toUpperCase();
  const targetIdx = DIATONIC_LETTERS.indexOf(target as (typeof DIATONIC_LETTERS)[number]);
  if (targetIdx < 0) return null;
  const tonic = key.charAt(0).toUpperCase();
  const tonicIdx = DIATONIC_LETTERS.indexOf(tonic as (typeof DIATONIC_LETTERS)[number]);
  if (tonicIdx < 0) return null;
  return ((targetIdx - tonicIdx) % 7 + 7) % 7;
}

/** Lowest and highest note the upper voices may start on. */
const UPPER_LOW = 52;
const UPPER_HIGH = 67;
const UPPER_CENTRE = 64;

/**
 * Any chord as pitch classes: a root, the intervals above it (root first) and
 * an optional bass note for slash chords. Degree chords and named chords
 * ("B♭m/D♭", "E7sus4") both become one of these before they are voiced.
 */
export interface ChordTones {
  root: number;
  intervals: number[];
  /** Pitch class in the bass when it isn't the root (slash chords). */
  bass: number | null;
  name: string;
}

export function chordTones(chord: Chord): ChordTones {
  return { root: chord.root, intervals: [0, chord.third, chord.fifth], bass: null, name: chord.name };
}

/**
 * A bass note plus the chord in close position above it, voiced as near as
 * possible to the previous chord so changing chords glides instead of jumping.
 */
export function voiceTones(tones: ChordTones, previous: readonly number[] | null = null): number[] {
  const bassPc = tones.bass ?? tones.root;
  const bass = 40 + ((((bassPc - 40) % 12) + 12) % 12);
  const pcs: number[] = [];
  for (const interval of tones.intervals) {
    const pc = (tones.root + interval) % 12;
    if (!pcs.includes(pc)) pcs.push(pc);
  }
  // Big chords keep their colour notes and drop the fifth first, so the upper
  // voices still fit (MAX_SYNTH_NOTES counts the bass).
  while (pcs.length > MAX_SYNTH_NOTES - 1) {
    const fifth = pcs.indexOf((tones.root + 7) % 12);
    pcs.splice(fifth > 0 ? fifth : pcs.length - 1, 1);
  }
  const above = (from: number, pc: number) => from + ((((pc - from) % 12) + 12) % 12 || 12);
  const before = previous && previous.length >= 2 ? [...previous].slice(1).sort((a, b) => a - b) : null;
  let best: number[] = [];
  let bestCost = Infinity;
  for (let start = UPPER_LOW; start <= UPPER_HIGH; start += 1) {
    const inversion = pcs.indexOf(start % 12);
    if (inversion < 0) continue;
    const notes = [start];
    for (let step = 1; step < pcs.length; step += 1) notes.push(above(notes[step - 1], pcs[(inversion + step) % pcs.length]));
    const cost = before
      ? notes.reduce((sum, note, index) => sum + Math.abs(note - before[Math.min(index, before.length - 1)]), 0)
      : Math.abs(notes.reduce((sum, note) => sum + note, 0) / notes.length - UPPER_CENTRE);
    if (cost < bestCost) {
      bestCost = cost;
      best = notes;
    }
  }
  return [bass, ...best];
}

/** A degree chord's bass root and close triad (see voiceTones). */
export function voiceChord(chord: Chord, previous: readonly number[] | null = null): number[] {
  return voiceTones(chordTones(chord), previous);
}

const QUALITIES: Record<string, number[]> = {
  "": [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  "°": [0, 3, 6],
  aug: [0, 4, 8],
  "+": [0, 4, 8],
  "5": [0, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  mmaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  "ø": [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  "°7": [0, 3, 6, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  sus: [0, 5, 7],
  "7sus4": [0, 5, 7, 10],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  "9": [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  "11": [0, 7, 10, 14, 17],
  m11: [0, 3, 7, 10, 17],
};

function letterPc(letter: string, accidental: string): number {
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter.toUpperCase() as "C"]!;
  return (base + (/[#♯]/.test(accidental) ? 1 : /[b♭]/.test(accidental) ? 11 : 0)) % 12;
}

const CHORD_NAME = /^([A-Ga-g])([#♯b♭]?)([^/]*)(?:\/([A-Ga-g])([#♯b♭]?))?$/;

/** "B♭m/D♭", "F#m7", "E7sus4", "Gadd9": its tones, or null when it isn't a chord name. */
export function parseChordName(text: string): ChordTones | null {
  const match = text.trim().match(CHORD_NAME);
  if (!match) return null;
  const [, letter, accidental, rawQuality, bassLetter, bassAccidental] = match;
  const quality = rawQuality.replace(/^M7$/, "maj7").replace(/^(m?)sus$/, "sus4").replace(/^msus/, "sus").replace(/^-/, "m");
  const intervals = QUALITIES[quality];
  if (!intervals) return null;
  const root = letterPc(letter, accidental);
  const bass = bassLetter ? letterPc(bassLetter, bassAccidental) : null;
  const pretty = (value: string) => value.replace("#", "♯").replace(/^([A-G])b/, "$1♭");
  const name = pretty(letter.toUpperCase() + accidental) + rawQuality + (bassLetter ? `/${pretty(bassLetter.toUpperCase() + bassAccidental)}` : "");
  return { root, intervals, bass: bass === root ? null : bass, name };
}

/** The degree a named chord is in the key, when it is that degree's own triad. */
export function degreeOfTones(tones: ChordTones, key: SynthKey, mode: SynthMode): number | null {
  for (let degree = 0; degree < 7; degree += 1) {
    const chord = chordFor(degree, key, mode);
    if (chord.root !== tones.root) continue;
    const has = (interval: number) => tones.intervals.some((i) => i % 12 === interval);
    return has(chord.third) && has(chord.fifth) ? degree : null;
  }
  return null;
}

export interface ProgressionStep {
  tones: ChordTones;
  beats: number;
}

/**
 * A typed progression: chord numbers 1–7 in the room's key or chord names, each
 * optionally with its length in beats ("Bbm:2 Ab:2 Gb Fm", "1 5 6 4"). Without
 * one a chord lasts `beats`, a bar by default.
 */
export function parseProgression(text: string, key: SynthKey, mode: SynthMode, beats = BEATS_PER_BAR): ProgressionStep[] {
  const steps: ProgressionStep[] = [];
  for (const token of text.split(/[\s,|]+/)) {
    if (!token) continue;
    const [chordText, lengthText] = token.split(":");
    const length = lengthText ? Number(lengthText) : beats;
    if (!Number.isFinite(length) || length <= 0 || length > 32) continue;
    const tones = /^[1-7]$/.test(chordText) ? chordTones(chordFor(Number(chordText) - 1, key, mode)) : parseChordName(chordText);
    if (tones) steps.push({ tones, beats: length });
  }
  return steps;
}

/**
 * Layers two chords (both hands, or two keys held): the lower bass and the
 * upper voices of both, up to MAX_SYNTH_NOTES notes.
 */
export function voiceDualTones(a: ChordTones, b: ChordTones, previous: readonly number[] | null = null): number[] {
  const notesA = voiceTones(a, previous);
  if (a.root === b.root && a.intervals.join() === b.intervals.join() && a.bass === b.bass) return notesA;
  const notesB = voiceTones(b, previous);
  const upper = [...new Set([...notesA.slice(1), ...notesB.slice(1)])].sort((x, y) => x - y);
  return [Math.min(notesA[0], notesB[0]), ...upper.slice(0, MAX_SYNTH_NOTES - 1)];
}

export function voiceDualChords(chordA: Chord, chordB: Chord, previous: readonly number[] | null = null): number[] {
  return voiceDualTones(chordTones(chordA), chordTones(chordB), previous);
}

/** Two plays sounding at once (your hands over your loop): the lower bass, both chords' upper notes. */
export function mergeNotes(a: readonly number[], b: readonly number[]): number[] {
  if (!a.length) return [...b];
  if (!b.length) return [...a];
  const upper = [...new Set([...a.slice(1), ...b.slice(1)])].sort((x, y) => x - y);
  return [Math.min(a[0], b[0]), ...upper.slice(0, MAX_SYNTH_NOTES - 1)];
}

/**
 * Parses chord sequences from text. Supports:
 * - Digits 1–7 (e.g. "1 2 3 5 2 1 4 5 2 6 5 7", "1,4,5,1")
 * - Note/chord letters A–G (e.g. "C G Am F", "A B C") if key and mode are provided.
 */
export function parseSequence(text: string, key?: SynthKey, mode?: SynthMode): number[] {
  if (!text) return [];
  const tokens = text.match(/[A-Ga-g][#♯b♭]?(?:m|dim|aug|°|\+)?|[1-7]/g);
  if (!tokens) return [];
  const result: number[] = [];
  for (const token of tokens) {
    if (/^[1-7]$/.test(token)) {
      result.push(Number(token));
    } else if (key && mode) {
      const letter = token.charAt(0).toUpperCase();
      const deg = degreeForLetter(letter, key, mode);
      if (deg !== null) {
        result.push(deg + 1);
      }
    }
  }
  return result;
}

/** Steps the melody hand spans: two octaves and the top tonic. */
export const LEAD_STEPS = 15;

/**
 * Melody from the pointing hand's height (0 top of the picture, 1 bottom),
 * snapped to the key. Near a boundary it keeps the previous step, so a hand
 * that wobbles on the edge of two notes doesn't trill between them.
 */
export function leadStep(height: number, previous: number | null): number {
  const span = LEAD_STEPS - 1;
  const t = Math.max(0, Math.min(1, (0.85 - height) / 0.7)) * span;
  if (previous !== null && Math.abs(t - previous) < 0.75) return previous;
  return Math.round(t);
}

export function leadNote(step: number, key: SynthKey, mode: SynthMode): number {
  const scale = scaleOf(mode);
  const s = Math.max(0, Math.min(LEAD_STEPS - 1, Math.round(step)));
  // The tonic between E4 and D♯5, so the melody sits just above the chord.
  const tonic = 64 + ((((keyPitchClass(key) - 64) % 12) + 12) % 12);
  return tonic + 12 * Math.floor(s / 7) + scale[s % 7];
}

// ---------------------------------------------------------------------------
// Hand shapes

/** One of MediaPipe's 21 hand landmarks, in normalised image coordinates. */
export interface HandPoint {
  x: number;
  y: number;
  z?: number;
}

export type HandShape = "fist" | "one" | "two" | "three" | "four" | "five" | "horns" | "love" | "thumb" | "other";

export interface Fingers {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

/** Which chord each shape plays, as a scale degree. */
export const SHAPE_DEGREE: Partial<Record<HandShape, number>> = {
  one: 0,
  two: 1,
  three: 2,
  four: 3,
  five: 4,
  horns: 5,
  love: 6,
};

/** The hand to show for each degree, in order: what the chord pads and help card teach. */
export const DEGREE_SIGNS = ["☝️", "✌️", "3", "4", "🖐️", "🤘", "🤟"];

type Vec = [number, number, number];

/**
 * Which fingers are up. `aspect` is the frame's width over height: landmarks
 * are normalised per axis, so x is stretched back before measuring anything.
 */
export function fingersUp(points: readonly HandPoint[], aspect = 1): Fingers | null {
  if (!points || points.length < 21) return null;
  const p = (i: number): Vec => [points[i].x * aspect, points[i].y, (points[i].z ?? 0) * aspect];
  const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const length = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
  const dist = (a: Vec, b: Vec) => length(sub(a, b));
  const straightness = (a: Vec, b: Vec) => {
    const lengths = length(a) * length(b);
    return lengths > 1e-9 ? (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / lengths : 0;
  };
  const wrist = p(0);
  const palm = dist(wrist, p(9));
  if (palm < 1e-6) return null;
  // A finger is up when its middle joint is straight and its tip is further
  // from the wrist than the joint: curled tips fold back towards the palm.
  const finger = (mcp: number, pip: number, tip: number) =>
    straightness(sub(p(pip), p(mcp)), sub(p(tip), p(pip))) > 0.55 &&
    dist(wrist, p(tip)) > dist(wrist, p(pip)) * 1.12;
  // The thumb is out when it is straight, clear of the index knuckle and
  // pointing away from the pinky side. Tucked, or holding fingers down (✊ ✌ 🤘),
  // its tip rests on the folded middle finger: in photos that is within half a
  // palm of the middle finger's middle joint, and an outstretched thumb is a
  // whole palm away.
  const thumbTip = p(4);
  const thumb =
    straightness(sub(p(3), p(2)), sub(thumbTip, p(3))) > 0.6 &&
    dist(thumbTip, p(5)) > 0.5 * palm &&
    dist(thumbTip, p(10)) > 0.7 * palm &&
    dist(thumbTip, p(17)) > dist(p(2), p(17)) * 1.1;
  return {
    thumb,
    index: finger(5, 6, 8),
    middle: finger(9, 10, 12),
    ring: finger(13, 14, 16),
    pinky: finger(17, 18, 20),
  };
}

export function shapeOf(fingers: Fingers | null): HandShape {
  if (!fingers) return "other";
  const { thumb, index, middle, ring, pinky } = fingers;
  const up = [index, middle, ring, pinky];
  const count = up.filter(Boolean).length;
  if (count === 0) return thumb ? "thumb" : "fist";
  if (index && !middle && !ring && !pinky) return "one";
  if (index && middle && !ring && !pinky) return "two";
  if (index && middle && ring && !pinky) return "three";
  if (count === 4) return thumb ? "five" : "four";
  if (index && pinky && !middle && !ring) return thumb ? "love" : "horns";
  return "other";
}

export function handShape(points: readonly HandPoint[], aspect = 1): HandShape {
  return shapeOf(fingersUp(points, aspect));
}

// ---------------------------------------------------------------------------
// Wire format

/** What one player is sounding right now. Empty notes and no lead is silence. */
export interface SynthPlay {
  /** MIDI notes of the chord, bass first. */
  notes: number[];
  /** How the chord is played; older players send none and are heard holding. */
  rhythm: SynthRhythm;
  /** The tempo the rhythm runs at. */
  bpm: number;
  /** MIDI note of the melody hand, if it is pointing. */
  lead: number | null;
  sound: SynthSound;
  /** 0–1: how open the filter is. */
  bright: number;
  /** "Bm (ii)", shown next to the player's name. */
  label: string;
}

export const SILENCE: SynthPlay = { notes: [], rhythm: "hold", bpm: DEFAULT_BPM, lead: null, sound: "warm", bright: 0.5, label: "" };

/** Most chord notes one play may hold. */
export const MAX_SYNTH_NOTES = 6;
/** How often a player may send; the hub allows a little more. */
export const SYNTH_SENDS_PER_SECOND = 12;
export const SYNTH_HUB_BUDGET = 20;
/** A player still sounding repeats itself this often, so a lost "stop" can't hang a note. */
export const SYNTH_KEEPALIVE_MS = 1000;
/** Listeners let a player's notes go after this long without hearing from them. */
export const SYNTH_STALE_MS = 2600;

const midi = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 24 && value <= 108 ? value : null;

/** Validates a play from the wire; null when it isn't one. */
export function cleanSynthPlay(value: unknown): SynthPlay | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.notes)) return null;
  const notes: number[] = [];
  for (const raw of input.notes.slice(0, MAX_SYNTH_NOTES * 2)) {
    const note = midi(raw);
    if (note !== null && !notes.includes(note)) notes.push(note);
  }
  const bright = typeof input.bright === "number" && Number.isFinite(input.bright) ? input.bright : 0.5;
  return {
    notes: notes.slice(0, MAX_SYNTH_NOTES),
    rhythm: isSynthRhythm(input.rhythm) ? input.rhythm : "hold",
    bpm: cleanBpm(input.bpm),
    lead: midi(input.lead),
    sound: isSynthSound(input.sound) ? input.sound : "warm",
    bright: Math.round(Math.max(0, Math.min(1, bright)) * 100) / 100,
    label: typeof input.label === "string" ? input.label.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 24) : "",
  };
}

export function isSilent(play: SynthPlay): boolean {
  return play.notes.length === 0 && play.lead === null;
}

/** Whether two plays sound the same, closely enough not to resend. */
export function samePlay(a: SynthPlay, b: SynthPlay): boolean {
  return (
    a.lead === b.lead &&
    a.rhythm === b.rhythm &&
    a.bpm === b.bpm &&
    a.sound === b.sound &&
    a.label === b.label &&
    Math.abs(a.bright - b.bright) < 0.04 &&
    a.notes.length === b.notes.length &&
    a.notes.every((note, index) => note === b.notes[index])
  );
}

// ---------------------------------------------------------------------------
// Rhythm on the shared beat grid

export function beatMs(bpm: number): number {
  return 60_000 / cleanBpm(bpm);
}

export interface RhythmHit {
  /** On the shared clock, in ms. */
  at: number;
  notes: number[];
  /** How long the notes sound, in ms. */
  gate: number;
  accent: boolean;
}

/**
 * The notes a rhythmic play strikes between `from` (inclusive) and `to`, on the
 * grid every listener shares: step k falls at k × step length on the hub's
 * clock, so the same play sounds on the same beats everywhere.
 */
export function rhythmHits(play: Pick<SynthPlay, "notes" | "rhythm" | "bpm">, from: number, to: number): RhythmHit[] {
  if (play.rhythm === "hold" || play.notes.length === 0 || to <= from) return [];
  const beat = beatMs(play.bpm);
  const step = play.rhythm === "updown" ? beat / 4 : beat / 2;
  const sorted = [...play.notes].sort((a, b) => a - b);
  const [bass, ...upper] = sorted;
  const climb = upper.length ? [...upper, upper[0] + 12] : [bass];
  const cycle = climb.length > 2 ? [...climb, ...climb.slice(1, -1).reverse()] : climb;
  const hits: RhythmHit[] = [];
  for (let k = Math.ceil(from / step); k * step < to; k += 1) {
    const at = k * step;
    const onBeat = play.rhythm === "updown" ? k % 4 === 0 : k % 2 === 0;
    const accent = Math.round(at / beat) % BEATS_PER_BAR === 0 && onBeat;
    if (play.rhythm === "pulse") {
      hits.push({ at, notes: onBeat ? sorted : upper.length ? upper : sorted, gate: step * 0.55, accent });
    } else if (play.rhythm === "arp") {
      hits.push({ at, notes: [sorted[k % sorted.length]], gate: step * 0.9, accent });
    } else {
      const notes = [cycle[k % cycle.length]];
      if (onBeat) notes.unshift(bass);
      hits.push({ at, notes, gate: step * 0.85, accent });
    }
  }
  return hits;
}
