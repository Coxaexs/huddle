"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mic,
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
  PhoneOff,
} from "lucide-react";
import type { VoiceParticipant } from "@/lib/protocol";
import type { DiceRollEvent } from "@/lib/protocol";
import type { RoomActivity } from "@/lib/activities";
import type { ScreenShareQuality } from "../hooks/use-voice";
import { apiFetch } from "../lib/client";
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
interface VoiceApi {
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
  battlemap,
  onToggleBattlemap,
  battlemapOpen,
  diceRoll,
  onDiceRollDone,
  recording,
  onOpenParticipantMenu,
}: VoiceStageProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(Boolean(activity));
  const [clipping, setClipping] = useState<"idle" | "working" | "done">("idle");
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  // Esc leaves the focused view.
  useEffect(() => {
    if (!focused) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusedKey(null);
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

  function toggleFullscreen() {
    const element = wrapperRef.current;
    if (!element) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void element.requestFullscreen().catch(() => undefined);
    }
  }

  function selfSpeaking(person: VoiceParticipant): boolean {
    const key = person.connectionId === connectionId ? "self" : person.connectionId;
    return voice.speaking.has(key);
  }

  return (
    <div className="voice-stage">
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
      <div className="voice-stage-body">
        {focused ? (
          <div className="voice-focus" ref={wrapperRef}>
            <div
              className="voice-focus-main"
              onClick={() => setFocusedKey(null)}
              title="Click to return to the grid"
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
                  aria-label="Toggle fullscreen"
                >
                  <Maximize2 size={16} />
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

      <div className="voice-stage-bar">
        <div className="stage-bar-name">
          <Volume2 size={18} className="speaker-icon inline" />
          <strong>{channelName}</strong>
        </div>
        <div className="stage-bar-controls">
          <button
            type="button"
            className={`stage-btn ${voice.muted ? "off" : ""}`}
            onClick={voice.toggleMute}
            disabled={voice.forcedMute}
            title={
              voice.forcedMute ? "Server muted" : voice.muted ? "Unmute" : "Mute"
            }
          >
            {voice.muted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            type="button"
            className={`stage-btn ${voice.deafened ? "off" : ""}`}
            onClick={voice.toggleDeafen}
            title={voice.deafened ? "Undeafen" : "Deafen"}
          >
            {voice.deafened ? <VolumeX size={18} /> : <Headphones size={18} />}
          </button>
          <button
            type="button"
            className={`stage-btn ${voice.cameraOn ? "on" : ""}`}
            onClick={() =>
              voice.cameraOn ? voice.stopCamera() : void voice.startCamera()
            }
            title={voice.cameraOn ? "Turn camera off" : "Turn camera on"}
          >
            {voice.cameraOn ? <VideoOff size={18} /> : <Video size={18} />}
          </button>
          <button
            type="button"
            className={`stage-btn ${voice.screenSharing ? "on" : ""}`}
            onClick={() =>
              voice.screenSharing
                ? voice.stopScreenShare()
                : void voice.startScreenShare()
            }
            title={voice.screenSharing ? "Stop sharing" : "Share your screen"}
          >
            <Monitor size={18} />
          </button>
          <button
            type="button"
            className={`stage-btn ${soundboardOpen ? "on" : ""}`}
            onClick={() => setSoundboardOpen((open) => !open)}
            title="Soundboard"
          >
            <Volume2 size={18} />
          </button>
          {onToggleBattlemap && (
            <button
              type="button"
              className={`stage-btn ${battlemapOpen ? "on" : ""}`}
              onClick={onToggleBattlemap}
              title="Battlemap"
            >
              <Map size={18} />
            </button>
          )}
          <button
            type="button"
            className={`stage-btn ${activitiesOpen ? "on" : ""}`}
            onClick={() => setActivitiesOpen((open) => !open)}
            title="Room activities"
          >
            <Sparkles size={18} />
          </button>
          <button
            type="button"
            className={`stage-btn ${clipping === "done" ? "on" : ""}`}
            disabled={clipping === "working" || !onClip}
            title={`Clip the last ${voice.clipSeconds}s and post it to chat`}
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
            {clipping === "working" ? <Loader2 size={18} className="animate-spin" /> : clipping === "done" ? <Check size={18} /> : <Scissors size={18} />}
          </button>
          <select
            aria-label="Screen share quality"
            className="stage-quality"
            value={voice.screenQuality}
            disabled={voice.screenSharing}
            onChange={(event) =>
              voice.setScreenQuality(event.target.value as ScreenShareQuality)
            }
          >
            <option value="720p30">720p30</option>
            <option value="1080p30">1080p30</option>
            <option value="1080p60">1080p60</option>
          </select>
          <button
            type="button"
            className="stage-btn disconnect"
            onClick={voice.leave}
            title="Disconnect"
          >
            <PhoneOff size={18} />
          </button>
        </div>
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
