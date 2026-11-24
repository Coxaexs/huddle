"use client";

import { Captions } from "lucide-react";
import { useSubtitleLine, useSubtitles } from "../lib/subtitles";
import { useI18n } from "../lib/i18n-context";

/** This viewer's subtitles, drawn over the film; `time` is the film's position in seconds. */
export function SubtitleOverlay({ url, time, className = "" }: { url: string; time: () => number | null; className?: string }) {
  const { picked } = useSubtitles(url);
  const line = useSubtitleLine(picked, time);
  if (!line) return null;
  return (
    <div className={`watch-subtitles ${className}`} aria-live="off">
      {line.split("\n").map((text, i) => (
        <span key={i}>{text}</span>
      ))}
    </div>
  );
}

/** Off or one of the film's text subtitle tracks; just for this viewer. Nothing when it has none. */
export function SubtitlePicker({ url, className = "" }: { url: string; className?: string }) {
  const { t } = useI18n();
  const { tracks, picked, choose } = useSubtitles(url);
  if (!tracks.length) return null;
  return (
    <label
      className={`watch-subtitle-picker ${className}`}
      title={t("voice.subtitles.title")}
      onClick={(event) => event.stopPropagation()}
    >
      <Captions size={14} aria-hidden="true" />
      <select
        aria-label={t("voice.subtitles.aria")}
        value={picked ? String(picked.index) : "off"}
        onChange={(event) => {
          const value = event.target.value;
          choose(value === "off" ? null : tracks.find((t) => String(t.index) === value) ?? null);
        }}
      >
        <option value="off">{t("voice.subtitles.off")}</option>
        {tracks.map((track) => (
          <option key={track.index} value={String(track.index)}>{track.label}</option>
        ))}
      </select>
    </label>
  );
}
