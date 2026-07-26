"use client";

import { useEffect, useRef, useState } from "react";
import type { VoiceParticipant } from "@/lib/protocol";
import type { ScreenShareQuality } from "../hooks/use-voice";
import { Avatar } from "./avatar";

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
}

interface VoiceStageProps {
  channelName: string;
  participants: VoiceParticipant[];
  connectionId: string | null;
  voice: VoiceApi;
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
}: VoiceStageProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
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
                  ⤢
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
                <div className="film-tile avatar-film" key={`a:${person.connectionId}`}>
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
                        🔇
                      </span>
                    )}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </div>

      <div className="voice-stage-bar">
        <div className="stage-bar-name">
          <span className="speaker-icon">◖))</span>
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
            {voice.muted ? "🔇" : "🎙"}
          </button>
          <button
            type="button"
            className={`stage-btn ${voice.deafened ? "off" : ""}`}
            onClick={voice.toggleDeafen}
            title={voice.deafened ? "Undeafen" : "Deafen"}
          >
            {voice.deafened ? "🔈" : "🎧"}
          </button>
          <button
            type="button"
            className={`stage-btn ${voice.cameraOn ? "on" : ""}`}
            onClick={() =>
              voice.cameraOn ? voice.stopCamera() : void voice.startCamera()
            }
            title={voice.cameraOn ? "Turn camera off" : "Turn camera on"}
          >
            {voice.cameraOn ? "📹" : "📷"}
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
            🖥
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
            📞
          </button>
        </div>
      </div>
    </div>
  );
}
