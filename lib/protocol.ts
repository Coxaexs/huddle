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
  /** Recorder bots are always labelled independently from ordinary bots. */
  recorder?: boolean;
}

export type RecordingStatus =
  | "awaiting-consent"
  | "countdown"
  | "recording"
  | "paused"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export type RecordingScene =
  | "party"
  | "speaker"
  | "battlemap"
  | "split"
  | "intermission";

export interface RecordingConsent {
  userId: string;
  displayName: string;
  required: boolean;
  decision: "pending" | "accepted" | "declined" | "withdrawn";
  decidedAt: string | null;
}

/** Public, path-free recording state safe to send to every room participant. */
export interface RecordingState {
  id: string;
  channelId: string;
  serverId: string;
  title: string;
  campaign: string | null;
  episodeNumber: number | null;
  status: RecordingStatus;
  scene: RecordingScene;
  resolution: "1920x1080" | "1280x720";
  frameRate: 30 | 60;
  theme: "tavern" | "parchment" | "minimal" | "arcane" | "noir";
  separateAudio: boolean;
  retentionDays: number;
  automaticDirection: boolean;
  lockedSpeakerId: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  stoppedAt: string | null;
  elapsedMs: number;
  recorderHealthy: boolean;
  recorderLastSeenAt: string | null;
  estimatedBytes: number;
  diskFreeBytes: number | null;
  error: string | null;
  controllerId: string;
  consents: RecordingConsent[];
  updatedAt: string;
}

export interface DiceRollEvent {
  expression: string;
  dice: Array<{
    sides: number;
    rolls: Array<{ value: number; kept: boolean }>;
    sign: 1 | -1;
  }>;
  modifier: number;
  total: number;
  roller: { id: string; displayName: string };
  rollType: "normal" | "advantage" | "disadvantage" | "critical-damage";
  animationSeed: string;
}

export interface CharacterPresentation {
  userId: string;
  playerName: string | null;
  characterName: string;
  portraitUrl: string | null;
  artworkUrl: string | null;
  className: string | null;
  level: number | null;
  accentColor: string;
  publicCard: Array<{ label: string; value: string }>;
}

export interface CharacterReveal {
  id: string;
  sessionId: string;
  userId: string;
  mode: "portrait" | "compact" | "sheet" | "spell" | "ability" | "item";
  title: string;
  imageUrl: string | null;
  fields: Array<{ label: string; value: string }>;
  durationMs: number;
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
      recordings: Record<string, RecordingState>;
    }
  | { t: "presence"; online: string[]; serverNow: number }
  | { t: "message"; channelId: string; message: unknown; serverNow: number }
  | {
      t: "voice";
      channelId: string;
      participants: VoiceParticipant[];
      serverNow: number;
    }
  | {
      t: "recording-state";
      channelId: string;
      state: RecordingState | null;
      serverNow: number;
    }
  | {
      t: "recording-consent";
      channelId: string;
      sessionId: string;
      consent: RecordingConsent;
      serverNow: number;
    }
  | {
      t: "recording-scene";
      channelId: string;
      sessionId: string;
      scene: RecordingScene;
      automatic: boolean;
      serverNow: number;
    }
  | {
      t: "recording-marker";
      channelId: string;
      sessionId: string;
      marker: { id: string; kind: "chapter" | "highlight"; name: string; atMs: number };
      serverNow: number;
    }
  | {
      t: "recording-heartbeat";
      channelId: string;
      sessionId: string;
      healthy: boolean;
      estimatedBytes: number;
      diskFreeBytes: number | null;
      serverNow: number;
    }
  | {
      t: "dice-roll";
      channelId: string;
      roll: DiceRollEvent;
      serverNow: number;
    }
  | {
      t: "character-presentation";
      channelId: string;
      sessionId: string;
      action: "updated" | "reveal" | "clear";
      presentation?: CharacterPresentation;
      reveal?: CharacterReveal;
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
  | {
      /** A DM partner read the conversation up to `readAt` (for "seen"). */
      t: "read";
      channelId: string;
      userId: string;
      readAt: string;
      serverNow: number;
    }
  | { t: "pong"; serverNow: number };

/**
 * Who places the call in a mesh pair.
 *
 * Both ends run this over the same two ids and must come to opposite answers.
 * If they ever agree, the pair either never connects (nobody dials) or collides
 * on every attempt (both dial), which is why this lives in one place instead of
 * being spelled out at each call site. The server-side music publisher only
 * answers offers, so a bot is always the one dialled.
 */
export function dialsFirst(
  localId: string,
  remoteId: string,
  bot = false,
): boolean {
  return bot || localId <= remoteId;
}

/**
 * Perfect negotiation's tie-break. The end that does not dial is the polite
 * one: when two offers cross, it rolls its own back and answers theirs.
 */
export function isPolite(
  localId: string,
  remoteId: string,
  bot = false,
): boolean {
  return !dialsFirst(localId, remoteId, bot);
}
