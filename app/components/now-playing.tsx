"use client";

import { useCallback, type MouseEvent } from "react";
import { playbackPosition, type PlayerState } from "@/lib/protocol";
import { formatDuration } from "../lib/client";

interface NowPlayingProps {
  state: PlayerState | null;
  /** The track this card was posted for; when it no longer matches what the
   *  room is playing, the card shows history instead of live controls. */
  trackId?: string;
  trackLabel?: string;
  /** Live position in ms, ticking locally between hub updates. */
  position: number;
  /** False when you are not in this voice room — the card becomes read-only. */
  controllable: boolean;
  blocked: boolean;
  onUnblock: () => void;
  onSeek: (positionMs: number) => void;
  onToggle: () => void;
  onSkip: () => void;
  onVolume: (volume: number) => void;
  voiceChannelName?: string;
}

/**
 * The now-playing card. The bar is the control: clicking anywhere on it seeks
 * for everyone in the room, exactly like scrubbing on the web dashboard.
 */
export function NowPlaying({
  state,
  trackId,
  trackLabel,
  position,
  controllable,
  blocked,
  onUnblock,
  onSeek,
  onToggle,
  onSkip,
  onVolume,
  voiceChannelName,
}: NowPlayingProps) {
  const track = state?.track || null;
  const stale = Boolean(trackId && track && track.id !== trackId);
  const durationMs = track?.duration ? track.duration * 1000 : 0;
  const current = state
    ? Math.min(position || playbackPosition(state), durationMs || position)
    : 0;
  const progress = durationMs ? Math.min(1, current / durationMs) : 0;

  const seekFromEvent = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!controllable || !durationMs) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (event.clientX - bounds.left) / bounds.width),
      );
      onSeek(Math.round(ratio * durationMs));
    },
    [controllable, durationMs, onSeek],
  );

  if (stale || (!track && trackLabel)) {
    return (
      <div className="now-playing idle">
        <div className="now-playing-title">{trackLabel || "That track finished."}</div>
        <p className="now-playing-sub">
          {track ? "Finished — the room has moved on." : "Finished."}
        </p>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="now-playing idle">
        <div className="now-playing-title">Nothing is playing right now.</div>
        <p className="now-playing-sub">
          Use <code>/play</code> in a voice channel to start something.
        </p>
      </div>
    );
  }

  return (
    <div className="now-playing">
      <div className="now-playing-head">
        {track.thumbnail ? (
          <img className="now-playing-art" src={track.thumbnail} alt="" />
        ) : (
          <div className="now-playing-art placeholder">♫</div>
        )}
        <div className="now-playing-meta">
          <div className="now-playing-title">{track.title}</div>
          {track.artist && (
            <div className="now-playing-artist">{track.artist}</div>
          )}
          <div className="now-playing-sub">
            {voiceChannelName ? `In ${voiceChannelName} · ` : ""}
            added by {track.requestedBy}
            {state && state.queue.length > 0
              ? ` · ${state.queue.length} in queue`
              : ""}
          </div>
        </div>
        {track.pageUrl && (
          <a
            className="now-playing-source"
            href={track.pageUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open source"
          >
            ↗
          </a>
        )}
      </div>

      <div
        className={`now-playing-bar ${controllable ? "seekable" : ""}`}
        onClick={seekFromEvent}
        role={controllable ? "slider" : undefined}
        aria-label={controllable ? "Seek" : undefined}
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000) || undefined}
        aria-valuenow={Math.round(current / 1000)}
        title={controllable ? "Click to jump to that spot" : undefined}
      >
        <div className="now-playing-fill" style={{ width: `${progress * 100}%` }}>
          <span className="now-playing-knob" />
        </div>
      </div>

      <div className="now-playing-times">
        <span>{formatDuration(current / 1000)}</span>
        <span>{formatDuration(track.duration)}</span>
      </div>

      {controllable && (
        <div className="now-playing-controls">
          <button
            type="button"
            onClick={onToggle}
            aria-label={state?.paused ? "Resume" : "Pause"}
          >
            {state?.paused ? "▶" : "❚❚"}
          </button>
          <button type="button" onClick={onSkip} aria-label="Skip">
            ⏭
          </button>
          <label className="now-playing-volume">
            <span aria-hidden="true">🔊</span>
            <input
              type="range"
              min={0}
              max={100}
              value={state?.volume ?? 100}
              aria-label="Volume"
              onChange={(event) => onVolume(Number(event.target.value))}
            />
          </label>
        </div>
      )}

      {blocked && (
        <button type="button" className="now-playing-unblock" onClick={onUnblock}>
          Your browser blocked autoplay — click to hear the music
        </button>
      )}
    </div>
  );
}
