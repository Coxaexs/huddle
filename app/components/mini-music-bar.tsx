"use client";

import { useCallback, type MouseEvent } from "react";
import { Music2, Play, Pause, SkipForward } from "lucide-react";
import { playbackPosition, type PlayerState } from "@/lib/protocol";

interface MiniMusicBarProps {
  state: PlayerState | null;
  position: number;
  controllable?: boolean;
  onToggle?: () => void;
  onSeek?: (positionMs: number) => void;
  onSkip?: () => void;
  className?: string;
}

export function MiniMusicBar({
  state,
  position,
  controllable = true,
  onToggle,
  onSeek,
  onSkip,
  className = "",
}: MiniMusicBarProps) {
  const track = state?.track;
  if (!track) return null;

  const durationMs = track.duration ? track.duration * 1000 : 0;
  const current = state
    ? Math.min(position || playbackPosition(state), durationMs || position)
    : 0;
  const progressPercent = durationMs > 0 ? Math.min(100, (current / durationMs) * 100) : 0;
  const isPaused = Boolean(state?.paused);

  const handleSeek = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!controllable || !onSeek || !durationMs) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      onSeek(Math.round(ratio * durationMs));
    },
    [controllable, onSeek, durationMs],
  );

  const displayTitle = track.title || "Unknown Track";
  const displayArtist = track.artist ? ` - ${track.artist}` : "";
  const fullLabel = `${displayTitle}${displayArtist} · Synced`;

  return (
    <div
      className={`mini-music-bar mx-2 mb-2 rounded-xl border border-[#2a243e] bg-[#1b172a] p-2.5 shadow-sm select-none ${className}`}
      title={fullLabel}
    >
      <div className="flex items-center justify-between text-[11px] font-semibold text-[#ede9f6] mb-1.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
          <Music2 className="h-3.5 w-3.5 text-[#7c5cfc] shrink-0 animate-pulse" />
          <span className="truncate tracking-tight">{fullLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-[#9d95bc]">
          {onToggle && controllable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="p-0.5 hover:text-white transition-colors cursor-pointer"
              title={isPaused ? "Play" : "Pause"}
              aria-label={isPaused ? "Play" : "Pause"}
            >
              {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            </button>
          )}
          {onSkip && controllable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSkip();
              }}
              className="p-0.5 hover:text-white transition-colors cursor-pointer"
              title="Skip track"
              aria-label="Skip track"
            >
              <SkipForward className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Scrubbable progress bar */}
      <div
        className={`h-1 w-full rounded-full bg-[#27213b] overflow-hidden ${
          controllable && onSeek ? "cursor-pointer group hover:h-1.5 transition-all" : ""
        }`}
        onClick={handleSeek}
        title="Click to seek"
      >
        <div
          className="h-full bg-gradient-to-r from-[#7c5cfc] to-[#9e83fc] rounded-full transition-all duration-150 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
