"use client";

import { useSpeaking } from "../lib/speaking-store";
import { setWindowFullscreen } from "../lib/fullscreen";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Megaphone, Volume2, Volume1, VolumeX, Play, Search, Users, X, ChevronUp as PeopleUp, ChevronDown as PeopleDown } from "lucide-react";
import { SOUNDBOARD_PRESETS, playPresetSound } from "@/lib/soundboard-presets";
import { loadCustomBackgrounds, saveCustomBackground, deleteCustomBackground, type CustomBackgroundItem } from "../lib/virtual-background";
import type { PlayerState, VoiceParticipant } from "@/lib/protocol";
import type { DiceRollEvent } from "@/lib/protocol";
import { DEEPPIXEL_FROM_GAME, type RoomActivity } from "@/lib/activities";
import { videoAllowedFrom } from "../hooks/use-voice";
import { apiFetch } from "../lib/client";
import { TableAudioMenu } from "./table-audio-menu";
import { isOnStage, splitStageRoster } from "@/lib/stage";
import { DiceOverlay } from "./dice-overlay";
import { RoomActivities } from "./room-activities";
import { VoiceDuration } from "./voice-duration";
import { LiveCaptionsOverlay } from "./live-captions";
import { QaBanner, QaPanel } from "./qa-panel";
import { useQa } from "../hooks/use-qa";
import type { LiveCaptions } from "../hooks/use-live-captions";
import type { LivingRoom } from "../hooks/use-living-room";
import { LivingRoomView } from "./living-room";
import { Sound, VoiceApi, VideoTile } from "./voice-stage/types";
import { hasLiveVideo } from "./voice-stage/tiles";
import { StageRoster } from "./voice-stage/stage-roster";
import { StageTopbar } from "./voice-stage/stage-topbar";
import { StageBody } from "./voice-stage/stage-body";
import { StageBottomBar } from "./voice-stage/stage-bottom-bar";





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
  /** May walk into the cinema's projection booth and run the show from it. */
  canProject?: boolean;
  /**
   * This room is a stage: it has an audience, so participants are split into
   * those whose mic is live and those watching, and the watchers can ask for
   * the floor.
   */
  stageMode?: boolean;
  /** False when moderators switched this room's soundboard off. */
  soundboardEnabled?: boolean;
  /** Live captions, when the viewer is seated in this room. */
  captions?: LiveCaptions;
  /** The shared 3D living room, when the viewer is seated in this room. */
  livingRoom?: LivingRoom;
  /** The room's music player, shown on the Living Room TV. */
  nowPlaying?: PlayerState | null;
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
  /** Runs a slash command as the viewer; the tabletop's dice tray uses it for /roll and /spell. */
  onRollCommand?: (command: string) => void;
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
  canProject = false,
  stageMode = false,
  soundboardEnabled = true,
  captions,
  livingRoom,
  nowPlaying = null,
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
  onRollCommand,
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
  const speakingIds = useSpeaking(voice.speakingStore);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);
  const qa = useQa(joined ? voice.channelId : null, Boolean(joined));
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
  // In the living room's board hall the game docks beside the 3D board instead of taking the stage over.
  const boardHall = Boolean(livingRoom?.open && livingRoom.venue === "boardhall" && joined && !stageMode && activity?.kind === "deeppixel");
  const boardDock = boardHall && activitiesOpen;
  // In the board hall the game is played from the hall's own menu: once the lobby turns into a game, fold the panel away.
  const boardHallRef = useRef(boardHall);
  boardHallRef.current = boardHall;
  useEffect(() => {
    let lastState: string | null = null;
    const onGame = (event: Event) => {
      const data = (event as CustomEvent<{ type?: string; state?: string | null }>).detail;
      if (data?.type !== "state") return;
      if (boardHallRef.current && lastState === "lobby" && data.state === "playing") setActivitiesOpen(false);
      lastState = data.state ?? null;
    };
    window.addEventListener(DEEPPIXEL_FROM_GAME, onGame);
    return () => window.removeEventListener(DEEPPIXEL_FROM_GAME, onGame);
  }, []);
  const playBoardGame = useCallback(async () => {
    if (activity) { setActivitiesOpen(true); return; }
    const channelId = voice.channelId;
    if (!channelId) return;
    try {
      const data = await apiFetch<{ activity: RoomActivity | null }>("/api/activities", {
        method: "POST",
        body: JSON.stringify({ channelId, action: "open", kind: "deeppixel", state: {} }),
      });
      onActivity(data.activity);
      setActivitiesOpen(true);
    } catch {
      // The activities panel says why; open it so it can.
      setActivitiesOpen(true);
    }
  }, [activity, voice.channelId, onActivity]);
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
  const { onStage, audience: seated } = stageMode
    ? splitStageRoster(participants)
    : { onStage: [] as VoiceParticipant[], audience: [] as VoiceParticipant[] };
  // Hosts take raised hands first come, first served.
  const audience = [...seated].sort((a, b) => {
    if (Boolean(a.handRaised) !== Boolean(b.handRaised)) return a.handRaised ? -1 : 1;
    return (a.handRaisedAt ?? 0) - (b.handRaisedAt ?? 0);
  });
  const raisedHands = audience.filter((person) => person.handRaised).length;
  const self = participants.find((person) => person.connectionId === connectionId) || null;
  /** True when this tab is in the audience and could therefore ask for the floor. */
  const amAudience = Boolean(self && !isOnStage(self));
  /** A stage audience seat cannot show video: receivers drop it (videoAllowedFrom). */
  const videoLocked = Boolean(stageMode && self && !videoAllowedFrom(self));
  // Off in this room, or you are in a stage's audience (the server refuses
  // both anyway; this just keeps the button from teasing).
  const soundboardAllowed = soundboardEnabled && !(stageMode && amAudience);

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
      videoKind: kind,
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
  // Where the webview has no Fullscreen API, fill the window and, in the Tauri shell, take the window fullscreen too.
  useEffect(() => {
    if (!windowFull) return;
    void setWindowFullscreen(true);
    return () => void setWindowFullscreen(false);
  }, [windowFull]);

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

  // Viewers and Latency popovers in voice-focus-bar
  const [showViewersPopover, setShowViewersPopover] = useState(false);
  const [showLatencyPopover, setShowLatencyPopover] = useState(false);

  // Close viewers and latency popovers when clicking outside
  useEffect(() => {
    if (!showViewersPopover && !showLatencyPopover) return;
    const handleOutside = () => {
      setShowViewersPopover(false);
      setShowLatencyPopover(false);
    };
    window.addEventListener("click", handleOutside);
    return () => window.removeEventListener("click", handleOutside);
  }, [showViewersPopover, showLatencyPopover]);

  // Tell remote streamer that we are watching their screen
  useEffect(() => {
    if (focused && focused.videoKind === "screen" && focused.remoteId && voice.signalStreamWatch) {
      voice.signalStreamWatch(focused.remoteId, true);
      return () => {
        voice.signalStreamWatch?.(focused.remoteId!, false);
      };
    }
  }, [focused?.key, focused?.videoKind, focused?.remoteId, voice.signalStreamWatch]);

  // Compute active viewers for the currently focused screen or self stream
  const activeStreamViewers: Array<{
    connectionId: string;
    displayName: string;
    avatar: string;
    avatarUrl?: string | null;
    color: string;
  }> = useMemo(() => {
    if (focused?.self) {
      const list = voice.streamViewers || [];
      return list.map((connId) => {
        const p = participants.find((person) => person.connectionId === connId);
        return {
          connectionId: connId,
          displayName: p?.displayName || "Viewer",
          avatar: p?.avatar || "avatar-1",
          avatarUrl: p?.avatarUrl,
          color: p?.color || "#5865f2",
        };
      });
    }
    if (focused?.remoteId) {
      const viewers = participants.filter((p) => {
        if (p.connectionId === focused.remoteId || p.bot) return false;
        const paused = voice.hiddenVideo?.[p.connectionId]?.screen;
        return !paused;
      });
      return viewers.map((p) => ({
        connectionId: p.connectionId,
        displayName: p.displayName,
        avatar: p.avatar || "avatar-1",
        avatarUrl: p.avatarUrl,
        color: p.color || "#5865f2",
      }));
    }
    return [];
  }, [focused?.self, focused?.remoteId, voice.streamViewers, voice.hiddenVideo, participants]);

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
    return speakingIds.has(key);
  }

  return (
    <div
      className={`voice-stage${activityTakeover ? " activity-takeover" : ""}${
        activityTakeover && (activity?.kind === "deeppixel" || activity?.kind === "richup")
          ? " takeover-dark"
          : ""
      }${
        activityTakeover && peopleOpen ? " show-people" : ""
      }${boardHall ? " board-hall" : ""}${boardDock ? " board-dock" : ""}`}
    >
      {tableMenuOpen && <TableAudioMenu participants={participants} listenerId={connectionId} controls={voice} onClose={() => setTableMenuOpen(false)} />}
      {recording}
      {battlemap}
      {/* At the tabletop the dice are thrown onto the table itself. */}
      <DiceOverlay roll={livingRoom?.open && livingRoom.venue === "tabletop" && joined && !stageMode ? null : diceRoll || null} onDone={() => onDiceRollDone?.()} />
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
      <StageRoster
        stageMode={stageMode}
        onStage={onStage}
        canManageStage={canManageStage}
        connectionId={connectionId}
        voice={voice}
        audience={audience}
        raisedHands={raisedHands}
        amAudience={amAudience}
        self={self}
      />

      <StageTopbar
        hideTopbar={hideTopbar}
        channelName={channelName}
        focused={focused}
        streamerName={streamerName}
        participants={participants}
        voice={voice}
        onPopout={onPopout}
        viewMode={viewMode}
        handleViewModeChange={handleViewModeChange}
        onToggleBattlemap={onToggleBattlemap}
        battlemapOpen={battlemapOpen}
      />

      <StageBody
        joined={joined}
        channelName={channelName}
        onJoin={onJoin}
        onExit={onExit}
        viewMode={viewMode}
        participants={participants}
        selfSpeaking={selfSpeaking}
        speakingIds={speakingIds}
        connectionId={connectionId}
        seatTime={seatTime}
        focused={focused}
        theater={theater}
        windowFull={windowFull}
        showFocusBar={showFocusBar}
        focusMainRef={focusMainRef}
        handleFocusMainMouseMove={handleFocusMainMouseMove}
        handleFocusMainMouseLeave={handleFocusMainMouseLeave}
        isFullscreen={isFullscreen}
        setFocusedKey={setFocusedKey}
        streamerName={streamerName}
        handleFocusBarMouseEnter={handleFocusBarMouseEnter}
        handleFocusBarMouseLeave={handleFocusBarMouseLeave}
        streamPreferenceFor={streamPreferenceFor}
        focusedPerson={focusedPerson}
        onToggleStreamMute={onToggleStreamMute}
        onSetStreamVolume={onSetStreamVolume}
        voice={voice}
        showViewersPopover={showViewersPopover}
        setShowViewersPopover={setShowViewersPopover}
        setShowLatencyPopover={setShowLatencyPopover}
        activeStreamViewers={activeStreamViewers}
        showLatencyPopover={showLatencyPopover}
        hideTile={hideTile}
        toggleTheater={toggleTheater}
        toggleFullscreen={toggleFullscreen}
        videoTiles={videoTiles}
        self={self}
        focusedKey={focusedKey}
        onOpenParticipantMenu={onOpenParticipantMenu}
        wrapperRef={wrapperRef}
      />

      {livingRoom?.open && joined && !stageMode && (
        <LivingRoomView
          room={livingRoom}
          participants={participants}
          connectionId={connectionId}
          speaking={speakingIds}
          deafened={voice.deafened}
          nowPlaying={nowPlaying}
          cameras={videoTiles
            .filter((tile) => !tile.hidden && (tile.self ? tile.mirrored : tile.videoKind === "camera"))
            .map((tile) => ({ connectionId: tile.self ? connectionId ?? "" : tile.remoteId ?? "", stream: tile.stream, self: tile.self }))
            .filter((cam) => cam.connectionId)}
          screens={videoTiles.filter((tile) => tile.videoKind === "screen" && !tile.hidden).map((tile) => ({ stream: tile.stream, name: tile.label }))}
          serverNow={serverNow}
          diceRoll={diceRoll}
          onDiceRollDone={onDiceRollDone}
          onCommand={onRollCommand}
          canProject={canProject}
          boardGameId={activity?.kind === "deeppixel" ? String(activity.state.gameId || "") || null : null}
          onPlayBoardGame={() => void playBoardGame()}
        />
      )}
      {captions?.showing && <LiveCaptionsOverlay lines={captions.lines} />}
      {joined && <QaBanner qa={qa} beside={qaOpen} />}
      {joined && qaOpen && <QaPanel qa={qa} userId={userId} onClose={() => setQaOpen(false)} />}

      {soundboardOpen && soundboardAllowed && (
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

      <StageBottomBar
        voice={voice}
        setTableMenuOpen={setTableMenuOpen}
        livingRoom={livingRoom}
        joined={joined}
        stageMode={stageMode}
        videoLocked={videoLocked}
        setCameraBgMenuOpen={setCameraBgMenuOpen}
        cameraBgMenuOpen={cameraBgMenuOpen}
        cameraTab={cameraTab}
        setCameraTab={setCameraTab}
        bgFileInputRef={bgFileInputRef}
        handleBgUpload={handleBgUpload}
        customBgs={customBgs}
        handleDeleteCustomBg={handleDeleteCustomBg}
        setScreenSharePopoverOpen={setScreenSharePopoverOpen}
        screenSharePopoverOpen={screenSharePopoverOpen}
        focused={focused}
        setFocusedKey={setFocusedKey}
        videoTiles={videoTiles}
        activitiesOpen={activitiesOpen}
        setActivitiesOpen={setActivitiesOpen}
        moreMenuOpen={moreMenuOpen}
        setMoreMenuOpen={setMoreMenuOpen}
        soundboardAllowed={soundboardAllowed}
        setSoundboardOpen={setSoundboardOpen}
        soundboardOpen={soundboardOpen}
        setQaOpen={setQaOpen}
        qa={qa}
        captions={captions}
        handleViewModeChange={handleViewModeChange}
        viewMode={viewMode}
        onToggleBattlemap={onToggleBattlemap}
        onClip={onClip}
        clipping={clipping}
        setClipping={setClipping}
        qaOpen={qaOpen}
        onExit={onExit}
        onPopout={onPopout}
        toggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        windowFull={windowFull}
      />
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
  const [uploadError, setUploadError] = useState("");
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
    setUploadError("");
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
    } catch (error) {
      // Say why (too big, wrong format) instead of failing silently.
      setUploadError(error instanceof Error ? error.message : "That sound did not upload.");
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
            {uploadError && <p className="soundboard-empty" role="alert">{uploadError}</p>}
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
