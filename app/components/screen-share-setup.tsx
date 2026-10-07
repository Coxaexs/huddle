"use client";

import { Monitor, X } from "lucide-react";
import {
  makeScreenQuality,
  SCREEN_FRAMERATES,
  SCREEN_RESOLUTIONS,
  screenQualityParts,
  type ScreenShareQuality,
} from "../hooks/use-voice";

/**
 * Picks how to share before the browser's own picker opens: resolution and
 * frame rate on their own, film mode on top, and whether sound comes along.
 */
export function ScreenShareSetup({
  quality,
  onQuality,
  film,
  onFilm,
  audio,
  onAudio,
  onStart,
  onClose,
  className = "",
}: {
  quality: ScreenShareQuality;
  onQuality: (quality: ScreenShareQuality) => void;
  film: boolean;
  onFilm: (film: boolean) => void;
  audio: boolean;
  onAudio: (audio: boolean) => void;
  onStart: () => void;
  onClose: () => void;
  className?: string;
}) {
  const { height, fps } = screenQualityParts(quality);
  const chip = (selected: boolean) =>
    `screen-setup-chip px-2 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
      selected
        ? "selected bg-[var(--lavender)] text-white shadow-sm"
        : "bg-[var(--line)]/50 text-[var(--ink)] hover:bg-[var(--line)]"
    }`;
  return (
    <div
      className={`screen-share-setup p-3.5 rounded-2xl bg-[var(--panel)] border border-[var(--line)] shadow-2xl flex flex-col gap-3 ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <div className="screen-setup-title flex items-center gap-1.5 font-bold text-xs text-[var(--ink)]">
          <Monitor size={14} className="text-[var(--lavender)]" />
          <span>Share Screen</span>
        </div>
        <button
          type="button"
          className="screen-setup-close text-[var(--muted)] hover:text-[var(--ink)] p-1 rounded-md transition-colors cursor-pointer"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Resolution">
        <span className="screen-setup-label text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          Resolution
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          {SCREEN_RESOLUTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={height === option}
              className={chip(height === option)}
              onClick={() => onQuality(makeScreenQuality(option, fps))}
            >
              {option}p
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Frame rate">
        <span className="screen-setup-label text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
          Frame rate
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          {SCREEN_FRAMERATES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={fps === option}
              className={chip(fps === option)}
              onClick={() => onQuality(makeScreenQuality(height, option))}
            >
              {option} fps
            </button>
          ))}
        </div>
      </div>

      <div className="screen-setup-options p-2.5 rounded-xl bg-[var(--line)]/30 border border-[var(--line)] flex flex-col gap-2">
        <label className="flex items-start gap-2 cursor-pointer text-xs font-semibold text-[var(--ink)] select-none">
          <input
            type="checkbox"
            checked={film}
            onChange={(event) => {
              onFilm(event.target.checked);
              // Films are shot at 24: switching film mode on picks it for you.
              if (event.target.checked && fps !== 24) onQuality(makeScreenQuality(height, 24));
            }}
            className="accent-[var(--lavender)] rounded mt-0.5"
          />
          <span>
            Film mode
            <small className="block text-[10px] font-normal text-[var(--muted)] leading-tight">
              Smooth motion over sharp text, for movies and videos
            </small>
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer text-xs font-semibold text-[var(--ink)] select-none">
          <input
            type="checkbox"
            checked={audio}
            onChange={(event) => onAudio(event.target.checked)}
            className="accent-[var(--lavender)] rounded mt-0.5"
          />
          <span>
            Share stream audio
            <small className="block text-[10px] font-normal text-[var(--muted)] leading-tight">
              Captures tab, game, or system sound so viewers can hear it
            </small>
          </span>
        </label>
      </div>

      <button
        type="button"
        className="screen-setup-start w-full py-2 px-3 rounded-xl bg-[var(--lavender)] text-white text-xs font-bold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
        onClick={onStart}
      >
        <Monitor size={14} />
        <span>Start Sharing</span>
      </button>
    </div>
  );
}
