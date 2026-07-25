/** Wire types shared by the Huddle hub (Durable Object) and the browser. */

export interface PresenceUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  color: string;
}

export interface VoiceParticipant extends PresenceUser {
  /** Per-tab id: the same person can be in voice from two devices. */
  connectionId: string;
  muted: boolean;
  deafened: boolean;
  /** True for the music bot, which has no microphone. */
  bot?: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  duration: number | null;
  audioUrl: string;
  pageUrl: string | null;
  requestedBy: string;
}

export interface PlayerState {
  channelId: string;
  track: Track | null;
  queue: Track[];
  paused: boolean;
  /** Playback position (ms) as of `updatedAt`. */
  positionMs: number;
  updatedAt: number;
  volume: number;
  loop: "off" | "track" | "queue";
}

export function emptyPlayer(channelId: string): PlayerState {
  return {
    channelId,
    track: null,
    queue: [],
    paused: false,
    positionMs: 0,
    updatedAt: Date.now(),
    volume: 100,
    loop: "off",
  };
}

/**
 * Where the track should be right now. The hub only stores a position plus the
 * timestamp it was taken, so every listener derives the same clock.
 */
export function playbackPosition(state: PlayerState, now = Date.now()): number {
  if (!state.track) return 0;
  if (state.paused) return state.positionMs;
  return state.positionMs + Math.max(0, now - state.updatedAt);
}

export type ClientEvent =
  | { t: "subscribe"; channelId: string }
  | { t: "voice-join"; channelId: string }
  | { t: "voice-leave" }
  | { t: "voice-state"; muted?: boolean; deafened?: boolean }
  | { t: "signal"; to: string; data: unknown }
  | { t: "player"; channelId: string; action: PlayerAction }
  | { t: "ping" };

export type PlayerAction =
  | { name: "play"; track: Track; startNow?: boolean }
  | { name: "enqueue"; track: Track }
  | { name: "pause" }
  | { name: "resume" }
  | { name: "toggle" }
  | { name: "skip" }
  | { name: "stop" }
  | { name: "seek"; positionMs: number }
  | { name: "volume"; volume: number }
  | { name: "loop"; mode: PlayerState["loop"] }
  | { name: "shuffle" }
  | { name: "clear" }
  | { name: "remove"; index: number }
  | { name: "ended"; trackId: string };

export type ServerEvent =
  | {
      t: "ready";
      connectionId: string;
      serverNow: number;
      online: string[];
      voice: Record<string, VoiceParticipant[]>;
      players: Record<string, PlayerState>;
    }
  | { t: "presence"; online: string[]; serverNow: number }
  | { t: "message"; channelId: string; message: unknown; serverNow: number }
  | {
      t: "voice";
      channelId: string;
      participants: VoiceParticipant[];
      serverNow: number;
    }
  | { t: "signal"; from: string; data: unknown; serverNow: number }
  | { t: "player"; state: PlayerState; serverNow: number }
  | { t: "structure"; serverNow: number }
  | { t: "notice"; text: string; serverNow: number }
  | { t: "pong"; serverNow: number };
