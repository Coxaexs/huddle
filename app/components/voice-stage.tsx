"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Megaphone,
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
  X,
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
import type { ScreenShareQuality } from "../hooks/use-voice";
import { apiFetch } from "../lib/client";
import { TableAudioMenu, type TableControls } from "./table-audio-menu";
import { Avatar } from "./avatar";
import { DiceOverlay } from "./dice-overlay";
import { RoomActivities } from "./room-activities";

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
  speaking: Set<string>;
  remoteStreams: Array<{ connectionId: string; stream: MediaStream }>;
  peerStates: Record<string, string>;
  screenSharing: boolean;
  screenQuality: ScreenShareQuality;
  setScreenQuality: (quality: ScreenShareQuality) => void;
  startScreenShare: () => void | Promise<void>;
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
  voice: VoiceApi;
  /** Server the room belongs to, for its soundboard. */
  serverId: string | null;
  canManageSounds: boolean;
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
}

interface VideoTile {
  key: string;
  stream: MediaStream;
  label: string;
  self: boolean;
  mirrored: boolean;
  connecting: boolean;
}

function hasLiveVideo(stream: MediaStream): boolean {
  return stream.getVideoTracks().some((track) => track.readyState === "live");
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
  voice,
  serverId,
  canManageSounds,
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
}: VoiceStageProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table" | "map">("grid");
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(Boolean(activity));
  const [clipping, setClipping] = useState<"idle" | "working" | "done">("idle");
  const [cameraBgMenuOpen, setCameraBgMenuOpen] = useState(false);
  const [cameraTab, setCameraTab] = useState<"blur" | "images" | "fx">("blur");
  const [customBgs, setCustomBgs] = useState<CustomBackgroundItem[]>(() => loadCustomBackgrounds());
  const bgFileInputRef = useRef<HTMLInputElement>(null);

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
  for (const { connectionId: remoteId, stream } of voice.remoteStreams) {
    if (!hasLiveVideo(stream)) continue;
    const person = participants.find((p) => p.connectionId === remoteId);
    const label =
      person?.cameraStreamId === stream.id
        ? `${person.displayName} · camera`
        : person?.screenStreamId === stream.id
          ? `${person?.displayName} · screen`
          : person?.displayName || "Screen share";
    videoTiles.push({
      key: `${remoteId}:${stream.id}`,
      stream,
      label,
      self: false,
      mirrored: false,
      connecting:
        voice.peerStates[remoteId] !== undefined &&
        voice.peerStates[remoteId] !== "connected",
    });
  }

  const focused = focusedKey
    ? videoTiles.find((tile) => tile.key === focusedKey) || null
    : null;

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
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (element.requestFullscreen) {
      void element.requestFullscreen().catch(() => undefined);
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
    <div className="voice-stage">
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
      <div className="voice-stage-topbar">
        <div className="voice-stage-topbar-info">
          <Volume2 size={16} className="voice-stage-volume-icon" />
          <div className="voice-stage-title-wrap">
            <h2 className="voice-stage-title">{channelName}</h2>
            <span className="voice-stage-sub">{participants.length} in call</span>
          </div>
        </div>
        <div className="voice-view-switcher">
          {(["grid", "table", "map"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`voice-view-pill ${viewMode === mode ? "active" : ""}`}
              onClick={() => {
                setViewMode(mode);
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
                      {isSpeaking && (
                        <span className="text-[10px] text-[#a78bfa] font-bold">speaking</span>
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
          <div className="voice-focus">
            <div
              className="voice-focus-main"
              ref={focusMainRef}
              onClick={() => {
                if (!isFullscreen) setFocusedKey(null);
              }}
              title={isFullscreen ? undefined : "Click to return to the grid"}
            >
              <VideoSurface stream={focused.stream} mirrored={focused.mirrored} />
              <div className="voice-focus-bar">
                <span className="live-dot" /> LIVE
                <strong>{focused.label}</strong>
                <button
                  type="button"
                  className="voice-focus-full"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFullscreen();
                  }}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            </div>

            <div className="voice-filmstrip">
              {videoTiles.map((tile) => (
                <button
                  type="button"
                  key={tile.key}
                  className={`film-tile ${tile.key === focusedKey ? "active" : ""}`}
                  onClick={() => setFocusedKey(tile.key)}
                >
                  <VideoSurface stream={tile.stream} mirrored={tile.mirrored} />
                  <span>{tile.label}</span>
                </button>
              ))}
              {participants.map((person) => (
                <div
                  className="film-tile avatar-film"
                  key={`a:${person.connectionId}`}
                  onContextMenu={(event) => {
                    if (person.connectionId === connectionId) return;
                    onOpenParticipantMenu?.(event, person);
                  }}
                >
                  <Avatar
                    avatar={person.avatar}
                    avatarUrl={person.avatarUrl}
                    color={person.color}
                  />
                  <span>
                    {person.connectionId === connectionId ? "You" : person.displayName}
                  </span>
                </div>
              ))}
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
                onClick={() => setFocusedKey(tile.key)}
                title="Click to focus"
              >
                <VideoSurface stream={tile.stream} mirrored={tile.mirrored} />
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
                    {person.important && !person.muted && !person.serverMuted && <span className="table-dm-badge" title="Speaking important"><Megaphone size={13} /> Important</span>}
                    {person.muted && !person.bot && (
                      <span
                        className="tile-muted"
                        title={person.serverMuted ? "Muted for everyone" : "Muted"}
                      >
                        <MicOff size={14} />
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
          <button
            type="button"
            className={`vctrl-btn ${voice.screenSharing ? "active" : ""}`}
            onClick={() =>
              voice.screenSharing
                ? voice.stopScreenShare()
                : void voice.startScreenShare()
            }
            title={voice.screenSharing ? "Stop sharing" : "Share screen"}
          >
            <Monitor size={18} />
          </button>

          <div className="vctrl-divider" />

          <button
            type="button"
            className={`vctrl-btn ${viewMode === "table" ? "active" : ""}`}
            onClick={() => setViewMode((m) => (m === "table" ? "grid" : "table"))}
            title="Voice Table"
          >
            <Volume2 size={18} />
          </button>
          {onToggleBattlemap && (
            <button
              type="button"
              className={`vctrl-btn ${viewMode === "map" || battlemapOpen ? "active" : ""}`}
              onClick={() => {
                const next = viewMode === "map" ? "grid" : "map";
                setViewMode(next);
                onToggleBattlemap();
              }}
              title="Battlemap"
            >
              <Map size={18} />
            </button>
          )}
          <button
            type="button"
            className={`vctrl-btn ${activitiesOpen ? "active" : ""}`}
            onClick={() => setActivitiesOpen((open) => !open)}
            title="Activities"
          >
            <Sparkles size={18} />
          </button>
          <button
            type="button"
            className={`vctrl-btn ${soundboardOpen ? "active" : ""}`}
            onClick={() => setSoundboardOpen((open) => !open)}
            title="Soundboard"
          >
            <Volume2 size={18} />
          </button>
          <button
            type="button"
            className={`vctrl-btn ${clipping === "done" ? "active" : ""}`}
            disabled={clipping === "working" || !onClip}
            title={`Clip the last ${voice.clipSeconds}s`}
            onClick={async () => {
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
            {clipping === "working" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : clipping === "done" ? (
              <Check size={18} />
            ) : (
              <Scissors size={18} />
            )}
          </button>

          <div className="vctrl-divider" />

          <button
            type="button"
            className="vctrl-btn danger active"
            onClick={() => (joined ? voice.leave() : onExit?.())}
            title={joined ? "Leave call" : "Close"}
          >
            <PhoneOff size={18} />
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
