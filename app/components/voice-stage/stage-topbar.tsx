"use client";

import { Volume2, Monitor, ExternalLink } from "lucide-react";
import type { VoiceParticipant } from "@/lib/protocol";
import { nextScreenQuality, screenQualityLabel } from "../../hooks/use-voice";
import { VoiceApi, VideoTile } from "./types";

export function StageTopbar({
  hideTopbar,
  channelName,
  focused,
  streamerName,
  participants,
  voice,
  onPopout,
  viewMode,
  handleViewModeChange,
  onToggleBattlemap,
  battlemapOpen,
}: {
  hideTopbar: boolean;
  channelName: string;
  focused: VideoTile | null;
  streamerName: string;
  participants: VoiceParticipant[];
  voice: VoiceApi;
  onPopout: (() => void) | undefined;
  viewMode: "grid" | "table" | "map";
  handleViewModeChange: (mode: "grid" | "table" | "map") => void;
  onToggleBattlemap: (() => void) | undefined;
  battlemapOpen: boolean | undefined;
}) {
  return (
    <>
      {!hideTopbar && (
        <div className="voice-stage-topbar">
          <div className="voice-stage-topbar-info flex items-center gap-2 min-w-0">
            <Volume2 size={16} className="voice-stage-volume-icon text-[var(--muted)] flex-shrink-0" />
            <div className="voice-stage-title-wrap min-w-0 flex items-center gap-2">
              <h2 className="voice-stage-title truncate">{channelName}</h2>
              {focused && (
                <>
                  <span className="voice-stage-topbar-divider text-[var(--muted)]/40 font-light select-none">/</span>
                  <div className="voice-stage-stream-badge flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--line)] text-xs text-[var(--ink)] font-semibold truncate">
                    <Monitor size={13} className="text-[var(--lavender)] flex-shrink-0" />
                    <span className="truncate">{streamerName}'s Screen</span>
                  </div>
                </>
              )}
              <span className="voice-stage-sub text-xs text-[var(--muted)] flex-shrink-0">· {participants.length} in call</span>
            </div>
          </div>

          <div className="voice-stage-topbar-actions flex items-center gap-2 flex-shrink-0">
            {focused && (
              <div className="voice-stream-quality-pill flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--panel)] border border-[var(--line)] shadow-sm">
                <button
                  type="button"
                  className="voice-quality-btn text-[11px] font-bold text-[var(--ink)] hover:text-[var(--lavender)] transition-colors cursor-pointer"
                  title="Click to cycle screen resolution & FPS"
                  onClick={() => {
                    const nextQ = nextScreenQuality(voice.screenQuality);
                    voice.setScreenQuality(nextQ);
                  }}
                >
                  {screenQualityLabel(voice.screenQuality)}
                </button>
                <span className="voice-live-badge-red text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#ed4245] text-white">
                  LIVE
                </span>
              </div>
            )}

            {onPopout && focused && (
              <button
                type="button"
                className="voice-stage-topbar-btn"
                onClick={onPopout}
                title="Pop out to floating movable preview"
              >
                <ExternalLink size={15} />
              </button>
            )}

            <div className="voice-view-switcher">
              {(["grid", "table", "map"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`voice-view-pill ${viewMode === mode ? "active" : ""}`}
                  onClick={() => {
                    handleViewModeChange(mode);
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
        </div>
      )}
    </>
  );
}
