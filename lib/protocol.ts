/** Wire types shared by the Huddle hub (Durable Object) and the browser. */

export interface PresenceUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl?: string | null;
  color: string;
}

export interface VoiceParticipant extends PresenceUser {
  /** Per-tab id: the same person can be in voice from two devices. */
  connectionId: string;
  muted: boolean;
  deafened: boolean;
  /** Muted for the whole Huddle by someone, not just for themselves. */
  serverMuted?: boolean;
  /**
   * MediaStream ids for this person's video, so receivers can tell a camera
   * from a screen share without inspecting the tracks.
   */
  cameraStreamId?: string | null;
  screenStreamId?: string | null;
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
  /** Most recent first; what /history lists. */
  history: Track[];
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
    history: [],
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
  | {
      t: "voice-state";
      muted?: boolean;
      deafened?: boolean;
      cameraStreamId?: string | null;
      screenStreamId?: string | null;
    }
  | { t: "signal"; to: string; data: unknown }
  | { t: "player"; channelId: string; action: PlayerAction }
  | { t: "typing"; channelId: string }
  | { t: "ping" };

export type PlayerAction =
  | { name: "play"; track: Track; startNow?: boolean }
  | { name: "enqueue"; track: Track }
  | { name: "playnext"; track: Track }
  | { name: "move"; from: number; to: number }
  | { name: "skipto"; index: number }
  | { name: "removedupes" }
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
      forcedMutes: string[];
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
  | { t: "message-deleted"; channelId: string; id: string; serverNow: number }
  | {
      t: "message-pinned";
      channelId: string;
      id: string;
      pinned: boolean;
      serverNow: number;
    }
  | {
      t: "message-edited";
      channelId: string;
      id: string;
      content: string;
      editedAt: string;
      serverNow: number;
    }
  | {
      t: "reaction";
      channelId: string;
      messageId: string;
      emoji: string;
      userId: string;
      added: boolean;
      serverNow: number;
    }
  | {
      t: "soundboard";
      channelId: string;
      url: string;
      name: string;
      by: string;
      serverNow: number;
    }
  | {
      t: "typing";
      channelId: string;
      userId: string;
      displayName: string;
      serverNow: number;
    }
  | {
      t: "poll";
      channelId: string;
      pollId: string;
      counts: number[];
      voters: number;
      serverNow: number;
    }
  | {
      /** Shared battlemap: opened, closed, a token moved, paint added. */
      t: "battlemap";
      channelId: string;
      action: "open" | "close" | "token" | "tokens" | "stroke" | "cleared";
      map?: unknown;
      token?: unknown;
      tokens?: unknown;
      stroke?: unknown;
      strokes?: unknown;
      serverNow: number;
    }
  | {
      /** The activity surface shared by everyone in a voice room. */
      t: "activity";
      channelId: string;
      action: "update" | "close";
      activity?: unknown;
      serverNow: number;
    }
  | { t: "force-mute"; userId: string; muted: boolean; serverNow: number }
  | {
      /** This tab was dropped from voice because the same account joined
       *  from somewhere else. */
      t: "voice-evicted";
      channelId: string;
      serverNow: number;
    }
  | {
      /** A moderator moved this account into another voice channel; the tab
       *  should join `channelId` for real (renegotiating WebRTC). */
      t: "voice-move";
      channelId: string;
      serverNow: number;
    }
  | { t: "notice"; text: string; serverNow: number }
  | { t: "pong"; serverNow: number };
