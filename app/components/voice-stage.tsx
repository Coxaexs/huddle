"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Megaphone,
  SlidersHorizontal,
  MicOff,
  Headphones,
  Volume2,
  VolumeX,
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
} from "lucide-react";
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

/** The soundboard: browse and play a server's clips; upload new ones. */
function SoundboardDrawer({
  serverId,
  channelId,
  canManage,
}: {
  serverId: string | null;
  channelId: string | null;
  canManage: boolean;
}) {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [uploading, setUploading] = useState(false);
  /** True when the "add" upload targets your personal pack, not the server's. */
  const [personalUpload, setPersonalUpload] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  function play(sound: Sound) {
    if (!channelId) return;
    void apiFetch("/api/sounds/play", {
      method: "POST",
      body: JSON.stringify({ channelId, soundId: sound.id }),
    }).catch(() => undefined);
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

  async function remove(sound: Sound) {
    await apiFetch(`/api/sounds?id=${encodeURIComponent(sound.id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    load.current();
  }

  return (
    <div className="soundboard">
      {sounds.map((sound) => (
        <div key={sound.id} className="soundboard-pad-wrap">
          <button
            type="button"
            className={`soundboard-pad ${sound.personal ? "personal" : ""}`}
            onClick={() => play(sound)}
            title={`${sound.name}${sound.personal ? " (your pack)" : ""}`}
          >
            <span className="soundboard-emoji">{sound.emoji}</span>
            <span className="soundboard-name">{sound.name}</span>
          </button>
          {(canManage || sound.personal) && (
            <button
              type="button"
              className="soundboard-delete"
              title={`Delete ${sound.name}`}
              onClick={() => void remove(sound)}
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
          <span className="soundboard-name">Add</span>
        </button>
      )}
      {!sounds.length && (
        <p className="soundboard-empty">No sounds yet.</p>
      )}
      <div className="soundboard-upload-options">
        <label className="soundboard-personal-toggle">
          <input
            type="checkbox"
            checked={personalUpload}
            onChange={(event) => setPersonalUpload(event.target.checked)}
          />
          <span>Add to my personal pack</span>
        </label>
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
