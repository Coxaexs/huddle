/**
 * Gesture Synth's songbook: real chord charts, so a song sounds like the song.
 *
 * Each song is its sections in order, every chord with its length in beats
 * (4/4, so 4 is a bar), at the record's tempo, with the sound and rhythm that
 * suit it. Charts come from Hooktheory's TheoryTabs and published
 * transcriptions (Attack Magazine's for Instant Crush's chorus); chords outside
 * the key (B♭m/D♭, E7sus4) are written as chord names, not numbers.
 */
import type { SynthKey, SynthMode, SynthRhythm, SynthSound } from "./gesture-synth";

export interface SongPart {
  name: string;
  /** "Bbm:4 Ab:4", in parseProgression's format. */
  chords: string;
}

export interface SynthSong {
  id: string;
  name: string;
  artist: string;
  key: SynthKey;
  mode: SynthMode;
  bpm: number;
  sound: SynthSound;
  rhythm: SynthRhythm;
  parts: SongPart[];
}

export const SYNTH_SONGS: SynthSong[] = [
  {
    id: "instant-crush",
    name: "Instant Crush",
    artist: "Daft Punk ft. Julian Casablancas",
    key: "Bb",
    mode: "minor",
    bpm: 110,
    sound: "warm",
    rhythm: "pulse",
    parts: [
      { name: "Verse", chords: "Gb:4 Ebm:4 Bbm:4 Ab:4 Gb:4 Ebm:4 Bbm:4 Ab:4" },
      { name: "Chorus", chords: "Bbm:4 Bbm:2 Ab:2 Gb:4 Gb:2 Fm:2 Ebm:4 Ebm:2 Bbm/Db:2 Ab/C:4 Fm:4" },
    ],
  },
  {
    id: "get-lucky",
    name: "Get Lucky",
    artist: "Daft Punk ft. Pharrell Williams",
    key: "A",
    mode: "major",
    bpm: 116,
    sound: "pluck",
    rhythm: "pulse",
    parts: [{ name: "Loop", chords: "Bm7:4 D:4 F#m7:4 E:4" }],
  },
  {
    id: "one-more-time",
    name: "One More Time",
    artist: "Daft Punk",
    key: "B",
    mode: "minor",
    bpm: 123,
    sound: "warm",
    rhythm: "pulse",
    parts: [
      { name: "Chorus", chords: "Gmaj7:4 A:4 Gmaj7:4 A:4 Gmaj7:4 A:4 F#m7:4 A:4" },
      { name: "Bridge", chords: "G:4 D/F#:4 Em7:4 A:4" },
    ],
  },
  {
    id: "digital-love",
    name: "Digital Love",
    artist: "Daft Punk",
    key: "A",
    mode: "major",
    bpm: 125,
    sound: "glass",
    rhythm: "arp",
    parts: [
      { name: "Verse", chords: "D:4 C#m:4 F#m:4 E7sus4:4" },
      { name: "Bridge", chords: "D:4 C#:4 F#m:4 C#m:4" },
    ],
  },
  {
    id: "around-the-world",
    name: "Around the World",
    artist: "Daft Punk",
    key: "A",
    mode: "minor",
    bpm: 121,
    sound: "chip",
    rhythm: "pulse",
    parts: [{ name: "Loop", chords: "Am7:4 C:4 Em7:4 D:4" }],
  },
  {
    id: "harder-better",
    name: "Harder, Better, Faster, Stronger",
    artist: "Daft Punk",
    key: "F#",
    mode: "minor",
    bpm: 124,
    sound: "chip",
    rhythm: "pulse",
    parts: [
      { name: "Verse", chords: "F#msus2:4 Esus4:4 D7:4 C#msus4:4 Bmsus4:4" },
      { name: "Chorus", chords: "F#m:4 E:4 D#dim:4 C#msus4:4" },
    ],
  },
  {
    id: "something-about-us",
    name: "Something About Us",
    artist: "Daft Punk",
    key: "D",
    mode: "minor",
    bpm: 100,
    sound: "glass",
    rhythm: "hold",
    parts: [{ name: "Verse", chords: "Bbmaj7:4 Am7:4 Dm11:4 Gadd9:4" }],
  },
  {
    id: "veridis-quo",
    name: "Veridis Quo",
    artist: "Daft Punk",
    key: "A",
    mode: "minor",
    bpm: 107,
    sound: "glass",
    rhythm: "updown",
    parts: [{ name: "Loop", chords: "Am:4 Dm:4 G:4 F:4 Am/E:4" }],
  },
  {
    id: "blinding-lights",
    name: "Blinding Lights",
    artist: "The Weeknd",
    key: "F",
    mode: "minor",
    bpm: 171,
    sound: "warm",
    rhythm: "updown",
    parts: [{ name: "Loop", chords: "Fm:4 Cm:4 Eb:4 Bb:4" }],
  },
  {
    id: "take-on-me",
    name: "Take On Me",
    artist: "a-ha",
    key: "A",
    mode: "major",
    bpm: 169,
    sound: "chip",
    rhythm: "pulse",
    parts: [
      { name: "Verse", chords: "Bm7:4 E7:4 A:4 D7:4 Bm7:4 E7:4 A:4 C#m7:4" },
      { name: "Chorus", chords: "A:4 E/G#:4 F#m7:4 D:4" },
    ],
  },
  {
    id: "let-it-be",
    name: "Let It Be",
    artist: "The Beatles",
    key: "C",
    mode: "major",
    bpm: 72,
    sound: "glass",
    rhythm: "hold",
    parts: [{ name: "Verse", chords: "C:2 G:2 Am:2 F:2 C:2 G:2 F:2 C:2" }],
  },
  {
    id: "stand-by-me",
    name: "Stand By Me",
    artist: "Ben E. King",
    key: "A",
    mode: "major",
    bpm: 118,
    sound: "pluck",
    rhythm: "pulse",
    parts: [{ name: "Verse", chords: "A:8 F#m:8 D:4 E:4 A:8" }],
  },
  {
    id: "canon",
    name: "Canon in D",
    artist: "Pachelbel",
    key: "D",
    mode: "major",
    bpm: 66,
    sound: "glass",
    rhythm: "arp",
    parts: [{ name: "Ground", chords: "D:2 A:2 Bm:2 F#m:2 G:2 D:2 G:2 A:2" }],
  },
  {
    id: "blues",
    name: "12-Bar Blues",
    artist: "in E",
    key: "E",
    mode: "major",
    bpm: 110,
    sound: "warm",
    rhythm: "pulse",
    parts: [{ name: "12 bars", chords: "E7:16 A7:8 E7:8 B7:4 A7:4 E7:4 B7:4" }],
  },
  {
    id: "lofi",
    name: "Lo-fi study chords",
    artist: "ii–V–I",
    key: "C",
    mode: "major",
    bpm: 80,
    sound: "glass",
    rhythm: "hold",
    parts: [{ name: "Loop", chords: "Dm9:4 G7:4 Cmaj7:4 Am7:4" }],
  },
];

/** A song's whole chart as one progression string. */
export function songChords(song: SynthSong): string {
  return song.parts.map((part) => part.chords).join(" ");
}
