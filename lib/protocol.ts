/** Wire types shared by the Huddle hub (Durable Object) and the browser. */

export interface LoungeWirePose { x: number; z: number; facing: number; seat: string | null }

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
  /**
   * Hub-clock milliseconds when this seat was taken. Clients tick it against
   * the hub's `serverNow` to show how long someone has been in the room, so it
   * has to be the hub's number rather than each browser's own clock.
   */
  joinedAt: number;
  muted: boolean;
  deafened: boolean;
  /** Muted for the whole Huddle by someone, not just for themselves. */
  serverMuted?: boolean;
  /**
   * This person's hand is up in a stage channel: they would like the floor.
   *
   * Only meaningful in a stage room, which is the one kind with an audience.
   * It rides the existing voice-state broadcast rather than getting its own
   * message, so it reaches every client without new plumbing.
   */
  handRaised?: boolean;
  /**
   * Whether this seat may be heard in a stage room.
   *
   * Decided by the server on join, from the member's SPEAK permission, and
   * changed afterwards only by a moderator. Clients read it to decide whether
   * to offer an unmute control; they never get to decide it themselves.
   */
  speakAllowed?: boolean;
  /** Hub-clock ms the hand went up; hosts take raised hands in this order. */
  handRaisedAt?: number;
  /** Speaker requests centred playback with a modest volume boost. */
  important?: boolean;
  /**
   * MediaStream ids for this person's video, so receivers can tell a camera
   * from a screen share without inspecting the tracks.
   */
  cameraStreamId?: string | null;
  screenStreamId?: string | null;
  /**
   * This seat sends and receives through the LiveKit media server. Two such
   * seats never connect directly; anyone else (bots, older clients, a client
   * whose LiveKit connection failed) is still reached peer-to-peer.
   */
  sfu?: boolean;
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
  theme?: string;
  themeColor?: string;
  material?: "plastic" | "metal" | "wood" | "glass";
  texture?: string;
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
  /** Empty until the bot resolves a queued placeholder (see `query`). */
  audioUrl: string;
  pageUrl: string | null;
  requestedBy: string;
  /** Search the bot resolves this placeholder from, just before it plays. */
  query?: string;
  /** The saved playlist this track was queued from. */
  playlist?: { name: string; cover: string | null } | null;
  /** Transition out of this track into the next (the bot's mixer spec). */
  mix?: Record<string, unknown> | null;
}

/**
 * What an outside source (the bot's DJ booth) has on air. While it is set the
 * room hears that instead of the hub's own track, which waits paused.
 */
export interface LiveTrack {
  id: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  duration: number | null;
  /** Position (ms) as of `updatedAt`, like the player's own clock. */
  positionMs: number;
  updatedAt: number;
  paused: boolean;
  source: "dj";
}

export interface PlayerState {
  channelId: string;
  track: Track | null;
  /** Set while the DJ booth is on air; see heard(). */
  live?: LiveTrack | null;
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
/**
 * The player as the room hears it: the DJ booth's track while it is on air,
 * else the hub's own. Its track has no audio, so nobody plays it locally (the
 * bot streams the booth).
 */
export function heard(state: PlayerState, now?: number): PlayerState;
export function heard(state: PlayerState | null | undefined, now?: number): PlayerState | null;
export function heard(state: PlayerState | null | undefined, now = Date.now()): PlayerState | null {
  const live = liveTrack(state, now);
  if (!state || !live) return state ?? null;
  return {
    ...state,
    track: {
      id: live.id,
      title: live.title,
      artist: live.artist,
      thumbnail: live.thumbnail,
      duration: live.duration,
      audioUrl: "",
      pageUrl: null,
      requestedBy: "DJ booth",
    },
    paused: live.paused,
    positionMs: live.positionMs,
    updatedAt: live.updatedAt,
  };
}

/**
 * The booth re-sends its track at least every 20 s. One not heard from in two
 * minutes is a booth that died without handing the room back: ignore it.
 */
export const LIVE_STALE_MS = 120_000;

export function liveTrack(
  state: PlayerState | null | undefined,
  now = Date.now(),
): LiveTrack | null {
  const live = state?.live;
  return live && now - live.updatedAt < LIVE_STALE_MS ? live : null;
}

/** Transport controls that belong to the DJ booth while it is on air. */
export const LIVE_OWNED_ACTIONS: ReadonlySet<PlayerAction["name"]> = new Set([
  "pause", "resume", "toggle", "seek", "skip", "skipto", "stop", "ended",
]);

export function playbackPosition(state: PlayerState, now = Date.now()): number {
  if (!state.track) return 0;
  if (state.paused) return state.positionMs;
  return state.positionMs + Math.max(0, now - state.updatedAt);
}

export type ClientEvent =
  | { t: "subscribe"; channelId: string }
  | {
      t: "voice-join";
      channelId: string;
      sfu?: boolean;
      /** Resuming after a reconnect: the seat's previous clock and state. */
      since?: number;
      muted?: boolean;
      deafened?: boolean;
    }
  | { t: "voice-leave" }
  | {
      t: "voice-state";
      important?: boolean;
      muted?: boolean;
      deafened?: boolean;
      /** Stage only: whether this person's hand is up. */
      handRaised?: boolean;
      cameraStreamId?: string | null;
      screenStreamId?: string | null;
      /** Dropped back to peer-to-peer after the media server failed. */
      sfu?: boolean;
    }
  | { t: "signal"; to: string; data: unknown }
  | {
      /**
       * A moderator putting a stage seat on stage, or taking it off.
       *
       * Addressed by connection rather than user so it moves one seat: the same
       * person may be in the audience on one device and on stage on another.
       */
      t: "stage-speaker";
      connectionId: string;
      allowed: boolean;
    }
  | { t: "player"; channelId: string; action: PlayerAction }
  | { t: "typing"; channelId: string }
  /** Live captions: what this seat's own browser heard it say. */
  | { t: "caption"; text: string; final: boolean }
  /** Living room: where this seat is standing or sitting, and an optional emote. */
  | { t: "lounge"; x: number; z: number; facing: number; seat: string | null; emote?: string }
  /** Living room: ask the hub where everyone in your voice room is. */
  | { t: "lounge-sync" }
  | {
      t: "dm-call";
      channelId: string;
      targetUserId: string;
      action: "call" | "accept" | "decline" | "cancel";
      isVideo?: boolean;
    }
  | { t: "ping" };

export type PlayerAction =
  | { name: "play"; track: Track; startNow?: boolean }
  | { name: "enqueue"; track: Track }
  /** A whole playlist at once; `startNow` replaces what is playing. */
  | { name: "enqueueMany"; tracks: Track[]; startNow?: boolean }
  /** The bot's mixer played a transition: the next track is already running. */
  | { name: "mixAdvance"; fromTrackId: string; positionMs: number }
  /** Fills in a placeholder's audio once the bot has looked it up. */
  | { name: "resolve"; trackId: string; track: Partial<Track> }
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
  | { name: "ended"; trackId: string }
  /** The DJ booth's on-air track (null when the booth hands the room back). */
  | { name: "live"; live: Omit<LiveTrack, "updatedAt"> | null };

export type ServerEvent =
  | {
      /** Stage Q&A: one question's new state, or null with removedId. */
      t: "qa";
      channelId: string;
      question: import("./qa").QaQuestion | null;
      removedId?: string;
      serverNow: number;
    }
  | {
      /** Living room: one seat moved (pose null: left the room). */
      t: "lounge";
      channelId: string;
      connectionId: string;
      pose: LoungeWirePose | null;
      emote?: string;
      serverNow: number;
    }
  | {
      /** Living room: everyone placed in your voice room, answering lounge-sync. */
      t: "lounge-state";
      channelId: string;
      poses: Array<{ connectionId: string; pose: LoungeWirePose }>;
      serverNow: number;
    }
  | {
      /** Live captions from a seat in your voice room. */
      t: "caption";
      channelId: string;
      connectionId: string;
      userId: string;
      displayName: string;
      text: string;
      final: boolean;
      serverNow: number;
    }
  | {
      t: "ready";
      connectionId: string;
      /** Hand back with ?resume=<connectionId>&ticket= to keep this id. */
      resumeTicket?: string;
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
  /** Servers, channels or roles changed; `serverId` when it was one server. */
  | { t: "structure"; serverId?: string; serverNow: number }
  /** One person's profile or presence changed. */
  | { t: "member"; userId: string; serverNow: number }
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
      /** Absent when a bot edit changed only the embeds or buttons. */
      content?: string;
      editedAt?: string;
      /** Set when a bot edit replaced the message's embeds or buttons. */
      payload?: unknown;
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
      /** An administrator force-stopped /tts and /say in this channel. */
      t: "tts-stop";
      channelId: string;
      by: string;
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
      /** Direct message call signaling between caller and callee. */
      t: "dm-call";
      channelId: string;
      fromUserId: string;
      fromDisplayName: string;
      fromAvatar: string;
      fromAvatarUrl?: string | null;
      action: "call" | "accept" | "decline" | "cancel";
      isVideo?: boolean;
      serverNow: number;
    }
  | { t: "pong"; serverNow: number };
