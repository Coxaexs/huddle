"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Monitor, Tv, Film } from "lucide-react";
import {
  getStreamPreview,
  requestStreamPreview,
  subscribeStreamPreviews,
  type StreamPreviewData,
} from "../../lib/stream-preview";

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
  kind: "screen" | "watch";
  /** The streamer's seat, for a screen share's preview frame. */
  connectionId?: string;
  streamerName: string;
  /** A watch party's film. */
  title?: string;
  /** Hub-clock ms the stream started. */
  startedAt?: number | null;
  /** How many people are watching it right now. */
  viewers?: number;
  /** The hub clock. */
  hubNow: () => number;
  anchorRect: DOMRect | null;
  /** Asks the hub for a preview frame. */
  send: (event: { t: "stream-preview-get"; connectionId: string }) => void;
  onWatchStream: () => void;
  /** The pointer reached the card: cancel the pending close. */
  onKeep: () => void;
  onClose: () => void;
}

/** "Streaming Now": what someone is sharing (or the room is watching), how long, and a way in. */
export function StreamPreviewPopover({
  kind,
  connectionId,
  streamerName,
  title,
  startedAt,
  viewers = 0,
  hubNow,
  anchorRect,
  send,
  onWatchStream,
  onKeep,
  onClose,
}: StreamPreviewPopoverProps) {
  const [preview, setPreview] = useState<StreamPreviewData | null>(() =>
    connectionId ? getStreamPreview(connectionId) : null,
  );
  const [now, setNow] = useState(() => hubNow());
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!connectionId) return;
    setPreview(getStreamPreview(connectionId));
    requestStreamPreview(connectionId, send);
    return subscribeStreamPreviews(() => setPreview(getStreamPreview(connectionId)));
  }, [connectionId, send]);

  useEffect(() => {
    const timer = setInterval(() => setNow(hubNow()), 1000);
    return () => clearInterval(timer);
  }, [hubNow]);

  // Opened by a tap (no hover to leave): a tap anywhere else, or Escape, closes it.
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) closeRef.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    const id = window.setTimeout(() => document.addEventListener("pointerdown", outside), 0);
    document.addEventListener("keydown", escape);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  if (!anchorRect) return null;

  const width = Math.min(340, window.innerWidth - 20);
  const left = anchorRect.right + 12 + width > window.innerWidth
    ? Math.max(10, Math.min(anchorRect.left - width - 12, window.innerWidth - width - 10))
    : anchorRect.right + 12;
  const top = Math.min(Math.max(10, anchorRect.top - 20), window.innerHeight - 340);

  const heading = kind === "watch"
    ? title || "Watch party"
    : preview?.title || `${streamerName}'s screen`;
  const snapshot = kind === "screen" ? preview?.snapshotUrl || null : null;
  const elapsed = startedAt ? formatStreamDuration(now - startedAt) : null;
  const Icon = kind === "watch" ? Film : Monitor;

  return (
    <div
      ref={cardRef}
      className="fixed z-[9999] bg-[#111214] text-white rounded-xl shadow-2xl border border-[#2b2d31] p-3 flex flex-col gap-2.5 backdrop-blur-md select-none animate-in fade-in zoom-in-95 duration-150"
      style={{ left: `${left}px`, top: `${top}px`, width: `${width}px` }}
      role="dialog"
      aria-label={`${heading}, streaming now`}
      onMouseEnter={onKeep}
      onMouseLeave={onClose}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-1 pt-0.5">
        <span className="text-xs font-bold text-gray-300 tracking-wide">Streaming Now</span>
        <span className="live-stream-badge">
          <span className="live-stream-dot" />
          LIVE
        </span>
      </div>

      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black/80 border border-white/10 flex items-center justify-center shadow-inner">
        {snapshot ? (
          <img
            src={snapshot}
            alt={`${streamerName}'s stream preview`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center text-gray-400">
            <Icon size={36} className="text-[#ed4245] opacity-80 mb-2" />
            <span className="text-xs font-semibold text-gray-200">
              {kind === "watch" ? "Watching together" : "No preview yet"}
            </span>
            {kind === "screen" && (
              <span className="text-[10px] text-gray-500 mt-0.5">A preview shows up shortly after the stream starts</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 px-1">
        <div className="w-9 h-9 rounded-lg bg-[#1e1f22] border border-white/10 flex items-center justify-center text-amber-400 shrink-0 shadow-sm">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm text-white truncate leading-tight">{heading}</div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
            {elapsed && <span className="font-mono">{elapsed}</span>}
            {elapsed && <span className="text-gray-600">·</span>}
            <span className="truncate">{streamerName}</span>
            {viewers > 0 && <span className="text-gray-600">·</span>}
            {viewers > 0 && <span className="flex items-center gap-1 shrink-0"><Eye size={11} />{viewers} watching</span>}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="w-full py-2.5 px-4 bg-[#23a55a] hover:bg-[#1d8c4c] active:bg-[#187840] text-white font-bold rounded-lg flex items-center justify-center gap-2 text-sm shadow-md transition-colors cursor-pointer"
        onClick={() => {
          onWatchStream();
          onClose();
        }}
      >
        <Tv size={16} />
        <span>{kind === "watch" ? "Join Watch Party" : "Watch Stream"}</span>
      </button>
    </div>
  );
}
