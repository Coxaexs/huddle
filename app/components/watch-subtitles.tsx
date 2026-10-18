"use client";

import { Captions } from "lucide-react";
import { useSubtitleLine, useSubtitles } from "../lib/subtitles";

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
  const { tracks, picked, choose } = useSubtitles(url);
  if (!tracks.length) return null;
  return (
    <label
      className={`watch-subtitle-picker ${className}`}
      title="Subtitles (just for you)"
      onClick={(event) => event.stopPropagation()}
    >
      <Captions size={14} aria-hidden="true" />
      <select
        aria-label="Subtitles"
        value={picked ? String(picked.index) : "off"}
        onChange={(event) => {
          const value = event.target.value;
          choose(value === "off" ? null : tracks.find((t) => String(t.index) === value) ?? null);
        }}
      >
        <option value="off">Off</option>
        {tracks.map((track) => (
          <option key={track.index} value={String(track.index)}>{track.label}</option>
        ))}
      </select>
    </label>
  );
}
