"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic,
  Megaphone,
  Hand,
  SlidersHorizontal,
  MicOff,
  Headphones,
  Volume2,
  Volume1,
  VolumeX,
  Play,
  Search,
  Video,
  VideoOff,
  Monitor,
  Map,
  Sparkles,
  Scissors,
  Check,
  Loader2,
  Maximize2,
  Minimize2,
  PhoneOff,
  Users,
  X,
  EyeOff,
  Eye,
  ExternalLink,
  LayoutGrid,
  MoreHorizontal,
  ChevronDown,
  ChevronUp as PeopleUp,
  ChevronDown as PeopleDown,
} from "lucide-react";
import { SOUNDBOARD_PRESETS, playPresetSound, type SoundPreset } from "@/lib/soundboard-presets";
import {
  VIRTUAL_BACKGROUND_PRESETS,
  BUILTIN_BACKGROUND_IMAGES,
  loadCustomBackgrounds,
  saveCustomBackground,
  deleteCustomBackground,
  type BackgroundMode,
  type CustomBackgroundItem,
} from "../lib/virtual-background";
import type { VoiceParticipant } from "@/lib/protocol";
import type { DiceRollEvent } from "@/lib/protocol";
import type { RoomActivity } from "@/lib/activities";
import {
  nextScreenQuality,
  screenQualityLabel,
  type ScreenShareQuality,
} from "../hooks/use-voice";
import { ScreenShareSetup } from "./screen-share-setup";
import { apiFetch } from "../lib/client";
import { TableAudioMenu, type TableControls } from "./table-audio-menu";
import { Avatar } from "./avatar";
import { isOnStage, splitStageRoster } from "@/lib/stage";
import { DiceOverlay } from "./dice-overlay";
import { RoomActivities } from "./room-activities";
import { VoiceDuration } from "./voice-duration";

interface Sound {
  id: string;
  name: string;
  emoji: string;
  url: string;
  personal?: boolean;
}

/** The slice of the voice hook the stage needs to render and drive a call. */
interface VoiceApi extends TableControls {
  important: boolean;
  toggleImportant: () => void;
  channelId: string | null;
  muted: boolean;
  forcedMute: boolean;
  deafened: boolean;
  /** Stage rooms: this tab's hand is up, and the way to change that. */
  handRaised: boolean;
  toggleHand: () => void;
  /** Stage rooms: put a seat on stage or take it off. Moderator-only. */
  setStageSpeaker: (connectionId: string, allowed: boolean) => void;
  /** Videos this tab stopped receiving (to save data), and the switch for it. */
  hiddenVideo: Record<string, { camera: boolean; screen: boolean }>;
  setVideoHidden: (connectionId: string, which: "camera" | "screen", hidden: boolean) => void;
  speaking: Set<string>;
  /** `kind` is set for LiveKit streams, whose ids are not the sender's. */
  remoteStreams: Array<{ connectionId: string; stream: MediaStream; kind?: "voice" | "camera" | "screen" | "tts" }>;
  peerStates: Record<string, string>;
  screenSharing: boolean;
  screenShareAudio?: boolean;
  setScreenShareAudio?: (enabled: boolean) => void;
  hasScreenAudio?: boolean;
  screenAudioMuted?: boolean;
  toggleScreenAudio?: () => void;
  screenQuality: ScreenShareQuality;
  setScreenQuality: (quality: ScreenShareQuality) => void;
  startScreenShare: (quality?: ScreenShareQuality, withAudio?: boolean, film?: boolean) => void | Promise<void>;
  screenFilm?: boolean;
  setScreenFilm?: (film: boolean) => void;
  stopScreenShare: () => void;
  cameraOn: boolean;
  cameraBackground?: BackgroundMode;
  setCameraBackground?: (mode: BackgroundMode) => void;
  cameraBlurAmount?: number;
  setCameraBlurAmount?: (amount: number) => void;
  cameraBackgroundImage?: string;
  setCameraBackgroundImage?: (imageId: string) => void;
  startCamera: () => void | Promise<void>;
  stopCamera: () => void;
  localVideos: Array<{ kind: "camera" | "screen"; stream: MediaStream }>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  leave: () => void;
  takeClip: () => Promise<Blob | null>;
  clipSeconds: number;
}

interface VoiceStageProps {
  channelName: string;
  participants: VoiceParticipant[];
  connectionId: string | null;
  /** The hub's clock, for each person's live "in voice for" timer. */
  serverNow?: () => number;
  voice: VoiceApi;
  /** Server the room belongs to, for its soundboard. */
  serverId: string | null;
  canManageSounds: boolean;
  /**
   * This room is a stage: it has an audience, so participants are split into
   * those whose mic is live and those watching, and the watchers can ask for
   * the floor.
   */
  stageMode?: boolean;
  /** Viewer may move seats on and off the stage (MUTE_MEMBERS). */
  canManageStage?: boolean;
  userId: string;
  userName: string;
  activity: RoomActivity | null;
  onActivity: (activity: RoomActivity | null) => void;
  /** Posts a captured clip into the active text channel. */
  onClip?: (clip: Blob) => Promise<void>;
  /** Whether the viewer is actually connected to this room's voice. */
  joined?: boolean;
  /** Join this room's voice (needs a real gesture for the microphone). */
  onJoin?: () => void;
  /** Leave the stage view entirely, used when the viewer is not joined. */
  onExit?: () => void;
  /** The battlemap panel, rendered by the shell which owns its state. */
  battlemap?: React.ReactNode;
  onToggleBattlemap?: () => void;
  battlemapOpen?: boolean;
  /** A dice roll to animate over the stage, or null when idle. */
  diceRoll?: DiceRollEvent | null;
  /** Called once the roll animation has finished. */
  onDiceRollDone?: () => void;
  /** Consent banner and GM director controls for the production recorder. */
  recording?: React.ReactNode;
  /** Opens the per-person menu (volume/mute/moderation) for a participant. */
  onOpenParticipantMenu?: (
    event: React.MouseEvent,
    participant: VoiceParticipant,
  ) => void;
  /** Pop out active screenshare to floating movable preview. */
  onPopout?: () => void;
  /** Whether to hide the internal topbar (e.g. when shell renders unified header). */
  hideTopbar?: boolean;
  /** Controlled view mode ("grid" | "table" | "map"). */
  viewMode?: "grid" | "table" | "map";
  onViewModeChange?: (mode: "grid" | "table" | "map") => void;
  /** Notifies parent shell of the focused stream info for unified topbar. */
  onFocusedChange?: (info: { streamerName: string; isScreen: boolean; streamId?: string; participantId?: string; self?: boolean } | null) => void;
  /** Watcher stream audio volume and mute controls. */
  streamPreferenceFor?: (streamId: string, userId?: string) => { volume: number; muted: boolean };
  onSetStreamVolume?: (streamId: string, userId: string | undefined, volume: number) => void;
  onToggleStreamMute?: (streamId: string, userId: string | undefined) => void;
}

interface VideoTile {
  key: string;
  stream: MediaStream;
  label: string;
  self: boolean;
  mirrored: boolean;
  connecting: boolean;
  /** Remote tiles only: whose video it is and which one, for hiding it. */
  remoteId?: string;
  videoKind?: "camera" | "screen";
  /** This viewer stopped receiving it; the sender no longer sends it here. */
  hidden?: boolean;
}

export function hasLiveVideo(stream: MediaStream): boolean {
  return stream.getVideoTracks().some((track) => track.readyState === "live");
}

/**
 * A tile's picture, or a placeholder once the viewer has stopped receiving it,
 * plus the small corner button that switches between the two.
 */
function TileVideo({
  tile,
  onHide,
}: {
  tile: VideoTile;
  onHide?: (tile: VideoTile, hidden: boolean) => void;
}) {
  const what = tile.videoKind === "camera" ? "camera" : "screen share";
  return (
    <>
      {tile.hidden ? (
        <div className="video-hidden-placeholder">
          <EyeOff size={22} aria-hidden="true" />
          <span>{tile.videoKind === "camera" ? "Camera hidden" : "Screen share hidden"}</span>
          <small>Not using your data</small>
        </div>
      ) : (
        <VideoSurface stream={tile.stream} mirrored={tile.mirrored} />
      )}
      {!tile.self && tile.remoteId && onHide && (
        <span
          role="button"
          tabIndex={0}
          className="video-hide-btn"
          title={tile.hidden ? `Show this ${what} again` : `Stop receiving this ${what} (saves data)`}
          aria-label={tile.hidden ? `Show this ${what}` : `Hide this ${what}`}
          onClick={(event) => {
            event.stopPropagation();
            onHide(tile, !tile.hidden);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            onHide(tile, !tile.hidden);
          }}
        >
          {tile.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
          {tile.hidden ? "Show" : "Hide"}
        </span>
      )}
    </>
  );
}

/** Attaches a MediaStream to a <video>, replacing it only when it changes. */
function VideoSurface({
  stream,
  mirrored,
  muted = true,
}: {
  stream: MediaStream;
  mirrored?: boolean;
  muted?: boolean;
}) {
  return (
    <video
      autoPlay
      playsInline
      muted={muted}
      className={mirrored ? "mirrored" : ""}
      ref={(element) => {
        if (element && element.srcObject !== stream) {
          element.srcObject = stream;
          void element.play().catch(() => undefined);
        }
      }}
    />
  );
}

/**
 * The Discord-style room view shown in the main column while a voice channel is
 * selected. Renders a tile per participant plus a tile per live screen/camera,
 * lets you click a video to focus it (with a filmstrip and fullscreen), and
 * carries the call controls along the bottom.
 */
export function VoiceStage({
  channelName,
  participants,
  connectionId,
  serverNow,
  voice,
  serverId,
  canManageSounds,
  stageMode = false,
  canManageStage = false,
  userId,
  userName,
  activity,
  onActivity,
  onClip,
  joined,
  onJoin,
  onExit,
  battlemap,
  onToggleBattlemap,
  battlemapOpen,
  diceRoll,
  onDiceRollDone,
  recording,
  onOpenParticipantMenu,
  onPopout,
  hideTopbar = false,
  viewMode: controlledViewMode,
  onViewModeChange,
  onFocusedChange,
  streamPreferenceFor,
  onSetStreamVolume,
  onToggleStreamMute,
}: VoiceStageProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [screenSharePopoverOpen, setScreenSharePopoverOpen] = useState(false);
  const [internalViewMode, setInternalViewMode] = useState<"grid" | "table" | "map">("grid");
  const viewMode = controlledViewMode ?? internalViewMode;

  const handleViewModeChange = useCallback(
    (mode: "grid" | "table" | "map") => {
      setInternalViewMode(mode);
      onViewModeChange?.(mode);
    },
    [onViewModeChange],
  );
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(Boolean(activity));
  // The MSN Games menu opens this panel from the chat side.
  useEffect(() => {
    const open = () => setActivitiesOpen(true);
    window.addEventListener("huddle:open-activities", open);
    return () => window.removeEventListener("huddle:open-activities", open);
  }, []);
  // A running activity takes over the stage like a Discord Activity; the
  // people grid folds away behind a pill above the call controls.
  const activityTakeover = activitiesOpen && Boolean(activity);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [clipping, setClipping] = useState<"idle" | "working" | "done">("idle");
  const [cameraBgMenuOpen, setCameraBgMenuOpen] = useState(false);
  const [cameraTab, setCameraTab] = useState<"blur" | "images" | "fx">("blur");
  const [customBgs, setCustomBgs] = useState<CustomBackgroundItem[]>(() => loadCustomBackgrounds());
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Stage roster split. The rules live in `lib/stage.ts` so they can be tested
   * without a live call; this only supplies the participants.
   */
  const { onStage, audience } = stageMode
    ? splitStageRoster(participants)
    : { onStage: [] as VoiceParticipant[], audience: [] as VoiceParticipant[] };
  const self = participants.find((person) => person.connectionId === connectionId) || null;
  /** True when this tab is in the audience and could therefore ask for the floor. */
  const amAudience = Boolean(self && !isOnStage(self));

  /** Live seat time for one person, when the shell handed us the hub's clock. */
  function seatTime(person: VoiceParticipant, className: string) {
    if (!serverNow) return null;
    return (
      <VoiceDuration
        className={className}
        joinedAt={person.joinedAt}
        serverNow={serverNow}
      />
    );
  }

  function handleBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = 1280;
          c.height = 720;
          const ctx = c.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, 1280, 720);
            const compressed = c.toDataURL("image/webp", 0.85);
            const saved = saveCustomBackground(file.name.replace(/\.[^.]+$/, ""), compressed);
            setCustomBgs(loadCustomBackgrounds());
            voice.setCameraBackground?.("image");
            voice.setCameraBackgroundImage?.(saved.id);
          }
        };
        img.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleDeleteCustomBg(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    deleteCustomBackground(id);
    setCustomBgs(loadCustomBackgrounds());
    if (voice.cameraBackgroundImage === id) {
      voice.setCameraBackgroundImage?.("preset:cyberpunk");
    }
  }

  const wrapperRef = useRef<HTMLDivElement>(null);
  const focusMainRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoTiles: VideoTile[] = [];
  for (const { kind, stream } of voice.localVideos) {
    if (!hasLiveVideo(stream)) continue;
    videoTiles.push({
      key: `self:${stream.id}`,
      stream,
      label: `You · ${kind}`,
      self: true,
      mirrored: kind === "camera",
      connecting: false,
    });
  }
  for (const { connectionId: remoteId, stream, kind } of voice.remoteStreams) {
    if (!hasLiveVideo(stream)) continue;
    const person = participants.find((p) => p.connectionId === remoteId);
    const isCamera = kind ? kind === "camera" : person?.cameraStreamId === stream.id;
    const isScreen = kind ? kind === "screen" : person?.screenStreamId === stream.id;
    const label =
      person && isCamera
        ? `${person.displayName} · camera`
        : person && isScreen
          ? `${person.displayName} · screen`
          : person?.displayName || "Screen share";
    const videoKind = isCamera ? "camera" : "screen";
    videoTiles.push({
      key: `${remoteId}:${stream.id}`,
      stream,
      label,
      self: false,
      mirrored: false,
      remoteId,
      videoKind,
      hidden: voice.hiddenVideo[remoteId]?.[videoKind] === true,
      connecting:
        voice.peerStates[remoteId] !== undefined &&
        voice.peerStates[remoteId] !== "connected",
    });
  }

  const focused = focusedKey
    ? videoTiles.find((tile) => tile.key === focusedKey) || null
    : null;

  const focusedPerson = focused?.remoteId
    ? participants.find((p) => p.connectionId === focused.remoteId)
    : focused?.self
      ? self
      : null;
  const streamerName = focusedPerson?.displayName || (focused?.self ? "You" : focused?.label?.split(" · ")[0] || "Stream");

  // Notify parent shell of focused streamer name and stream kind for unified topbar.
  // Depends on primitives only: `focused` is a fresh object every render, and the
  // parent re-renders us on each notify, so object deps would loop forever.
  const focusedStreamId = focused?.stream.id;
  const focusedIsScreen = focused?.videoKind === "screen";
  const focusedSelf = Boolean(focused?.self);
  const focusedParticipantId = focusedPerson?.id;
  useEffect(() => {
    if (!onFocusedChange) return;
    onFocusedChange(
      focusedStreamId
        ? {
            streamerName,
            isScreen: focusedIsScreen,
            streamId: focusedStreamId,
            participantId: focusedParticipantId,
            self: focusedSelf,
          }
        : null,
    );
  }, [focusedStreamId, focusedIsScreen, focusedSelf, focusedParticipantId, streamerName, onFocusedChange]);

  // Auto-focus a screenshare once when it first appears; leaving the focused
  // view must stick, so tiles already seen are never re-grabbed.
  const seenScreenKeys = useRef(new Set<string>());
  const screenKeys = videoTiles.filter((t) => t.videoKind === "screen" && !t.hidden).map((t) => t.key).join("|");
  useEffect(() => {
    const keys = screenKeys ? screenKeys.split("|") : [];
    const fresh = keys.find((key) => !seenScreenKeys.current.has(key));
    for (const key of keys) seenScreenKeys.current.add(key);
    if (fresh && !focusedKey) setFocusedKey(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKeys]);

  function hideTile(tile: VideoTile, hidden: boolean) {
    if (!tile.remoteId || !tile.videoKind) return;
    voice.setVideoHidden(tile.remoteId, tile.videoKind, hidden);
    // A hidden video has nothing to fill the big view with.
    if (hidden && focusedKey === tile.key) setFocusedKey(null);
  }

  // Esc leaves the focused view (the first Esc in fullscreen just exits that).
  useEffect(() => {
    if (!focused) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.fullscreenElement) return;
      setFocusedKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  // If the focused stream goes away (share stopped), fall back to the grid.
  useEffect(() => {
    if (focusedKey && !videoTiles.some((tile) => tile.key === focusedKey)) {
      setFocusedKey(null);
    }
  });

  // Theater: hide the row of people under a share without leaving the app.
  const [theater, setTheater] = useState(() => {
    try {
      return window.localStorage.getItem("huddle-share-theater") === "on";
    } catch {
      return false;
    }
  });
  const toggleTheater = () =>
    setTheater((on) => {
      try {
        window.localStorage.setItem("huddle-share-theater", on ? "off" : "on");
      } catch {
        // Only a remembered preference.
      }
      return !on;
    });
  // Fills the window when the Fullscreen API is missing or refused (Tauri's
  // WebKit, embedded webviews), so fullscreen always means just the video.
  const [windowFull, setWindowFull] = useState(false);
  useEffect(() => {
    if (!windowFull) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWindowFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [windowFull]);
  useEffect(() => {
    if (!focused) setWindowFull(false);
  }, [focused]);

  // Controls overlay auto-hide (hides when not hovered / idle for 3 seconds)
  const [showFocusBar, setShowFocusBar] = useState(true);
  const isFocusBarHoveredRef = useRef(false);
  const focusBarTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startFocusBarTimer = useCallback(() => {
    if (focusBarTimerRef.current) {
      clearTimeout(focusBarTimerRef.current);
    }
    focusBarTimerRef.current = setTimeout(() => {
      if (!isFocusBarHoveredRef.current) {
        setShowFocusBar(false);
      }
    }, 3000);
  }, []);

  const handleFocusMainMouseMove = useCallback(() => {
    setShowFocusBar(true);
    if (!isFocusBarHoveredRef.current) {
      startFocusBarTimer();
    }
  }, [startFocusBarTimer]);

  const handleFocusMainMouseLeave = useCallback(() => {
    if (!isFocusBarHoveredRef.current) {
      startFocusBarTimer();
    }
  }, [startFocusBarTimer]);

  const handleFocusBarMouseEnter = useCallback(() => {
    isFocusBarHoveredRef.current = true;
    setShowFocusBar(true);
    if (focusBarTimerRef.current) {
      clearTimeout(focusBarTimerRef.current);
      focusBarTimerRef.current = null;
    }
  }, []);

  const handleFocusBarMouseLeave = useCallback(() => {
    isFocusBarHoveredRef.current = false;
    startFocusBarTimer();
  }, [startFocusBarTimer]);

  useEffect(() => {
    if (focused) {
      setShowFocusBar(true);
      startFocusBarTimer();
    }
    return () => {
      if (focusBarTimerRef.current) {
        clearTimeout(focusBarTimerRef.current);
      }
    };
  }, [focused?.key, startFocusBarTimer]);

  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement === focusMainRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /** Fullscreens just the shared video — no filmstrip of people underneath. */
  function toggleFullscreen() {
    const element = focusMainRef.current;
    if (!element) return;
    if (windowFull) {
      setWindowFull(false);
    } else if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (element.requestFullscreen && document.fullscreenEnabled !== false) {
      void element.requestFullscreen().catch(() => setWindowFull(true));
    } else if (!("webkitEnterFullscreen" in (element.querySelector("video") ?? {}))) {
      setWindowFull(true);
    } else {
      // iOS Safari only fullscreens <video> elements.
      const video = element.querySelector("video") as
        | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
        | null;
      video?.webkitEnterFullscreen?.();
    }
  }

  function selfSpeaking(person: VoiceParticipant): boolean {
    const key = person.connectionId === connectionId ? "self" : person.connectionId;
    return voice.speaking.has(key);
  }

  return (
    <div
      className={`voice-stage${activityTakeover ? " activity-takeover" : ""}${
        activityTakeover && (activity?.kind === "deeppixel" || activity?.kind === "richup")
          ? " takeover-dark"
          : ""
      }${
        activityTakeover && peopleOpen ? " show-people" : ""
      }`}
    >
      {tableMenuOpen && <TableAudioMenu participants={participants} listenerId={connectionId} controls={voice} onClose={() => setTableMenuOpen(false)} />}
      {recording}
      {battlemap}
      <DiceOverlay roll={diceRoll || null} onDone={() => onDiceRollDone?.()} />
      <RoomActivities
        channelId={voice.channelId || ""}
        channelName={channelName}
        userId={userId}
        userName={userName}
        activity={activity}
        onActivity={onActivity}
        open={activitiesOpen}
        onOpen={setActivitiesOpen}
      />
      {participants.some((person) => person.important && !person.muted && !person.serverMuted) && (
        <div className="voice-important-banner" role="status"><Megaphone size={16} />
          <span>{participants.filter((p) => p.important && !p.muted && !p.serverMuted).map((p) => p.connectionId === connectionId ? "You" : p.displayName).join(", ")} · speaking important</span>
          {voice.important && <button type="button" onClick={voice.toggleImportant}>Finish</button>}
        </div>
      )}
      {stageMode && (
        <div className="stage-roster" role="status">
          <div className="stage-roster-group">
            <span className="stage-roster-label">On stage · {onStage.length}</span>
            {canManageStage ? (
              <span className="stage-roster-list">
                {onStage.length === 0 && <span className="stage-roster-names">Nobody yet</span>}
                {onStage.map((person) => {
                  const name = person.connectionId === connectionId ? "You" : person.displayName;
                  return (
                    <span key={person.connectionId} className="stage-roster-person">
                      {name}
                      <button
                        type="button"
                        className="stage-promote-btn"
                        onClick={() => voice.setStageSpeaker(person.connectionId, false)}
                        aria-label={`Move ${name} to the audience`}
                      >
                        Move down
                      </button>
                    </span>
                  );
                })}
              </span>
            ) : (
              <span className="stage-roster-names">
                {onStage.length
                  ? onStage
                      .map((p) => (p.connectionId === connectionId ? "You" : p.displayName))
                      .join(", ")
                  : "Nobody yet"}
              </span>
            )}
          </div>

          <div className="stage-roster-group">
            <span className="stage-roster-label">Audience · {audience.length}</span>
            {/* A host gets one control per person; everyone else gets a plain
                list, since a row of buttons they cannot use is noise. */}
            {canManageStage ? (
              <span className="stage-roster-list">
                {audience.length === 0 && <span className="stage-roster-names">Nobody yet</span>}
                {audience.map((person) => {
                  const name = person.connectionId === connectionId ? "You" : person.displayName;
                  return (
                    <span key={person.connectionId} className="stage-roster-person">
                      {name}
                      {person.handRaised && (
                        <Hand size={12} aria-hidden="true" className="tile-hand" />
                      )}
                      <button
                        type="button"
                        className="stage-promote-btn"
                        onClick={() => voice.setStageSpeaker(person.connectionId, true)}
                        aria-label={`Bring ${name} on stage`}
                      >
                        Bring up
                      </button>
                    </span>
                  );
                })}
              </span>
            ) : (
              <span className="stage-roster-names">
                {audience.length
                  ? audience
                      .map((p) => {
                        const name = p.connectionId === connectionId ? "You" : p.displayName;
                        // The hand is the only bit of this worth surfacing
                        // loudly; it is the whole reason the roster exists.
                        return p.handRaised ? `${name} ✋` : name;
                      })
                      .join(", ")
                  : "Nobody yet"}
              </span>
            )}
          </div>

          {amAudience && (
            <button
              type="button"
              className={`stage-hand-btn ${self?.handRaised ? "is-up" : ""}`}
              onClick={voice.toggleHand}
              // Hosts promote from the participant menu, which already owns
              // server-mute; this only asks.
              title="Ask the hosts for the floor"
            >
              <Hand size={14} aria-hidden="true" />
              {self?.handRaised ? "Lower hand" : "Raise hand"}
            </button>
          )}

          {!amAudience && self && (
            <span className="stage-roster-hint">
              {self.muted
                ? "You are on stage. Unmute to talk."
                : "You are on stage and everyone can hear you."}
            </span>
          )}
        </div>
      )}

      {!hideTopbar && (
        <div className="voice-stage-topbar">
          <div className="voice-stage-topbar-info flex items-center gap-2 min-w-0">
            <Volume2 size={16} className="voice-stage-volume-icon text-[var(--muted)] flex-shrink-0" />
            <div className="voice-stage-title-wrap min-w-0 flex items-center gap-2">
              <h2 className="voice-stage-title truncate">{channelName}</h2>
              {focused && (
                <>
                  <span className="voice-stage-topbar-divider text-[var(--muted)]/40 font-light select-none">/</span>
                  <div className="voice-stage-stream-badge flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--line)] text-xs text-[var(--ink)] font-semibold truncate">
                    <Monitor size={13} className="text-[var(--lavender)] flex-shrink-0" />
                    <span className="truncate">{streamerName}'s Screen</span>
                  </div>
                </>
              )}
              <span className="voice-stage-sub text-xs text-[var(--muted)] flex-shrink-0">· {participants.length} in call</span>
            </div>
          </div>

          <div className="voice-stage-topbar-actions flex items-center gap-2 flex-shrink-0">
            {focused && (
              <div className="voice-stream-quality-pill flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--panel)] border border-[var(--line)] shadow-sm">
                <button
                  type="button"
                  className="voice-quality-btn text-[11px] font-bold text-[var(--ink)] hover:text-[var(--lavender)] transition-colors cursor-pointer"
                  title="Click to cycle screen resolution & FPS"
                  onClick={() => {
                    const nextQ = nextScreenQuality(voice.screenQuality);
                    voice.setScreenQuality(nextQ);
                  }}
                >
                  {screenQualityLabel(voice.screenQuality)}
                </button>
                <span className="voice-live-badge-red text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#ed4245] text-white">
                  LIVE
                </span>
              </div>
            )}

            {onPopout && focused && (
              <button
                type="button"
                className="voice-stage-topbar-btn"
                onClick={onPopout}
                title="Pop out to floating movable preview"
              >
                <ExternalLink size={15} />
              </button>
            )}

            <div className="voice-view-switcher">
              {(["grid", "table", "map"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`voice-view-pill ${viewMode === mode ? "active" : ""}`}
                  onClick={() => {
                    handleViewModeChange(mode);
                    if (mode === "map" && onToggleBattlemap && !battlemapOpen) {
                      onToggleBattlemap();
                    } else if (mode !== "map" && onToggleBattlemap && battlemapOpen) {
                      onToggleBattlemap();
                    }
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="voice-stage-body">
        {!joined ? (
          <div className="voice-join-prompt">
            <div className="voice-join-icon"><Volume2 size={30} /></div>
            <strong>You're viewing {channelName}</strong>
            <p>
              Join the room to talk, share your camera, and take part in
              activities. You'll be asked to allow your microphone.
            </p>
            <button type="button" className="join-call-button" onClick={onJoin}>
              <Mic size={16} /> Join voice
            </button>
            <button type="button" className="voice-join-exit" onClick={onExit}>
              Back to chat
            </button>
          </div>
        ) : viewMode === "table" ? (
          <div className="voice-table-scene">
            <p className="voice-table-heading">VOICE TABLE</p>
            <div className="voice-table-wrapper">
              <div className="voice-table-ring">
                <div className="voice-table-surface">
                  <div className="voice-table-center-divider" />
                </div>
              </div>
              {participants.map((p, i) => {
                const isSpeaking = selfSpeaking(p);
                const positions = [
                  { top: "4%", left: "50%", transform: "translate(-50%, -50%)" },
                  { bottom: "4%", left: "50%", transform: "translate(-50%, 50%)" },
                  { left: "8%", top: "50%", transform: "translate(-50%, -50%)" },
                  { right: "8%", top: "50%", transform: "translate(50%, -50%)" },
                  { top: "18%", left: "20%", transform: "translate(-50%, -50%)" },
                  { top: "18%", right: "20%", transform: "translate(50%, -50%)" },
                  { bottom: "18%", left: "20%", transform: "translate(-50%, 50%)" },
                  { bottom: "18%", right: "20%", transform: "translate(50%, 50%)" },
                ];
                const pos = positions[i % positions.length];
                return (
                  <div
                    key={p.connectionId}
                    className="voice-table-seat"
                    style={pos as React.CSSProperties}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <Avatar
                        className={`table-seat-avatar ${isSpeaking ? "is-speaking" : ""}`}
                        avatar={p.avatar}
                        avatarUrl={p.avatarUrl}
                        color={p.color}
                      />
                      <span className="table-seat-name">
                        {p.connectionId === connectionId ? "You" : p.displayName}
                      </span>
                      {seatTime(p, "table-seat-time")}
                      {isSpeaking && (
                        <span className="text-[10px] text-[var(--lavender)] font-bold">speaking</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="voice-table-note">
              Everyone at the table hears each other equally. Move away to create distance.
            </p>
          </div>
        ) : focused ? (
          <div className={`voice-focus ${theater ? "theater" : ""}`}>
            <div
              className={`voice-focus-main ${windowFull ? "window-full" : ""}`}
              ref={focusMainRef}
              onMouseMove={handleFocusMainMouseMove}
              onMouseLeave={handleFocusMainMouseLeave}
              onClick={() => {
                if (!isFullscreen && !windowFull) setFocusedKey(null);
              }}
              title={isFullscreen || windowFull ? undefined : "Click to return to the grid"}
            >
              <VideoSurface stream={focused.stream} mirrored={focused.mirrored} />

              {/* Discord-style bottom-left pill on the video (Screenshot 3) */}
              <div className="voice-video-streamer-pill" onClick={(e) => e.stopPropagation()}>
                <Monitor size={14} className="text-white/90" />
                <span>{streamerName}</span>
              </div>

              {/* Video control overlays */}
              <div
                className={`voice-focus-bar ${!showFocusBar ? "is-hidden" : ""}`}
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={handleFocusBarMouseEnter}
                onMouseLeave={handleFocusBarMouseLeave}
              >
                <span className="voice-live-badge-red text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#ed4245] text-white">LIVE</span>
                <span className="voice-focus-stream-title truncate max-w-[200px]">{streamerName}'s Screen</span>

                {/* Watcher Stream Audio Volume Slider */}
                {focused.videoKind === "screen" && !focused.self && (
                  (() => {
                    const pref = streamPreferenceFor ? streamPreferenceFor(focused.stream.id, focusedPerson?.id) : { volume: 100, muted: false };
                    return (
                      <div
                        className="voice-focus-volume flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="hover:text-[var(--lavender)] transition-colors p-0.5 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleStreamMute?.(focused.stream.id, focusedPerson?.id);
                          }}
                          title={pref.muted ? "Unmute stream audio" : `Stream audio: ${pref.volume}% (Click to mute)`}
                        >
                          {pref.muted || pref.volume === 0 ? (
                            <VolumeX size={14} className="text-rose-400" />
                          ) : pref.volume < 50 ? (
                            <Volume1 size={14} />
                          ) : (
                            <Volume2 size={14} />
                          )}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={200}
                          step={1}
                          value={pref.muted ? 0 : pref.volume}
                          onChange={(e) => {
                            e.stopPropagation();
                            onSetStreamVolume?.(focused.stream.id, focusedPerson?.id, Number(e.target.value));
                          }}
                          className="w-16 accent-[var(--lavender)] h-1 cursor-pointer"
                          title={`Stream volume: ${pref.muted ? "Muted" : `${pref.volume}%`}`}
                        />
                        <span className="text-[10px] font-mono w-7 text-right select-none text-white/90">
                          {pref.muted ? "0%" : `${pref.volume}%`}
                        </span>
                      </div>
                    );
                  })()
                )}

                {/* Streamer Mute Own Stream Audio Button */}
                {focused.videoKind === "screen" && focused.self && (
                  <button
                    type="button"
                    className={`voice-focus-full ${voice.screenAudioMuted ? "text-amber-400" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      voice.toggleScreenAudio?.();
                    }}
                    title={voice.screenAudioMuted ? "Unmute stream audio" : "Mute stream audio"}
                  >
                    {voice.screenAudioMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                )}

                {focused.remoteId && (
                  <button
                    type="button"
                    className="voice-focus-full"
                    onClick={(event) => {
                      event.stopPropagation();
                      hideTile(focused, true);
                    }}
                    title="Stop receiving this video (saves data)"
                  >
                    <EyeOff size={15} />
                  </button>
                )}
                {!isFullscreen && !windowFull && (
                  <button
                    type="button"
                    className={`voice-focus-full ${theater ? "active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleTheater();
                    }}
                    aria-label={theater ? "Show people" : "Hide people"}
                    title={theater ? "Show people" : "Hide people"}
                  >
                    <Users size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="voice-focus-full"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFullscreen();
                  }}
                  aria-label={isFullscreen || windowFull ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isFullscreen || windowFull ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              </div>
            </div>

            {/* Bottom filmstrip with participant tiles and active screenshare (Screenshot 3) */}
            <div className="voice-filmstrip">
              {videoTiles.map((tile) => {
                const isStreamerSpeaking = tile.remoteId ? voice.speaking.has(tile.remoteId) : voice.speaking.has("self");
                const tilePerson = tile.remoteId ? participants.find((p) => p.connectionId === tile.remoteId) : self;
                const tileName = tilePerson?.displayName || (tile.self ? "You" : tile.label);
                return (
                  <button
                    type="button"
                    key={tile.key}
                    className={`film-tile video-film-tile ${tile.key === focusedKey ? "active" : ""} ${isStreamerSpeaking ? "is-speaking" : ""}`}
                    onClick={() => setFocusedKey(tile.key)}
                  >
                    <div className="film-video-wrap">
                      <TileVideo tile={tile} onHide={hideTile} />
                    </div>
                    <span className="film-live-pill">LIVE</span>
                    <span className="film-tile-label truncate">
                      <Monitor size={11} className="inline mr-1" />
                      {tileName}
                    </span>
                  </button>
                );
              })}

              {participants.map((person) => {
                const isSpeaking = selfSpeaking(person);
                return (
                  <div
                    className={`film-tile avatar-film ${isSpeaking ? "is-speaking" : ""}`}
                    key={`a:${person.connectionId}`}
                    onContextMenu={(event) => {
                      if (person.connectionId === connectionId) return;
                      onOpenParticipantMenu?.(event, person);
                    }}
                  >
                    <div className="avatar-film-center">
                      <Avatar
                        className={`film-avatar ${isSpeaking ? "is-speaking" : ""}`}
                        avatar={person.avatar}
                        avatarUrl={person.avatarUrl}
                        color={person.color}
                      />
                    </div>
                    <div className="film-person-footer">
                      {person.muted && !person.bot && (
                        <MicOff size={11} className="film-person-muted-icon" />
                      )}
                      <span className="film-person-name truncate">
                        {person.connectionId === connectionId ? "You" : person.displayName}
                      </span>
                    </div>
                    {seatTime(person, "film-voice-time")}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            ref={wrapperRef}
            className={`voice-grid tiles-${Math.min(
              videoTiles.length + participants.length,
              6,
            )}`}
          >
            {videoTiles.map((tile) => (
              <figure
                key={tile.key}
                className={`stage-tile video-tile ${tile.connecting ? "tile-connecting" : ""}`}
                onClick={() => !tile.hidden && setFocusedKey(tile.key)}
                title={tile.hidden ? undefined : "Click to focus"}
              >
                <TileVideo tile={tile} onHide={hideTile} />
                <figcaption>
                  <span className="tile-live">
                    <span className="live-dot" /> {tile.label}
                  </span>
                </figcaption>
              </figure>
            ))}

            {participants.map((person) => {
              const speaking = selfSpeaking(person);
              return (
                <figure
                  key={person.connectionId}
                  className={`stage-tile avatar-tile ${speaking ? "is-speaking" : ""}`}
                  onContextMenu={(event) => {
                    if (person.connectionId === connectionId) return;
                    onOpenParticipantMenu?.(event, person);
                  }}
                >
                  <div className="avatar-tile-inner">
                    <Avatar
                      className="stage-avatar"
                      avatar={person.avatar}
                      avatarUrl={person.avatarUrl}
                      color={person.color}
                    />
                  </div>
                  <figcaption>
                    <span>
                      {person.connectionId === connectionId
                        ? "You"
                        : person.displayName}
                    </span>
                    {seatTime(person, "tile-voice-time")}
                    {person.important && !person.muted && !person.serverMuted && <span className="table-dm-badge" title="Speaking important"><Megaphone size={13} /> Important</span>}
                    {person.muted && !person.bot && (
                      <span
                        className="tile-muted"
                        title={person.serverMuted ? "Muted for everyone" : "Muted"}
                      >
                        <MicOff size={14} />
                      </span>
                    )}
                    {person.handRaised && (
                      // Shown next to the mute badge rather than replacing it:
                      // a hand up is always accompanied by a mute, so the two
                      // together are what "wants the floor" looks like.
                      <span className="tile-hand" title="Raised hand">
                        <Hand size={14} />
                      </span>
                    )}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </div>

      {soundboardOpen && (
        <SoundboardDrawer
          serverId={serverId}
          channelId={voice.channelId}
          canManage={canManageSounds}
        />
      )}

      {activityTakeover && (
        <button
          type="button"
          className="activity-people-pill"
          onClick={() => setPeopleOpen((open) => !open)}
          aria-expanded={peopleOpen}
          aria-label={peopleOpen ? "Hide people" : "Show people in the call"}
        >
          {peopleOpen ? <PeopleDown size={14} /> : <PeopleUp size={14} />}
          <Users size={15} />
          <span>{participants.length}</span>
        </button>
      )}

      <div className="voice-stage-bottom-bar">
        <div className="voice-ctrls-centered">
          <button
            type="button"
            className={`vctrl-btn ${voice.tableMode ? "active" : ""}`}
            aria-label="Your table"
            onClick={() => setTableMenuOpen(true)}
            title="Your Table"
          >
            <SlidersHorizontal size={18} />
          </button>
          <button
            type="button"
            className={`vctrl-btn ${voice.important ? "active" : ""}`}
            aria-label="Speak important"
            onClick={voice.toggleImportant}
            disabled={voice.muted || voice.deafened || voice.forcedMute}
            title="Speak Important"
          >
            <Megaphone size={18} />
          </button>

          <div className="vctrl-divider" />

          <button
            type="button"
            className={`vctrl-btn ${voice.muted ? "danger" : ""}`}
            onClick={voice.toggleMute}
            disabled={voice.forcedMute}
            title={voice.muted ? "Unmute" : "Mute"}
          >
            {voice.muted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            type="button"
            className={`vctrl-btn ${voice.deafened ? "danger" : ""}`}
            onClick={voice.toggleDeafen}
            title={voice.deafened ? "Undeafen" : "Deafen"}
          >
            {voice.deafened ? <VolumeX size={18} /> : <Headphones size={18} />}
          </button>
          <div className="relative inline-flex items-center">
            <button
              type="button"
              className={`vctrl-btn ${voice.cameraOn ? "active" : ""}`}
              onClick={() =>
                voice.cameraOn ? voice.stopCamera() : void voice.startCamera()
              }
              title={voice.cameraOn ? "Turn camera off" : "Turn camera on"}
            >
              {voice.cameraOn ? <VideoOff size={18} /> : <Video size={18} />}
            </button>
            <button
              type="button"
              className={`vctrl-btn-mini ${voice.cameraBackground && voice.cameraBackground !== "none" ? "highlight" : ""}`}
              onClick={() => setCameraBgMenuOpen((o) => !o)}
              title="Camera Virtual Backgrounds & Effects"
            >
              <Sparkles size={11} />
            </button>
            {cameraBgMenuOpen && (
              <div className="camera-bg-popover absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50">
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--line)] bg-[var(--panel)]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--ink)]">Camera Effects</span>
                  </div>
                  <button
                    type="button"
                    className="popup-close-x"
                    onClick={() => setCameraBgMenuOpen(false)}
                    aria-label="Close camera effects"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Tab Switcher */}
                <div className="flex items-center gap-1 p-2 border-b border-[var(--line)] bg-[var(--paper)]">
                  <button
                    type="button"
                    className={`camera-bg-tab flex-1 flex items-center justify-center gap-1.5 ${cameraTab === "blur" ? "active" : ""}`}
                    onClick={() => setCameraTab("blur")}
                  >
                    <span>✨</span>
                    <span>Bokeh Blur</span>
                  </button>
                  <button
                    type="button"
                    className={`camera-bg-tab flex-1 flex items-center justify-center gap-1.5 ${cameraTab === "images" ? "active" : ""}`}
                    onClick={() => setCameraTab("images")}
                  >
                    <span>🖼️</span>
                    <span>Backdrops</span>
                  </button>
                  <button
                    type="button"
                    className={`camera-bg-tab flex-1 flex items-center justify-center gap-1.5 ${cameraTab === "fx" ? "active" : ""}`}
                    onClick={() => setCameraTab("fx")}
                  >
                    <span>🎨</span>
                    <span>FX</span>
                  </button>
                </div>

                {/* Tab Content */}
                <div className="p-3 overflow-y-auto max-h-[320px] space-y-3">
                  {cameraTab === "blur" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                            voice.cameraBackground === "blur"
                              ? "bg-[var(--lavender)] text-white shadow-md"
                              : "bg-[var(--panel)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--lavender)]"
                          }`}
                          onClick={() => voice.setCameraBackground?.("blur")}
                        >
                          {voice.cameraBackground === "blur" ? "✓ Bokeh Blur Active" : "Enable Bokeh Blur"}
                        </button>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[var(--panel)] border border-[var(--line)] space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[var(--ink)]">Blur Strength</span>
                          <span className="font-mono text-[var(--lavender)] font-bold">{voice.cameraBlurAmount || 14}px</span>
                        </div>
                        <input
                          type="range"
                          min="4"
                          max="32"
                          step="2"
                          value={voice.cameraBlurAmount || 14}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            voice.setCameraBlurAmount?.(val);
                            if (voice.cameraBackground !== "blur") {
                              voice.setCameraBackground?.("blur");
                            }
                          }}
                          className="w-full h-1.5 cursor-pointer accent-[var(--lavender)] rounded-lg"
                        />
                        <div className="grid grid-cols-4 gap-1.5 pt-1">
                          {[
                            { label: "Subtle", val: 8 },
                            { label: "Normal", val: 14 },
                            { label: "Heavy", val: 22 },
                            { label: "Deep", val: 30 },
                          ].map((b) => (
                            <button
                              key={b.val}
                              type="button"
                              className={`py-1 text-[10px] rounded-lg border transition-all ${
                                (voice.cameraBlurAmount || 14) === b.val
                                  ? "bg-[var(--lavender)]/20 border-[var(--lavender)] text-[var(--lavender)] font-bold"
                                  : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] bg-[var(--paper)]"
                              }`}
                              onClick={() => {
                                voice.setCameraBlurAmount?.(b.val);
                                if (voice.cameraBackground !== "blur") {
                                  voice.setCameraBackground?.("blur");
                                }
                              }}
                            >
                              {b.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                        Client-side AI segmentation cleanly cuts around your person, leaving you sharp while beautifully blurring your room.
                      </p>
                    </div>
                  )}

                  {cameraTab === "images" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--ink)]">Virtual Backgrounds</span>
                        <button
                          type="button"
                          className="text-xs font-medium text-[var(--lavender)] hover:underline flex items-center gap-1"
                          onClick={() => bgFileInputRef.current?.click()}
                        >
                          <span>＋</span>
                          <span>Upload Image</span>
                        </button>
                        <input
                          ref={bgFileInputRef}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={handleBgUpload}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Custom Upload Tile */}
                        <div
                          className="camera-bg-tile border-dashed border-[var(--lavender)]/40 flex flex-col items-center justify-center gap-1 p-2 text-center hover:bg-[var(--lavender)]/10"
                          onClick={() => bgFileInputRef.current?.click()}
                          title="Upload custom image from your device"
                        >
                          <span className="text-lg">📁</span>
                          <span className="text-[10px] font-semibold text-[var(--lavender)]">Upload Image</span>
                        </div>

                        {/* Custom User Uploaded Backgrounds */}
                        {customBgs.map((custom) => {
                          const isSelected = voice.cameraBackground === "image" && voice.cameraBackgroundImage === custom.id;
                          return (
                            <div
                              key={custom.id}
                              className={`camera-bg-tile ${isSelected ? "active" : ""}`}
                              onClick={() => {
                                voice.setCameraBackground?.("image");
                                voice.setCameraBackgroundImage?.(custom.id);
                              }}
                              title={custom.name}
                            >
                              <img src={custom.dataUrl} alt={custom.name} />
                              <span className="absolute bottom-1 left-1.5 text-[9px] font-semibold text-white bg-black/60 px-1 py-0.5 rounded truncate max-w-[85%]">
                                {custom.name}
                              </span>
                              {isSelected && (
                                <span className="absolute top-1 left-1.5 w-4 h-4 rounded-full bg-[var(--lavender)] text-white text-[10px] flex items-center justify-center font-bold">
                                  ✓
                                </span>
                              )}
                              <button
                                type="button"
                                className="camera-bg-delete-btn"
                                onClick={(e) => handleDeleteCustomBg(custom.id, e)}
                                title="Delete background"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}

                        {/* Built-in Preset Images */}
                        {BUILTIN_BACKGROUND_IMAGES.map((preset) => {
                          const isSelected = voice.cameraBackground === "image" && voice.cameraBackgroundImage === preset.id;
                          return (
                            <div
                              key={preset.id}
                              className={`camera-bg-tile ${isSelected ? "active" : ""}`}
                              onClick={() => {
                                voice.setCameraBackground?.("image");
                                voice.setCameraBackgroundImage?.(preset.id);
                              }}
                              title={`${preset.name} - ${preset.description}`}
                            >
                              <img src={preset.svgDataUri} alt={preset.name} />
                              <span className="absolute bottom-1 left-1.5 text-[9px] font-semibold text-white bg-black/60 px-1 py-0.5 rounded truncate max-w-[85%] flex items-center gap-1">
                                <span>{preset.emoji}</span>
                                <span>{preset.name}</span>
                              </span>
                              {isSelected && (
                                <span className="absolute top-1 left-1.5 w-4 h-4 rounded-full bg-[var(--lavender)] text-white text-[10px] flex items-center justify-center font-bold">
                                  ✓
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {cameraTab === "fx" && (
                    <div className="space-y-1.5">
                      {[
                        { id: "studio" as const, name: "Studio Spotlight", emoji: "🎙️", badge: "Warm" },
                        { id: "cyberpunk" as const, name: "Neon Cyberpunk", emoji: "🌆", badge: "Cyber" },
                        { id: "sunset" as const, name: "Golden Sunset", emoji: "🌅", badge: "Sunset" },
                        { id: "matrix" as const, name: "Digital Matrix", emoji: "🟩", badge: "Matrix" },
                        { id: "cosmos" as const, name: "Deep Space", emoji: "🌌", badge: "Cosmic" },
                      ].map((preset) => {
                        const isSelected = voice.cameraBackground === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors text-left ${
                              isSelected
                                ? "bg-[var(--lavender)] text-white font-medium shadow-sm"
                                : "text-[var(--ink)] hover:bg-[var(--panel)] border border-transparent"
                            }`}
                            onClick={() => voice.setCameraBackground?.(preset.id)}
                          >
                            <span className="flex items-center gap-2.5">
                              <span className="text-base leading-none">{preset.emoji}</span>
                              <span className="font-medium">{preset.name}</span>
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                              isSelected ? "bg-white/20 text-white" : "bg-[var(--line)] text-[var(--muted)]"
                            }`}>
                              {preset.badge}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="p-2 border-t border-[var(--line)] bg-[var(--panel)] flex items-center justify-between">
                  <button
                    type="button"
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                      voice.cameraBackground === "none"
                        ? "text-[var(--muted)] cursor-default"
                        : "text-[var(--coral)] hover:bg-[var(--coral)]/10 font-semibold"
                    }`}
                    disabled={voice.cameraBackground === "none"}
                    onClick={() => voice.setCameraBackground?.("none")}
                  >
                    🚫 Turn Off Effects
                  </button>
                  <span className="text-[10px] text-[var(--muted)] font-mono">
                    Active: {voice.cameraBackground || "none"}
                  </span>
                </div>
              </div>
            )}
          </div>
          {/* Screen Share Button & Options Popover */}
          <div className="relative inline-flex items-center">
            <button
              type="button"
              className={`vctrl-btn ${voice.screenSharing ? "active" : ""}`}
              onClick={() => {
                if (voice.screenSharing) {
                  voice.stopScreenShare();
                } else {
                  setScreenSharePopoverOpen((o) => !o);
                }
              }}
              title={voice.screenSharing ? "Stop sharing screen" : "Share screen"}
            >
              <Monitor size={18} />
            </button>

            {/* If streamer is sharing screen, show stream audio mute toggle right here in the dock! */}
            {voice.screenSharing && (
              <button
                type="button"
                className={`vctrl-btn ml-1 ${voice.screenAudioMuted ? "text-amber-400 bg-amber-500/10" : ""}`}
                onClick={voice.toggleScreenAudio}
                title={voice.screenAudioMuted ? "Unmute stream audio" : "Mute stream audio"}
              >
                {voice.screenAudioMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}

            {/* Screen share setup popover when starting to share */}
            {screenSharePopoverOpen && !voice.screenSharing && (
              <ScreenShareSetup
                className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 min-w-[300px]"
                quality={voice.screenQuality}
                onQuality={voice.setScreenQuality}
                film={voice.screenFilm ?? false}
                onFilm={(film) => voice.setScreenFilm?.(film)}
                audio={voice.screenShareAudio ?? true}
                onAudio={(audio) => voice.setScreenShareAudio?.(audio)}
                onClose={() => setScreenSharePopoverOpen(false)}
                onStart={() => {
                  setScreenSharePopoverOpen(false);
                  void voice.startScreenShare(voice.screenQuality, voice.screenShareAudio ?? true, voice.screenFilm ?? false);
                }}
              />
            )}
          </div>

          <div className="vctrl-divider" />

          <button
            type="button"
            className={`vctrl-btn ${!focused ? "active" : ""}`}
            onClick={() => setFocusedKey(focused ? null : (videoTiles[0]?.key || null))}
            title={focused ? "Show all participants in grid" : "Focus active stream"}
          >
            <LayoutGrid size={18} />
          </button>

          <button
            type="button"
            className={`vctrl-btn ${activitiesOpen ? "active" : ""}`}
            onClick={() => setActivitiesOpen((open) => !open)}
            title="Activities"
          >
            <Sparkles size={18} />
          </button>

          {/* More Options Popover Menu */}
          <div className="relative inline-flex items-center">
            <button
              type="button"
              className={`vctrl-btn ${moreMenuOpen ? "active" : ""}`}
              onClick={() => setMoreMenuOpen((o) => !o)}
              title="More call options"
            >
              <MoreHorizontal size={18} />
            </button>
            {moreMenuOpen && (
              <div className="vctrl-more-popover absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 p-1.5 rounded-xl bg-[var(--panel)] border border-[var(--line)] shadow-xl flex flex-col gap-1 min-w-[180px]">
                <button
                  type="button"
                  className="vctrl-more-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                  onClick={() => {
                    setSoundboardOpen((o) => !o);
                    setMoreMenuOpen(false);
                  }}
                >
                  <Volume2 size={15} className="text-[var(--lavender)]" />
                  <span>{soundboardOpen ? "Close Soundboard" : "Soundboard"}</span>
                </button>
                <button
                  type="button"
                  className="vctrl-more-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                  onClick={() => {
                    handleViewModeChange(viewMode === "table" ? "grid" : "table");
                    setMoreMenuOpen(false);
                  }}
                >
                  <Volume1 size={15} className="text-[var(--mint)]" />
                  <span>Voice Table</span>
                </button>
                {onToggleBattlemap && (
                  <button
                    type="button"
                    className="vctrl-more-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                    onClick={() => {
                      const next = viewMode === "map" ? "grid" : "map";
                      handleViewModeChange(next);
                      onToggleBattlemap();
                      setMoreMenuOpen(false);
                    }}
                  >
                    <Map size={15} className="text-[var(--coral)]" />
                    <span>Battlemap</span>
                  </button>
                )}
                {onClip && (
                  <button
                    type="button"
                    className="vctrl-more-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] transition-colors text-left"
                    disabled={clipping === "working"}
                    onClick={async () => {
                      setMoreMenuOpen(false);
                      setClipping("working");
                      try {
                        const clip = await voice.takeClip();
                        if (clip && onClip) {
                          await onClip(clip);
                          setClipping("done");
                          window.setTimeout(() => setClipping("idle"), 2500);
                        } else {
                          setClipping("idle");
                        }
                      } catch {
                        setClipping("idle");
                      }
                    }}
                  >
                    <Scissors size={15} className="text-amber-400" />
                    <span>Clip Last {voice.clipSeconds}s</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="vctrl-divider" />

          <button
            type="button"
            className="vctrl-btn danger active disconnect-pill-btn"
            onClick={() => (joined ? voice.leave() : onExit?.())}
            title={joined ? "Disconnect" : "Close"}
          >
            <PhoneOff size={18} />
          </button>

          <div className="vctrl-divider" />

          {onPopout && (
            <button
              type="button"
              className="vctrl-btn"
              onClick={onPopout}
              title="Pop out into floating movable preview"
            >
              <ExternalLink size={17} />
            </button>
          )}

          <button
            type="button"
            className="vctrl-btn"
            onClick={toggleFullscreen}
            title={isFullscreen || windowFull ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen || windowFull ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
        {clipping === "done" && (
          <p className="voice-clip-saved-toast animate-pulse">✂ clip saved!</p>
        )}
      </div>
    </div>
  );
}

/** The soundboard: browse and play presets or server clips; upload new ones; adjust volume. */
export function SoundboardDrawer({
  serverId,
  channelId,
  canManage,
  onClose,
}: {
  serverId: string | null;
  channelId: string | null;
  canManage: boolean;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<"presets" | "server">("presets");
  const [search, setSearch] = useState("");
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [uploading, setUploading] = useState(false);
  const [personalUpload, setPersonalUpload] = useState(false);
  const [volume, setVolume] = useState<number>(() => {
    if (typeof localStorage === "undefined") return 0.7;
    const v = parseFloat(localStorage.getItem("huddle_soundboard_volume") || "0.7");
    return isNaN(v) ? 0.7 : Math.max(0, Math.min(1, v));
  });
  const [recentlyPlayed, setRecentlyPlayed] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    try {
      localStorage.setItem("huddle_soundboard_volume", newVol.toString());
    } catch {
      // ignore
    }
  };

  const load = useRef<() => void>(() => {});
  load.current = () => {
    if (!serverId) return;
    apiFetch<{ sounds: Sound[] }>(
      `/api/sounds?serverId=${encodeURIComponent(serverId)}`,
    )
      .then((data) => setSounds(data.sounds || []))
      .catch(() => undefined);
  };
  useEffect(() => {
    load.current();
  }, [serverId]);

  function playSoundboardItem(soundId: string, name: string) {
    if (!channelId) return;
    setRecentlyPlayed(soundId);
    window.setTimeout(() => setRecentlyPlayed(null), 600);
    void apiFetch("/api/sounds/play", {
      method: "POST",
      body: JSON.stringify({ channelId, soundId }),
    }).catch(() => undefined);
  }

  function previewPreset(presetId: string, e: React.MouseEvent) {
    e.stopPropagation();
    playPresetSound(presetId, volume);
  }

  function previewCustom(url: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const audio = new Audio(url);
      audio.volume = volume;
      void audio.play().catch(() => undefined);
    } catch {
      // ignore
    }
  }

  async function upload(file: File | undefined | null) {
    if (!file || !serverId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploaded = await apiFetch<{ key: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      await apiFetch("/api/sounds", {
        method: "POST",
        body: JSON.stringify({
          serverId,
          key: uploaded.key,
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 40),
          personal: personalUpload,
        }),
      });
      load.current();
    } catch {
      // Upload failures are surfaced by the picker being empty.
    } finally {
      setUploading(false);
    }
  }

  async function remove(sound: Sound, e: React.MouseEvent) {
    e.stopPropagation();
    await apiFetch(`/api/sounds?id=${encodeURIComponent(sound.id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    load.current();
  }

  const filteredPresets = SOUNDBOARD_PRESETS.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSounds = sounds.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="soundboard">
      <div className="soundboard-header-bar flex items-center justify-between gap-2 w-full pb-2 mb-1 border-b border-[var(--line)]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`soundboard-tab-btn ${tab === "presets" ? "active" : ""}`}
            onClick={() => setTab("presets")}
          >
            Instant Presets ({SOUNDBOARD_PRESETS.length})
          </button>
          <button
            type="button"
            className={`soundboard-tab-btn ${tab === "server" ? "active" : ""}`}
            onClick={() => setTab("server")}
          >
            Server Clips ({sounds.length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="soundboard-volume-wrap flex items-center gap-1.5" title={`Soundboard Volume: ${Math.round(volume * 100)}%`}>
            {volume === 0 ? <VolumeX size={14} className="text-[var(--muted)]" /> : volume < 0.5 ? <Volume1 size={14} className="text-[var(--muted)]" /> : <Volume2 size={14} className="text-[var(--muted)]" />}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="soundboard-volume-slider w-16 h-1 cursor-pointer accent-[var(--lavender)]"
            />
            <span className="text-[10px] text-[var(--muted)] w-6 font-mono">{Math.round(volume * 100)}%</span>
          </div>

          <div className="relative flex items-center">
            <Search size={12} className="absolute left-2 text-[var(--muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search sounds..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="soundboard-search-input pl-6 pr-2 py-0.5 text-xs rounded-md bg-[var(--paper)] border border-[var(--line)] w-28 focus:w-36 transition-all outline-none"
            />
          </div>

          {onClose && (
            <button
              type="button"
              className="popup-close-x"
              onClick={onClose}
              aria-label="Close soundboard"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="soundboard-grid flex flex-wrap gap-2 w-full">
        {tab === "presets" && (
          <>
            {filteredPresets.map((preset) => (
              <div key={preset.id} className="soundboard-pad-wrap">
                <button
                  type="button"
                  className={`soundboard-pad ${recentlyPlayed === `preset:${preset.id}` ? "played" : ""}`}
                  onClick={() => playSoundboardItem(`preset:${preset.id}`, preset.name)}
                  title={`${preset.name} - ${preset.description}\n(Click to play to room)`}
                >
                  <span className="soundboard-emoji">{preset.emoji}</span>
                  <span className="soundboard-name">{preset.name}</span>
                </button>
                <button
                  type="button"
                  className="soundboard-preview-btn"
                  title="Preview for only you"
                  onClick={(e) => previewPreset(preset.id, e)}
                >
                  <Play size={10} />
                </button>
              </div>
            ))}
            {filteredPresets.length === 0 && (
              <p className="soundboard-empty">No preset sounds match &ldquo;{search}&rdquo;</p>
            )}
          </>
        )}

        {tab === "server" && (
          <>
            {filteredSounds.map((sound) => (
              <div key={sound.id} className="soundboard-pad-wrap">
                <button
                  type="button"
                  className={`soundboard-pad ${sound.personal ? "personal" : ""} ${recentlyPlayed === sound.id ? "played" : ""}`}
                  onClick={() => playSoundboardItem(sound.id, sound.name)}
                  title={`${sound.name}${sound.personal ? " (your pack)" : ""}\n(Click to play to room)`}
                >
                  <span className="soundboard-emoji">{sound.emoji}</span>
                  <span className="soundboard-name">{sound.name}</span>
                </button>
                <button
                  type="button"
                  className="soundboard-preview-btn"
                  title="Preview for only you"
                  onClick={(e) => previewCustom(sound.url, e)}
                >
                  <Play size={10} />
                </button>
                {(canManage || sound.personal) && (
                  <button
                    type="button"
                    className="soundboard-delete"
                    title={`Delete ${sound.name}`}
                    onClick={(e) => void remove(sound, e)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {(canManage || true) && (
              <button
                type="button"
                className="soundboard-pad add"
                disabled={uploading || !serverId}
                onClick={() => fileRef.current?.click()}
              >
                <span className="soundboard-emoji">{uploading ? "…" : "＋"}</span>
                <span className="soundboard-name">Upload</span>
              </button>
            )}
            {filteredSounds.length === 0 && sounds.length === 0 && (
              <p className="soundboard-empty">No custom sounds yet. Click upload to add audio clips!</p>
            )}
            {filteredSounds.length === 0 && sounds.length > 0 && (
              <p className="soundboard-empty">No server sounds match &ldquo;{search}&rdquo;</p>
            )}
            <div className="soundboard-upload-options w-full mt-1">
              <label className="soundboard-personal-toggle">
                <input
                  type="checkbox"
                  checked={personalUpload}
                  onChange={(event) => setPersonalUpload(event.target.checked)}
                />
                <span>Add to my personal pack</span>
              </label>
            </div>
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
