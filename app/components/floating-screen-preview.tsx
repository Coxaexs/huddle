"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Eye, Maximize2, Volume1, Volume2, VolumeX, X } from "lucide-react";

export interface FloatingScreenPreviewProps {
  channelName: string;
  stream: MediaStream;
  streamerName: string;
  streamKind?: "screen" | "camera";
  viewerCount?: number;
  onMaximize: () => void;
  onClose: () => void;
  volume?: number;
  muted?: boolean;
  onVolumeChange?: (volume: number) => void;
  onToggleMute?: () => void;
  isSelf?: boolean;
}

export function FloatingScreenPreview({
  channelName,
  stream,
  streamerName,
  streamKind = "screen",
  viewerCount = 1,
  onMaximize,
  onClose,
  volume = 100,
  muted = false,
  onVolumeChange,
  onToggleMute,
  isSelf = false,
}: FloatingScreenPreviewProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Card dimensions
  const cardWidth = 300;
  const cardHeight = 175;

  // Initialize position synchronously (clamped to screen or saved in localStorage)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("huddle_screen_preview_pos");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.x === "number" && typeof parsed.y === "number") {
            const clampedX = Math.max(12, Math.min(window.innerWidth - cardWidth - 12, parsed.x));
            const clampedY = Math.max(12, Math.min(window.innerHeight - cardHeight - 12, parsed.y));
            return { x: clampedX, y: clampedY };
          }
        }
      } catch {
        // Ignore parse errors
      }
      const defaultX = Math.max(12, window.innerWidth - cardWidth - 280);
      const defaultY = Math.max(12, window.innerHeight - cardHeight - 80);
      return { x: defaultX, y: defaultY };
    }
    return { x: 20, y: 20 };
  });

  const [isDragging, setIsDragging] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const isDraggingRef = useRef(false);
  const dragInfoRef = useRef<{
    startX: number;
    startY: number;
    initialPosX: number;
    initialPosY: number;
    hasMoved: boolean;
  } | null>(null);

  // Play video helper ensuring muted autoplay works across all browsers
  const playVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el || !stream) return;
      el.defaultMuted = true;
      el.muted = true;
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => undefined);
      }
    },
    [stream],
  );

  // Callback ref to bind immediately upon DOM mount
  const bindVideoRef = useCallback(
    (element: HTMLVideoElement | null) => {
      videoRef.current = element;
      if (element) {
        playVideo(element);
      }
    },
    [playVideo],
  );

  // Re-sync video when stream or its tracks update
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;

    playVideo(el);

    const handleTrackUpdate = () => {
      playVideo(el);
    };

    stream.addEventListener("addtrack", handleTrackUpdate);
    stream.addEventListener("removetrack", handleTrackUpdate);

    const videoTracks = stream.getVideoTracks();
    for (const track of videoTracks) {
      track.addEventListener("unmute", handleTrackUpdate);
    }

    return () => {
      stream.removeEventListener("addtrack", handleTrackUpdate);
      stream.removeEventListener("removetrack", handleTrackUpdate);
      for (const track of videoTracks) {
        track.removeEventListener("unmute", handleTrackUpdate);
      }
    };
  }, [stream, playVideo]);

  // Pointer drag / click handling: distinguishing dragging from clicking
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only primary mouse button or touch
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Don't intercept button clicks (back, close, maximize buttons)
    if (target.closest("button") || target.closest("a")) return;

    const currentX = pos.x;
    const currentY = pos.y;

    dragInfoRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialPosX: currentX,
      initialPosY: currentY,
      hasMoved: false,
    };

    const onPointerMove = (moveEv: PointerEvent) => {
      if (!dragInfoRef.current) return;
      const dx = moveEv.clientX - dragInfoRef.current.startX;
      const dy = moveEv.clientY - dragInfoRef.current.startY;
      const distance = Math.hypot(dx, dy);

      if (!dragInfoRef.current.hasMoved) {
        if (distance > 5) {
          dragInfoRef.current.hasMoved = true;
          isDraggingRef.current = true;
          setIsDragging(true);
        } else {
          return;
        }
      }

      const nextX = Math.max(10, Math.min(window.innerWidth - cardWidth - 10, dragInfoRef.current.initialPosX + dx));
      const nextY = Math.max(10, Math.min(window.innerHeight - cardHeight - 10, dragInfoRef.current.initialPosY + dy));
      setPos({ x: nextX, y: nextY });
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      const info = dragInfoRef.current;
      dragInfoRef.current = null;

      if (info?.hasMoved) {
        // Was dragging: save new position
        setTimeout(() => {
          isDraggingRef.current = false;
          setIsDragging(false);
        }, 50);

        setPos((latestPos) => {
          try {
            localStorage.setItem("huddle_screen_preview_pos", JSON.stringify(latestPos));
          } catch {
            // Ignore
          }
          return latestPos;
        });
      } else {
        // Was a simple click on the preview card: navigate into the voice stage!
        isDraggingRef.current = false;
        setIsDragging(false);
        onMaximize();
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  // Re-clamp on window resize
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => ({
        x: Math.max(10, Math.min(window.innerWidth - cardWidth - 10, prev.x)),
        y: Math.max(10, Math.min(window.innerHeight - cardHeight - 10, prev.y)),
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <aside
      ref={cardRef}
      aria-label={`${streamerName}'s screen preview`}
      className={`floating-screen-preview ${isDragging ? "is-dragging" : ""}`}
      style={{
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        width: `${cardWidth}px`,
        height: `${cardHeight}px`,
      }}
      onPointerDown={handlePointerDown}
    >
      {/* Video Content */}
      <div className="preview-video-box">
        <video
          ref={bindVideoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            el.defaultMuted = true;
            el.muted = true;
            void el.play().catch(() => undefined);
          }}
          onCanPlay={(e) => {
            const el = e.currentTarget;
            void el.play().catch(() => undefined);
          }}
          className="preview-video"
        />
      </div>

      {/* Top Header Overlay */}
      <div className="preview-header-overlay">
        <button
          type="button"
          className="preview-header-back-btn"
          onClick={(e) => {
            e.stopPropagation();
            onMaximize();
          }}
          title="Return to channel"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="preview-channel-name truncate">{channelName}</span>
      </div>

      {/* Bottom Footer Overlay */}
      <div className="preview-footer-overlay">
        <div className="preview-streamer-info min-w-0">
          <span className="preview-streamer-name truncate">{streamerName}</span>
        </div>

        <div className="preview-footer-actions flex items-center gap-1.5 flex-shrink-0">
          <div className="preview-viewer-badge" title={`${viewerCount} viewing`}>
            <Eye size={13} />
            <span>{viewerCount}</span>
          </div>

          {!isSelf && onVolumeChange && (
            <div className="relative flex items-center">
              <button
                type="button"
                className={`preview-action-btn ${muted ? "text-rose-400" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMute?.();
                }}
                onMouseEnter={() => setShowVolume(true)}
                title={muted ? "Unmute stream audio" : `Stream audio: ${volume}% (Click to mute)`}
              >
                {muted || volume === 0 ? (
                  <VolumeX size={13} />
                ) : volume < 50 ? (
                  <Volume1 size={13} />
                ) : (
                  <Volume2 size={13} />
                )}
              </button>

              {showVolume && (
                <div
                  className="absolute bottom-full mb-2 right-0 bg-[var(--panel)] border border-[var(--line)] rounded-xl shadow-xl p-2.5 z-50 flex flex-col gap-1.5 w-36 backdrop-blur-md"
                  onMouseLeave={() => setShowVolume(false)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--ink)]">
                    <span>Volume</span>
                    <span className="font-mono text-[var(--lavender)]">{muted ? "Muted" : `${volume}%`}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={1}
                    value={muted ? 0 : volume}
                    onChange={(e) => {
                      onVolumeChange(Number(e.target.value));
                      if (muted) onToggleMute?.();
                    }}
                    className="w-full accent-[var(--lavender)] h-1.5 cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="preview-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMaximize();
            }}
            title="Expand stream"
          >
            <Maximize2 size={13} />
          </button>

          <button
            type="button"
            className="preview-action-btn close"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Close preview"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
