"use client";

import { useEffect, useState } from "react";
import { Monitor, Tv, Play, Gamepad2, Film, Sparkles } from "lucide-react";
import { getStreamPreview, subscribeStreamPreviews, type StreamPreviewData } from "../../lib/stream-preview";

export function formatStreamDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface StreamPreviewPopoverProps {
  streamKey: string;
  streamerName: string;
  defaultTitle?: string;
  startedAt?: number;
  anchorRect: DOMRect | null;
  onWatchStream: () => void;
  onClose: () => void;
}

export function StreamPreviewPopover({
  streamKey,
  streamerName,
  defaultTitle = "Live Stream",
  startedAt = Date.now(),
  anchorRect,
  onWatchStream,
  onClose,
}: StreamPreviewPopoverProps) {
  const [preview, setPreview] = useState<StreamPreviewData | null>(() => getStreamPreview(streamKey));
  const [now, setNow] = useState(Date.now());

  // Subscribe to 2-minute periodic snapshot updates
  useEffect(() => {
    return subscribeStreamPreviews(() => {
      setPreview(getStreamPreview(streamKey));
    });
  }, [streamKey]);

  // Update elapsed duration timer every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!anchorRect) return null;

  // Position to the right of the anchor element (or left if near screen edge)
  const left = anchorRect.right + 12 + 340 > window.innerWidth
    ? Math.max(10, anchorRect.left - 352)
    : anchorRect.right + 12;
  const top = Math.min(
    Math.max(10, anchorRect.top - 20),
    window.innerHeight - 340
  );

  const title = preview?.title || defaultTitle;
  const snapshot = preview?.snapshotUrl || null;
  const elapsed = formatStreamDuration(now - (preview?.startedAt || startedAt));

  return (
    <div
      className="fixed z-[9999] w-[340px] bg-[#111214] text-white rounded-xl shadow-2xl border border-[#2b2d31] p-3 flex flex-col gap-2.5 backdrop-blur-md select-none animate-in fade-in zoom-in-95 duration-150"
      style={{ left: `${left}px`, top: `${top}px` }}
      onMouseLeave={onClose}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header matching Screenshot 2 */}
      <div className="flex items-center justify-between px-1 pt-0.5">
        <span className="text-xs font-bold text-gray-300 tracking-wide">Streaming Now</span>
        <span className="bg-[#ed4245] text-white text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
      </div>

      {/* Snapshot Preview Container (16:9) */}
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black/80 border border-white/10 flex items-center justify-center shadow-inner group">
        {snapshot ? (
          <img
            src={snapshot}
            alt={`${streamerName}'s stream preview`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center text-gray-400">
            <Monitor size={36} className="text-[#ed4245] opacity-80 mb-2 animate-pulse" />
            <span className="text-xs font-semibold text-gray-200">{streamerName}'s Stream</span>
            <span className="text-[10px] text-gray-500 mt-0.5">Preview updates every 2 mins</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
      </div>

      {/* Streamer & Game / Media Title Info */}
      <div className="flex items-center gap-2.5 px-1">
        <div className="w-9 h-9 rounded-lg bg-[#1e1f22] border border-white/10 flex items-center justify-center text-amber-400 shrink-0 shadow-sm">
          {title.toLowerCase().includes("jellyfin") || title.toLowerCase().includes("video") ? (
            <Film size={18} />
          ) : (
            <Gamepad2 size={18} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm text-white truncate leading-tight">
            {title}
          </div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1.5 font-mono mt-0.5">
            <span>🎮</span>
            <span>{elapsed}</span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-400 font-sans truncate">{streamerName}</span>
          </div>
        </div>
      </div>

      {/* Primary Watch Stream Button (Green Discord-style) */}
      <button
        type="button"
        className="w-full py-2.5 px-4 bg-[#23a55a] hover:bg-[#1d8c4c] active:bg-[#187840] text-white font-bold rounded-lg flex items-center justify-center gap-2 text-sm shadow-md transition-all cursor-pointer hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
        onClick={() => {
          onWatchStream();
          onClose();
        }}
      >
        <Tv size={16} />
        <span>Watch Stream</span>
      </button>
    </div>
  );
}
