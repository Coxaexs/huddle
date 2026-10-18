"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoTile } from "./types";
import { EyeOff, Eye, Film, Monitor, Play } from "lucide-react";
import type { WatchState } from "@/lib/lounge-shared";
import { watchPosition } from "@/lib/lounge-shared";
import { attachWatchSource } from "../../lib/watch-source";
import { partyPlayerOn } from "../../lib/tune-in";
import { SubtitleOverlay } from "../watch-subtitles";

export function hasLiveVideo(stream: MediaStream): boolean {
  return stream.getVideoTracks().some((track) => track.readyState === "live");
}

/** How the room's watch party plays in this tile. */
export interface WatchPlayback {
  state: WatchState;
  hubNow: () => number;
  /** 0..1, already including the viewer's mute. */
  volume: number;
  /** Only the one big picture plays sound; the rest stay silent. */
  audible: boolean;
  /** The film reached its end: the room moves on to the queue. */
  onEnded?: () => void;
}

/**
 * A tile's picture; a "Do you want to see…?" prompt before you tune in to a
 * screen share or watch party (nothing is received until you do); or a
 * placeholder once hidden, plus the corner button that switches between them.
 */
export function TileVideo({
  tile,
  onHide,
  needsTuneIn = false,
  onTuneIn,
  preview,
  watch,
  compact = false,
}: {
  tile: VideoTile;
  onHide?: (tile: VideoTile, hidden: boolean) => void;
  needsTuneIn?: boolean;
  onTuneIn?: (tile: VideoTile) => void;
  /** The streamer's latest preview frame, shown behind the prompt. */
  preview?: string | null;
  watch?: WatchPlayback | null;
  /** A small copy of a tile shown big elsewhere (the filmstrip): no second player. */
  compact?: boolean;
}) {
  const what = tile.videoKind === "camera" ? "camera" : "screen share";
  const name = tile.watchTitle || tile.label.split(" · ")[0] || "Streamer";

  if (needsTuneIn) {
    return (
      <div
        className="stream-tunein"
        onClick={(event) => {
          event.stopPropagation();
          onTuneIn?.(tile);
        }}
      >
        {preview ? (
          <img className="stream-tunein-preview" src={preview} alt="" aria-hidden="true" />
        ) : (
          <div className="stream-tunein-preview stream-tunein-blank" aria-hidden="true">
            {tile.videoKind === "watch" ? <Film size={40} /> : <Monitor size={40} />}
          </div>
        )}
        <div className="stream-tunein-overlay">
          <div className="stream-tunein-question">
            {tile.videoKind === "watch" ? `Do you want to watch ${name}?` : `Do you want to see ${name}'s screen share?`}
          </div>
          <button
            type="button"
            className="stream-tunein-go"
            onClick={(event) => {
              event.stopPropagation();
              onTuneIn?.(tile);
            }}
          >
            Go Ahead
          </button>
          <div className="stream-tunein-label">
            <span className="live-stream-dot" />
            <span>{tile.label}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {tile.hidden ? (
        <div className="video-hidden-placeholder">
          <EyeOff size={22} aria-hidden="true" />
          <span>{tile.videoKind === "camera" ? "Camera hidden" : "Screen share hidden"}</span>
          <small>Not using your data</small>
        </div>
      ) : tile.watchUrl && watch && !compact ? (
        <WatchSurface url={tile.watchUrl} {...watch} />
      ) : tile.watchUrl ? (
        <div className="video-hidden-placeholder">
          <Film size={22} aria-hidden="true" />
          <span>{name}</span>
        </div>
      ) : tile.stream ? (
        <VideoSurface stream={tile.stream} mirrored={tile.mirrored} />
      ) : null}
      {!tile.self && tile.remoteId && onHide && tile.videoKind !== "watch" && (
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

/**
 * Attaches a MediaStream to a <video>, replacing it only when it changes.
 * Always silent: a share's sound plays through the call's own audio path.
 */
export function VideoSurface({
  stream,
  mirrored,
}: {
  stream: MediaStream;
  mirrored?: boolean;
}) {
  return (
    <video
      autoPlay
      playsInline
      muted
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
 * The room's watch party on the stage: the same film at the same moment as
 * everyone else, kept in step with the hub clock like the living room screen.
 */
export function WatchSurface({
  url,
  state,
  hubNow,
  volume,
  audible,
  onEnded,
}: { url: string } & WatchPlayback) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const live = useRef({ state, hubNow, volume, audible, onEnded });
  live.current = { state, hubNow, volume, audible, onEnded };
  const [problem, setProblem] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  // A new film: a new source (and, for Jellyfin, maybe a new conversion).
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    setProblem(null);
    // Asking for CORS lets a frame be read for previews; watch-source asks
    // plainly instead when a site does not allow it.
    element.crossOrigin = "anonymous";
    // Counts this viewer as watching the party while the player is up.
    const counted = partyPlayerOn();
    const detach = attachWatchSource(element, url, {
      startAt: watchPosition(live.current.state, live.current.hubNow()),
      onProblem: setProblem,
      retryWithoutCors: true,
      quality: live.current.state.quality,
      session: live.current.state.session,
    });
    return () => {
      counted();
      detach();
    };
  }, [url, state.session, state.quality]);

  // Stay on the room's clock: play, pause and seek with everyone else.
  useEffect(() => {
    const sync = () => {
      const element = videoRef.current;
      if (!element) return;
      const { state: w, hubNow: now, volume: level, audible: loud, onEnded: ended } = live.current;
      element.volume = Math.max(0, Math.min(1, level));
      element.muted = !loud || level <= 0;
      const duration = Number.isFinite(element.duration) ? element.duration : 0;
      let expected = watchPosition(w, now());
      let paused = w.paused;
      if (duration && expected >= duration) {
        expected = duration;
        paused = true;
        ended?.();
      }
      if (element.readyState >= 1 && Math.abs(element.currentTime - expected) > (paused ? 0.3 : 2)) {
        element.currentTime = expected;
      }
      if (paused && !element.paused) element.pause();
      else if (!paused && element.paused) {
        void element.play().then(() => setBlocked(false)).catch((error: unknown) => {
          if ((error as DOMException)?.name === "NotAllowedError") setBlocked(true);
        });
      }
    };
    sync();
    const timer = window.setInterval(sync, 1000);
    return () => window.clearInterval(timer);
  }, [url, state, audible, volume]);

  return (
    <div className="watch-surface">
      <video ref={videoRef} playsInline preload="auto" />
      {blocked && !problem && (
        <button
          type="button"
          className="watch-surface-play"
          onClick={(event) => {
            event.stopPropagation();
            void videoRef.current?.play().then(() => setBlocked(false)).catch(() => undefined);
          }}
        >
          <Play size={18} /> Click to play
        </button>
      )}
      <SubtitleOverlay url={url} time={() => videoRef.current?.currentTime ?? null} />
      {problem && <div className="watch-surface-problem">{problem}</div>}
    </div>
  );
}
