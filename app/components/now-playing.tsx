"use client";

import { proxiedImage } from "@/app/lib/image-proxy";
import { useCallback, type MouseEvent } from "react";
import { Volume2, Music2, ExternalLink, Maximize2, Play, Pause, SkipForward } from "lucide-react";
import { playbackPosition, type PlayerState } from "@/lib/protocol";
import { formatDuration } from "../lib/client";
import { useI18n } from "../lib/i18n-context";

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
  /** Personal volume preference (0-100). */
  volume?: number;
  onVolume: (volume: number) => void;
  voiceChannelName?: string;
  /** Opens the full-screen player for this room. */
  onExpand?: () => void;
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
  volume,
  onVolume,
  voiceChannelName,
  onExpand,
}: NowPlayingProps) {
  const { t } = useI18n();
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
        <div className="now-playing-title">{trackLabel || t("music.np.trackFinished")}</div>
        <p className="now-playing-sub">
          {track ? t("music.np.finishedMovedOn") : t("music.np.finished")}
        </p>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="now-playing idle">
        <div className="now-playing-title">{t("music.np.nothingPlaying")}</div>
        <p className="now-playing-sub">
          {t("music.np.usePlayPrefix")} <code>/play</code> {t("music.np.usePlaySuffix")}
        </p>
      </div>
    );
  }

  return (
    <div className={`now-playing${state && !state.paused ? " is-playing" : ""}`}>
      {/* Only the Winamp theme shows these: its analyser strip, which dances
          while the room is playing (decoration; it does not read the audio). */}
      <span className="now-playing-viz" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => (
          <i key={index} style={{ animationDelay: `${(index * 137) % 600}ms` }} />
        ))}
      </span>
      <div className="now-playing-head">
        {track.thumbnail ? (
          <img className="now-playing-art" src={proxiedImage(track.thumbnail)} alt="" />
        ) : (
          <div className="now-playing-art placeholder"><Music2 size={22} /></div>
        )}
        <div className="now-playing-meta">
          <div className="now-playing-title">{track.title}</div>
          {track.artist && (
            <div className="now-playing-artist">{track.artist}</div>
          )}
          <div className="now-playing-sub">
            {voiceChannelName ? t("music.np.inRoom", { room: voiceChannelName }) : ""}
            {t("music.np.addedBy", { name: track.requestedBy })}
            {state && state.queue.length > 0
              ? t("music.np.inQueue", { count: state.queue.length })
              : ""}
          </div>
        </div>
        {track.pageUrl && (
          <a
            className="now-playing-source"
            href={track.pageUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t("music.np.openSource")}
          >
            <ExternalLink size={15} />
          </a>
        )}
        {onExpand && (
          <button
            type="button"
            className="now-playing-source"
            onClick={onExpand}
            aria-label={t("music.lyrics.expandAria")}
            title={t("music.np.expandTitle")}
          >
            <Maximize2 size={15} />
          </button>
        )}
      </div>

      <div
        className={`now-playing-bar ${controllable ? "seekable" : ""}`}
        onClick={seekFromEvent}
        role={controllable ? "slider" : undefined}
        aria-label={controllable ? t("music.np.seek") : undefined}
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000) || undefined}
        aria-valuenow={Math.round(current / 1000)}
        title={controllable ? t("music.np.seekTitle") : undefined}
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
            aria-label={state?.paused ? t("chat.renderer.musicResume") : t("chat.renderer.musicPause")}
          >
            {state?.paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button type="button" onClick={onSkip} aria-label={t("chat.renderer.musicSkip")}>
            <SkipForward size={16} />
          </button>
          <label
            className="now-playing-volume"
            title={`${t("music.np.personalVolumeTitle", { vol: volume ?? 100 })}${state ? t("music.np.roomVolumeSuffix", { vol: state.volume }) : ""}`}
          >
            <Volume2 size={16} aria-hidden="true" />
            <input
              type="range"
              min={0}
              max={100}
              value={volume ?? 100}
              aria-label={t("music.np.personalVolumeAria")}
              onChange={(event) => onVolume(Number(event.target.value))}
            />
          </label>
        </div>
      )}

      {blocked && (
        <button type="button" className="now-playing-unblock" onClick={onUnblock}>
          {t("music.np.unblockAutoplay")}
        </button>
      )}
    </div>
  );
}
