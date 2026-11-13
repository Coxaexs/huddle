/**
 * Hoffle Study Hall, the shared half: a lofi radio (recorded tracks, with rain
 * over them if the room wants it) that everyone in a voice room hears at the
 * same place, and a focus timer the room shares.
 *
 * No audio is sent between people. The room shares a few numbers (the
 * activity state), and what is playing is a pure function of them: the seed
 * shuffles the tracks, and the start time on the shared clock says how far
 * into that shuffle the room is. Each browser works that out and plays the
 * same file from the same second (lib/study-hall-tracks.ts lists the files).
 */

import { STUDY_TRACKS, type StudyTrack } from "./study-hall-tracks";

/**
 * Silence between two tracks. It gives the next file time to start loading on
 * a slow connection, so nobody joins it late.
 */
export const AMBIENT_GAP_MS = 1500;

/** Music alone, music with rain on the window, or the rain alone. */
export const AMBIENT_INTENSITIES = ["calm", "rainy", "rain"] as const;
export type AmbientIntensity = (typeof AMBIENT_INTENSITIES)[number];

export const AMBIENT_TIMER_KINDS = ["focus", "break"] as const;
export type AmbientTimerKind = (typeof AMBIENT_TIMER_KINDS)[number];
export const AMBIENT_TIMER_MAX_MINUTES = 120;
/** How long a finished timer keeps saying so before it clears itself from view. */
export const AMBIENT_TIMER_DONE_MS = 10 * 60_000;

export interface AmbientState {
  /** Integer seed: the order the tracks play in. */
  seed: number;
  /** Epoch ms (on the server's clock) when the first track of that order started. */
  startedAt: number;
  intensity: AmbientIntensity;
  /** The room's shared focus or break timer: when it ends (epoch ms, server clock), or 0 for none. */
  timerEndsAt: number;
  timerKind: AmbientTimerKind;
  /** How long that timer was set for. */
  timerMinutes: number;
}

/** What the room is playing at one moment. */
export interface AmbientPlaying {
  track: StudyTrack;
  /** Index of that track in the track list. */
  index: number;
  /** Epoch ms (server clock) when the track started, and when the one after it starts. */
  startsAt: number;
  endsAt: number;
  /** How far into the track the room is. Past `track.ms` it is the pause before the next one. */
  offsetMs: number;
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

/** Folds numbers into one 32-bit seed, so each lap of the playlist gets its own shuffle. */
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

/**
 * Whatever is stored or sent, as a complete, in-range state. A Study Hall
 * saved by the older, synthesised version reads fine: its tempo and chord are
 * dropped, and its "focus" mood (which added a beat) becomes music alone.
 */
export function ambientState(
  input: Record<string, unknown> | null | undefined,
  now: number = Date.now(),
): AmbientState {
  const seed = Number(input?.seed);
  const startedAt = Number(input?.startedAt);
  const mood = input?.intensity === "focus" ? "calm" : input?.intensity;
  return {
    seed: Number.isFinite(seed) ? Math.floor(Math.abs(seed)) % 4294967296 : 1,
    startedAt: Number.isFinite(startedAt) && startedAt > 0 ? Math.round(startedAt) : Math.round(now),
    intensity: AMBIENT_INTENSITIES.includes(mood as AmbientIntensity) ? (mood as AmbientIntensity) : "rainy",
    ...ambientTimer(input, now),
  };
}

/** The timer part of the state, cleaned: an end time further off than any timer can be set is no timer. */
function ambientTimer(
  input: Record<string, unknown> | null | undefined,
  now: number,
): Pick<AmbientState, "timerEndsAt" | "timerKind" | "timerMinutes"> {
  const minutes = Number(input?.timerMinutes);
  const endsAt = Number(input?.timerEndsAt);
  const timerMinutes = Number.isFinite(minutes)
    ? Math.round(Math.max(1, Math.min(AMBIENT_TIMER_MAX_MINUTES, minutes)))
    : 25;
  const latest = now + (AMBIENT_TIMER_MAX_MINUTES + 5) * 60_000;
  return {
    timerEndsAt: Number.isFinite(endsAt) && endsAt > 0 && endsAt <= latest ? Math.round(endsAt) : 0,
    timerKind: AMBIENT_TIMER_KINDS.includes(input?.timerKind as AmbientTimerKind)
      ? (input?.timerKind as AmbientTimerKind)
      : "focus",
    timerMinutes,
  };
}

/** Starts the room's timer from `now`. */
export function startAmbientTimer(state: AmbientState, kind: AmbientTimerKind, minutes: number, now: number): AmbientState {
  return ambientState({ ...state, timerKind: kind, timerMinutes: minutes, timerEndsAt: now + minutes * 60_000 }, now);
}

/** Clears the room's timer. */
export function stopAmbientTimer(state: AmbientState): AmbientState {
  return { ...state, timerEndsAt: 0 };
}

/**
 * Where the room's timer stands: not set, counting down (with the ms left), or
 * just finished. A timer that finished a while ago counts as not set.
 */
export function ambientTimerStatus(
  state: AmbientState,
  now: number,
): { phase: "none" | "running" | "done"; leftMs: number } {
  if (!state.timerEndsAt) return { phase: "none", leftMs: 0 };
  const leftMs = state.timerEndsAt - now;
  if (leftMs > 0) return { phase: "running", leftMs };
  return { phase: -leftMs < AMBIENT_TIMER_DONE_MS ? "done" : "none", leftMs: 0 };
}

/** A new session. `random` is injectable for tests. */
export function starterAmbientState(now: number = Date.now(), random: () => number = Math.random): AmbientState {
  return ambientState({ seed: Math.floor(random() * 4294967296), startedAt: now }, now);
}

/* ------------------------------------------------------------------ */
/* The playlist                                                        */
/* ------------------------------------------------------------------ */

/** One lap's shuffle, before the lap before it has had its say. */
function shuffled(seed: number, lap: number, count: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  const random = mulberry32(mixSeed(seed, lap, 0x6c6f6669));
  for (let index = count - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order;
}

/**
 * The order one lap of the playlist plays in, as indexes into the track list.
 * Every track plays once per lap, each lap is shuffled afresh, and a lap never
 * opens with the track the last one closed on.
 */
export function ambientOrder(seed: number, lap: number, count: number = STUDY_TRACKS.length): number[] {
  const order = shuffled(seed, lap, count);
  // The swap only ever moves a lap's first two tracks, so with three or more
  // the last one is the raw shuffle's, and the lap before needs no fixing first.
  if (count >= 3 && lap > 0 && order[0] === shuffled(seed, lap - 1, count)[count - 1]) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}

/** How long one lap of the playlist takes, pauses included. */
export function ambientLapMs(tracks: readonly StudyTrack[] = STUDY_TRACKS): number {
  return tracks.reduce((total, track) => total + track.ms + AMBIENT_GAP_MS, 0);
}

/** What the room is playing at `now`. Before the start time it is the first track, not yet begun. */
export function ambientPlaying(
  state: AmbientState,
  now: number,
  tracks: readonly StudyTrack[] = STUDY_TRACKS,
): AmbientPlaying {
  const lapMs = ambientLapMs(tracks);
  const elapsed = Math.max(0, now - state.startedAt);
  const lap = Math.floor(elapsed / lapMs);
  const order = ambientOrder(state.seed, lap, tracks.length);
  let startsAt = state.startedAt + lap * lapMs;
  for (let slot = 0; slot < order.length; slot += 1) {
    const track = tracks[order[slot]];
    const endsAt = startsAt + track.ms + AMBIENT_GAP_MS;
    if (now < endsAt || slot === order.length - 1) {
      return { track, index: order[slot], startsAt, endsAt, offsetMs: Math.max(0, now - startsAt) };
    }
    startsAt = endsAt;
  }
  // Unreachable with one track or more; an empty list has nothing to play.
  throw new Error("Study Hall has no tracks");
}

/** The track after the one playing at `now`. */
export function ambientUpNext(
  state: AmbientState,
  now: number,
  tracks: readonly StudyTrack[] = STUDY_TRACKS,
): StudyTrack {
  return ambientPlaying(state, ambientPlaying(state, now, tracks).endsAt, tracks).track;
}

/**
 * Moves the whole room on to the next track, from `now`: the start time
 * slides back by what was left of this one, so the order stays as it was.
 */
export function skipAmbientTrack(
  state: AmbientState,
  now: number,
  tracks: readonly StudyTrack[] = STUDY_TRACKS,
): AmbientState {
  const playing = ambientPlaying(state, now, tracks);
  return { ...state, startedAt: Math.round(state.startedAt - (playing.endsAt - Math.max(now, state.startedAt))) };
}

/** A fresh order for the room, starting now. */
export function reshuffleAmbient(state: AmbientState, now: number, random: () => number = Math.random): AmbientState {
  return { ...state, seed: Math.floor(random() * 4294967296), startedAt: Math.round(now) };
}
