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
 */

export const CLUB_CHANNELS = ["kick", "snare", "bass", "vocals", "melody", "level"] as const;
export type ClubChannel = (typeof CLUB_CHANNELS)[number];
export const CLUB_FRAME_MS = 20;

/** Moments the bot announces ahead: a DJ move, or a sampler hit. */
export const CLUB_MOMENTS = ["build", "drop", "breakdown", "beatbreak", "stutter", "echo", "sample"] as const;
export type ClubMomentKind = (typeof CLUB_MOMENTS)[number];
export interface ClubMoment {
  k: ClubMomentKind;
  /** Bot clock ms. */
  at: number;
  /** When a build, breakdown or stutter ends. */
  until?: number;
  /** A sampler hit's pad: horn, siren, laser, boom, clap, riser, scratch, rewind. */
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
}

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
  ev?: ClubMoment[];
  info?: ClubInfo;
}

const MODES: readonly ClubMode[] = ["real", "auto", "hands", "player"];
const VIBES: readonly ClubVibe[] = ["chill", "club", "hype"];
const SAID: readonly NonNullable<ClubCrowd["said"]>[] = ["up", "down", "drop"];
const SAMPLE_NAMES = ["horn", "siren", "rewind", "laser", "boom", "clap", "riser", "scratch"];
/** At most 2 s of frames in one batch, and of their notes. */
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
  if (Array.isArray(event.ev)) {
    const moments: ClubMoment[] = [];
    for (const item of event.ev.slice(0, 8)) {
      const m = item as Record<string, unknown> | null;
      if (!m || !(CLUB_MOMENTS as readonly string[]).includes(m.k as string) || !finite(m.at)) continue;
      const moment: ClubMoment = { k: m.k as ClubMomentKind, at: Math.round(m.at) };
      if (finite(m.until) && m.until >= m.at && m.until - m.at < 60_000) moment.until = Math.round(m.until);
      if (typeof m.name === "string" && SAMPLE_NAMES.includes(m.name)) moment.name = m.name;
      moments.push(moment);
    }
    if (moments.length) batch.ev = moments;
  }
  const info = event.info as Record<string, unknown> | undefined;
  if (info && typeof info === "object" && MODES.includes(info.mode as ClubMode)) {
    const mix = info.mix as Record<string, unknown> | null | undefined;
    const crowd = cleanCrowd(info.crowd);
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
    };
  }
  return batch;
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
