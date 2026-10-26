/**
 * The club's light feed: what the music bot sends a voice room's club, about
 * twelve times a second (the bot's club.py), and what the hub lets through.
 *
 * Each batch carries 20 ms light frames, six channels each (0..255): the kick,
 * the snare and hats, the bass, the vocal, the rest of the music, and the
 * overall level, as the room hears them. With stems they are the song's real
 * parts; without, the mix's bands stand in and the vocal is 0. Frames are
 * stamped (bot clock, which is the hub's) with when their sound plays, a
 * little ahead, so each listener can show them on time.
 *
 * Beside the frames, the notes (when the bot knows them): which note the bass
 * line is on, the root of the chord the rest of the music plays, and the note
 * the voice sings, so the lights can take their colours from the music.
 *
 * And now and then each song's map (ClubSongMap): how hard every bar of it
 * goes and where its sections change, with what the song feels like, so the
 * lights know a chorus is coming before it comes.
 */

export const CLUB_CHANNELS = ["kick", "snare", "bass", "vocals", "melody", "level"] as const;
export type ClubChannel = (typeof CLUB_CHANNELS)[number];
export const CLUB_FRAME_MS = 20;

/** Moments the bot announces ahead: a DJ move, a sampler hit, or a loop borrowed from another song over a mix. */
export const CLUB_MOMENTS = ["build", "drop", "breakdown", "beatbreak", "stutter", "echo", "sample", "loop"] as const;
/** The parts Real DJ borrows from other songs (the bot's loops.py). */
export const CLUB_LOOP_PARTS = ["guitar", "piano", "bass", "drums"] as const;
export type ClubLoopPart = (typeof CLUB_LOOP_PARTS)[number];
export type ClubMomentKind = (typeof CLUB_MOMENTS)[number];
export interface ClubMoment {
  k: ClubMomentKind;
  /** Bot clock ms. */
  at: number;
  /** When a build, breakdown or stutter ends. */
  until?: number;
  /** A sampler hit's pad: horn, siren, laser, boom, clap, riser, scratch, rewind; a loop's part (CLUB_LOOP_PARTS). */
  name?: string;
}

/** real: Real DJ plays the set; auto: Auto DJ plays the queue; hands: a person mixes; player: the room's ordinary player. */
export type ClubMode = "real" | "auto" | "hands" | "player";
export type ClubVibe = "chill" | "club" | "hype";
export interface ClubInfo {
  mode: ClubMode;
  vibe?: ClubVibe;
  /** A mix under way: its style's name and how far along. */
  mix?: { style: string; progress: number } | null;
  next?: string | null;
  /** Camelot key of the song that leads. */
  key?: string | null;
  paused?: boolean;
  /** The crowd's say (CLUB_CROWD_KINDS): the votes still counting, and what Real DJ did about them a moment ago. */
  crowd?: ClubCrowd | null;
  /** A part of another song playing over the mix right now. */
  loop?: { part: ClubLoopPart; title: string | null } | null;
  /** The mood station the night plays to (CLUB_STATIONS), when one is chosen. */
  station?: ClubStation | null;
}

/** The DJ's mood stations (the bot's stations.py): it picks songs from the whole library for the mood, and mixes in its style. */
export const CLUB_STATIONS = [
  { id: "heavy", label: "Heavy rock", emoji: "🤘" },
  { id: "indie", label: "Indie rock", emoji: "🎸" },
  { id: "sad", label: "Sad", emoji: "💔" },
  { id: "pop", label: "Pop", emoji: "🎤" },
  { id: "dreamy", label: "Dreamy", emoji: "🌙" },
  { id: "party", label: "Party", emoji: "🪩" },
  { id: "turkish", label: "Türkçe", emoji: "🇹🇷" },
  { id: "chill", label: "Chill", emoji: "🌿" },
] as const;
export type ClubStation = (typeof CLUB_STATIONS)[number]["id"];
export const isClubStation = (value: unknown): value is ClubStation => CLUB_STATIONS.some((s) => s.id === value);

/**
 * A song's map: every bar from its first beat, one byte each (base64): (how hard the
 * bar goes, 0..15) << 4 | flags (CLUB_BAR_VOCAL, CLUB_BAR_DRUMS); and its sections,
 * each [first bar, bars, level, flags]: level 0 quiet (an intro, a breakdown), 1 a
 * verse, 2 a lift, 3 a chorus or a drop. Bar k is beats 4k..4k+4 of the song's grid,
 * the same beats as a batch's `b` while this song (`id`, the batch's `w`) leads.
 */
export interface ClubSongMap {
  id: string;
  bpm: number;
  bars: string;
  /** [first bar, bars, level, flags, name (CLUB_SECTION_NAMES index; 0: not known)]. */
  sec: Array<[number, number, number, number, number]>;
  /** How far apart the song's quiet and loud bars are, 0..1. */
  dyn: number;
  mood: ClubMood;
  /** The beat of the grid the song's bars start on (0..3): bar k is beats phase + 4k .. phase + 4k + 4. */
  phase?: number;
}
export const CLUB_BAR_VOCAL = 1;
export const CLUB_BAR_DRUMS = 2;
/** Section names, as the bot numbers them (a section's fifth number), when someone listened to the song. */
export const CLUB_SECTION_NAMES = ["", "intro", "verse", "prechorus", "chorus", "postchorus", "drop", "build", "bridge", "break",
  "breakdown", "solo", "instrumental", "outro"] as const;
export type ClubSectionName = Exclude<(typeof CLUB_SECTION_NAMES)[number], "">;
/** The palettes a song's mood can call for (the bot's djbrain.MOOD_WORDS). */
export const CLUB_MOOD_NAMES = ["fierce", "blue", "bright", "warm", "dreamy"] as const;
export type ClubMoodPalette = (typeof CLUB_MOOD_NAMES)[number];
/**
 * What a song feels like: its energy (0..1), whether its key is minor, how much it moves between quiet and loud,
 * and (when Gemini listened to it) its mood words and the palette they lean to.
 */
export interface ClubMood { energy: number; minor: boolean | null; dyn: number | null; words?: string[]; name?: ClubMoodPalette | null }

/** What someone with the club open can tell the DJ: more energy, or calmer. Cheers are the room's own emotes (CLUB_CHEERS). */
export const CLUB_CROWD_KINDS = ["more", "chill"] as const;
export type ClubCrowdKind = (typeof CLUB_CROWD_KINDS)[number];
/** How long a tap counts for, fading (the bot's club.CROWD_VOTE_S). */
export const CLUB_CROWD_VOTE_MS = 120_000;
/** The emotes that cheer: the room cheering together calls Real DJ's build and drop. */
export const CLUB_CHEERS = ["🔥", "🎉", "👏"] as const;
export interface ClubCrowd {
  more: number;
  chill: number;
  /** Real DJ heard the crowd: turned it up, took it down, or built into a drop. */
  said: "up" | "down" | "drop" | null;
}

/** The parts whose notes come with the frames, in their order there. */
export const CLUB_NOTE_PARTS = ["bass", "chord", "vocal"] as const;
export type ClubNotePart = (typeof CLUB_NOTE_PARTS)[number];
export const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"] as const;
/** A part's note: its pitch class (C = 0 .. B = 11), and how clearly it sounds, 0..1. */
export interface ClubNote { pc: number; strength: number }

/** One batch: frames from `at`, CLUB_FRAME_MS apart, as base64 of 6 bytes each. */
export interface ClubBatch {
  at: number;
  f: string;
  /**
   * Each frame's notes, base64 of 3 bytes a frame (CLUB_NOTE_PARTS): (how clearly,
   * 0..15) << 4 | (pitch class + 1), or 0 for no note to speak of. Absent: none known.
   */
  n?: string;
  /** The beat (of the song that leads) at the first frame, and its live tempo. */
  b?: number;
  bpm?: number;
  /** Lit by stems (the vocal channel means something). */
  stems?: boolean;
  /** The song that leads (its map's id), with `b`. */
  w?: string;
  map?: ClubSongMap;
  ev?: ClubMoment[];
  info?: ClubInfo;
}

const MODES: readonly ClubMode[] = ["real", "auto", "hands", "player"];
const VIBES: readonly ClubVibe[] = ["chill", "club", "hype"];
const SAID: readonly NonNullable<ClubCrowd["said"]>[] = ["up", "down", "drop"];
const SAMPLE_NAMES = ["horn", "siren", "rewind", "laser", "boom", "clap", "riser", "scratch"];
/** At most 2 s of frames in one batch, and of their notes; a map of a song up to 15 minutes long. */
const MAX_MAP_CHARS = 2000;
const MAX_FRAME_CHARS = Math.ceil((100 * 6) / 3) * 4;
const MAX_NOTE_CHARS = Math.ceil((100 * 3) / 3) * 4;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

/** What the hub passes on of a batch from the bot; null if it is not one. */
export function cleanClubBatch(raw: unknown): ClubBatch | null {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as Record<string, unknown>;
  if (!finite(event.at) || typeof event.f !== "string" || event.f.length > MAX_FRAME_CHARS) return null;
  if (!BASE64.test(event.f)) return null;
  const batch: ClubBatch = { at: Math.round(event.at), f: event.f };
  if (typeof event.n === "string" && event.n.length <= MAX_NOTE_CHARS && BASE64.test(event.n)) batch.n = event.n;
  if (finite(event.b) && Math.abs(event.b) < 1e6) batch.b = Math.round(event.b * 1000) / 1000;
  if (finite(event.bpm) && event.bpm >= 30 && event.bpm <= 300) batch.bpm = Math.round(event.bpm * 100) / 100;
  if (typeof event.stems === "boolean") batch.stems = event.stems;
  const song = text(event.w, 24);
  if (song) batch.w = song;
  const map = cleanSongMap(event.map);
  if (map) batch.map = map;
  if (Array.isArray(event.ev)) {
    const moments: ClubMoment[] = [];
    for (const item of event.ev.slice(0, 8)) {
      const m = item as Record<string, unknown> | null;
      if (!m || !(CLUB_MOMENTS as readonly string[]).includes(m.k as string) || !finite(m.at)) continue;
      const moment: ClubMoment = { k: m.k as ClubMomentKind, at: Math.round(m.at) };
      if (finite(m.until) && m.until >= m.at && m.until - m.at < 60_000) moment.until = Math.round(m.until);
      const names: readonly string[] = moment.k === "loop" ? CLUB_LOOP_PARTS : SAMPLE_NAMES;
      if (typeof m.name === "string" && names.includes(m.name)) moment.name = m.name;
      moments.push(moment);
    }
    if (moments.length) batch.ev = moments;
  }
  const info = event.info as Record<string, unknown> | undefined;
  if (info && typeof info === "object" && MODES.includes(info.mode as ClubMode)) {
    const mix = info.mix as Record<string, unknown> | null | undefined;
    const crowd = cleanCrowd(info.crowd);
    const looped = info.loop as Record<string, unknown> | null | undefined;
    const loop = looped && typeof looped === "object" && (CLUB_LOOP_PARTS as readonly unknown[]).includes(looped.part)
      ? { part: looped.part as ClubLoopPart, title: text(looped.title, 160) }
      : null;
    batch.info = {
      mode: info.mode as ClubMode,
      ...(VIBES.includes(info.vibe as ClubVibe) ? { vibe: info.vibe as ClubVibe } : {}),
      mix: mix && typeof mix === "object" && text(mix.style, 40) && finite(mix.progress)
        ? { style: text(mix.style, 40)!, progress: Math.max(0, Math.min(1, mix.progress)) }
        : null,
      next: text(info.next, 160),
      key: text(info.key, 4),
      paused: info.paused === true,
      ...(crowd ? { crowd } : {}),
      ...(loop ? { loop } : {}),
      ...(isClubStation(info.station) ? { station: info.station } : {}),
    };
  }
  return batch;
}

function cleanSongMap(value: unknown): ClubSongMap | null {
  const map = value as Record<string, unknown> | null | undefined;
  if (!map || typeof map !== "object") return null;
  const id = text(map.id, 24);
  if (!id || !finite(map.bpm) || map.bpm < 30 || map.bpm > 300) return null;
  if (typeof map.bars !== "string" || map.bars.length > MAX_MAP_CHARS || !BASE64.test(map.bars)) return null;
  const sec: ClubSongMap["sec"] = [];
  for (const item of Array.isArray(map.sec) ? map.sec.slice(0, 64) : []) {
    if (!Array.isArray(item) || item.length < 4 || !item.every(finite)) continue;
    const [bar, bars, level, flags, name = 0] = item as number[];
    if (bar < 0 || bar > 2000 || bars < 1 || bars > 2000) continue;
    const named = Number.isInteger(name) && name > 0 && name < CLUB_SECTION_NAMES.length ? name : 0;
    sec.push([Math.round(bar), Math.round(bars), Math.max(0, Math.min(3, Math.round(level))), Math.round(flags) & 3, named]);
  }
  const unit = (n: unknown) => (finite(n) ? Math.max(0, Math.min(1, Math.round(n * 1000) / 1000)) : null);
  const mood = map.mood as Record<string, unknown> | null | undefined;
  return {
    id,
    bpm: Math.round(map.bpm * 100) / 100,
    bars: map.bars,
    sec,
    dyn: unit(map.dyn) ?? 0,
    ...(Number.isInteger(map.phase) && (map.phase as number) > 0 && (map.phase as number) < 4 ? { phase: map.phase as number } : {}),
    mood: {
      energy: unit(mood?.energy) ?? 0.5,
      minor: typeof mood?.minor === "boolean" ? mood.minor : null,
      dyn: unit(mood?.dyn),
      ...(Array.isArray(mood?.words) ? { words: mood.words.filter((w): w is string => typeof w === "string").slice(0, 3).map((w) => w.slice(0, 24)) } : {}),
      ...((CLUB_MOOD_NAMES as readonly unknown[]).includes(mood?.name) ? { name: mood!.name as ClubMoodPalette } : {}),
    },
  };
}

/** A song's bars as sent: (how hard 0..1, flags) each. */
export function decodeBars(bars: string): Array<{ hard: number; flags: number }> {
  return decodeRows(bars, 1).map(([byte]) => ({ hard: (byte >> 4) / 15, flags: byte & 15 }));
}

function cleanCrowd(value: unknown): ClubCrowd | null {
  const crowd = value as Record<string, unknown> | null | undefined;
  if (!crowd || typeof crowd !== "object") return null;
  const count = (n: unknown) => (finite(n) ? Math.max(0, Math.min(999, Math.round(n))) : 0);
  return {
    more: count(crowd.more),
    chill: count(crowd.chill),
    said: SAID.includes(crowd.said as NonNullable<ClubCrowd["said"]>) ? (crowd.said as ClubCrowd["said"]) : null,
  };
}

/** Base64 as rows of `width` bytes. */
function decodeRows(data: string, width: number): number[][] {
  let bytes: string;
  try {
    bytes = atob(data);
  } catch {
    return [];
  }
  const rows: number[][] = [];
  for (let i = 0; i + width <= bytes.length; i += width) {
    const row: number[] = [];
    for (let c = 0; c < width; c++) row.push(bytes.charCodeAt(i + c));
    rows.push(row);
  }
  return rows;
}

/** A batch's frames: six numbers 0..1 each. */
export function decodeFrames(f: string): number[][] {
  return decodeRows(f, 6).map((row) => row.map((byte) => byte / 255));
}

/** A batch's notes: three bytes a frame, as sent (readNote reads one). */
export function decodeNotes(n: string): number[][] {
  return decodeRows(n, CLUB_NOTE_PARTS.length);
}

export function readNote(byte: number | undefined): ClubNote | null {
  if (!byte) return null;
  const pc = (byte & 15) - 1;
  const strength = (byte >> 4) / 15;
  return pc >= 0 && pc < 12 && strength > 0 ? { pc, strength } : null;
}
