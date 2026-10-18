"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoTile } from "./types";
import { EyeOff, Eye } from "lucide-react";
import { captureVideoSnapshot, setStreamPreview, SNAPSHOT_INTERVAL_MS } from "../../lib/stream-preview";
import type { WatchState } from "@/lib/lounge-shared";
import { watchPosition } from "@/lib/lounge-shared";

export function hasLiveVideo(stream: MediaStream): boolean {
  return stream.getVideoTracks().some((track) => track.readyState === "live");
}

/**
 * A tile's picture, or a tune-in prompt ("Do you want to see...?") before watching,
 * or a placeholder once hidden.
 */
export function TileVideo({
  tile,
  onHide,
  tunedIn = false,
  onTuneIn,
  watchState,
  serverNow,
}: {
  tile: VideoTile;
  onHide?: (tile: VideoTile, hidden: boolean) => void;
  tunedIn?: boolean;
  onTuneIn?: (key: string) => void;
  watchState?: WatchState | null;
  serverNow?: () => number;
}) {
  const what = tile.videoKind === "camera" ? "camera" : "screen share";
  const isScreenOrWatch = tile.videoKind === "screen" || tile.videoKind === "watch";
  const needsTuneIn = isScreenOrWatch && !tile.self && !tunedIn;
  const streamerName = tile.watchTitle || tile.label.split(" · ")[0] || "Streamer";
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Periodic 2-minute snapshot grabber for the sidebar preview
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !isScreenOrWatch) return;

    const snap = () => {
      const captured = captureVideoSnapshot(el);
      if (captured) {
        setStreamPreview({
          key: tile.key,
          title: tile.watchTitle || `${streamerName}'s screenshare`,
          streamerName,
          snapshotUrl: captured,
          startedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    };

    // Initial snapshot once video metadata loads
    const onLoaded = () => setTimeout(snap, 500);
    el.addEventListener("loadeddata", onLoaded);

    // Periodic 2-minute interval
    const interval = setInterval(snap, SNAPSHOT_INTERVAL_MS);
    return () => {
      el.removeEventListener("loadeddata", onLoaded);
      clearInterval(interval);
    };
  }, [tile.key, tile.watchTitle, streamerName, isScreenOrWatch]);

  if (tile.hidden) {
    return (
      <div className="video-hidden-placeholder">
        <EyeOff size={22} aria-hidden="true" />
        <span>{tile.videoKind === "camera" ? "Camera hidden" : "Screen share hidden"}</span>
        <small>Not using your data</small>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
      {/* Video Surface (blurred if not yet tuned in) */}
      <div
        className="w-full h-full transition-all duration-300 flex items-center justify-center"
        style={
          needsTuneIn
            ? { filter: "blur(18px) brightness(0.55)", transform: "scale(1.08)", pointerEvents: "none" }
            : undefined
        }
      >
        {tile.watchUrl ? (
          <WatchSurface
            url={tile.watchUrl}
            paused={watchState?.paused ?? false}
            position={watchState ? watchPosition(watchState, (serverNow ?? Date.now)()) : 0}
            muted={needsTuneIn}
            onVideoRef={(el) => {
              videoRef.current = el;
            }}
          />
        ) : tile.stream ? (
          <VideoSurface
            stream={tile.stream}
            mirrored={tile.mirrored}
            muted={needsTuneIn}
            onVideoRef={(el) => {
              videoRef.current = el;
            }}
          />
        ) : null}
      </div>

      {/* Discord-style Tune-In Prompt Overlay (Screenshot 1) */}
      {needsTuneIn && (
        <div
          className="stream-tunein-overlay absolute inset-0 z-10 flex flex-col items-center justify-center text-center p-4 select-none bg-black/30 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onTuneIn?.(tile.key);
          }}
        >
          <div className="text-white font-bold text-base md:text-lg mb-3.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] max-w-[90%] leading-snug">
            Do you want to see {streamerName}'s screenshare?
          </div>
          <button
            type="button"
            className="stream-tunein-go-btn px-7 py-2 rounded-full bg-white text-black font-extrabold text-sm shadow-xl hover:bg-white/90 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onTuneIn?.(tile.key);
            }}
          >
            Go Ahead
          </button>

          {/* Bottom left label matching Screenshot 1 */}
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 text-xs font-semibold text-rose-300 drop-shadow">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse inline-block" />
            <span className="font-medieval tracking-wide">{tile.label}</span>
          </div>
        </div>
      )}

      {/* Hide Video Button */}
      {!tile.self && tile.remoteId && onHide && !needsTuneIn && (
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
    </div>
  );
}

/** Attaches a MediaStream to a <video>, replacing it only when it changes. */
export function VideoSurface({
  stream,
  mirrored,
  muted = true,
  onVideoRef,
}: {
  stream: MediaStream;
  mirrored?: boolean;
  muted?: boolean;
  onVideoRef?: (el: HTMLVideoElement | null) => void;
}) {
  return (
    <video
      autoPlay
      playsInline
      muted={muted}
      className={mirrored ? "mirrored" : ""}
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
      ref={(element) => {
        onVideoRef?.(element);
        if (element && element.srcObject !== stream) {
          element.srcObject = stream;
          void element.play().catch(() => undefined);
        }
      }}
    />
  );
}

/** Video player surface for Living Room / Jellyfin synchronized watch streams */
export function WatchSurface({
  url,
  paused = false,
  position = 0,
  muted = true,
  volume = 1,
  onVideoRef,
}: {
  url: string;
  paused?: boolean;
  position?: number;
  muted?: boolean;
  volume?: number;
  onVideoRef?: (el: HTMLVideoElement | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
    if (paused) {
      el.pause();
    } else {
      void el.play().catch(() => undefined);
    }
  }, [paused, muted, volume]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !Number.isFinite(position)) return;
    if (Math.abs(el.currentTime - position) > 2.5) {
      el.currentTime = position;
    }
  }, [position]);

  return (
    <video
      ref={(el) => {
        videoRef.current = el;
        onVideoRef?.(el);
      }}
      src={url}
      crossOrigin="anonymous"
      playsInline
      autoPlay
      muted={muted}
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  );
}