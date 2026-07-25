"use client";

import { useState } from "react";

export interface MusicSettings {
  autoplay?: boolean;
  automix?: boolean;
  automix_blend_seconds?: number;
  crossfade_seconds?: number;
  audio_filter?: string | null;
  artist_diversity?: boolean;
  vibe_match?: boolean;
}

interface MusicSettingsCardProps {
  settings: MusicSettings;
  disabled?: boolean;
  onCommand: (command: string) => Promise<MusicSettings | void>;
}

function Toggle({
  label,
  hint,
  enabled,
  onClick,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`music-setting-toggle ${enabled ? "active" : ""}`}
      aria-pressed={enabled}
      onClick={onClick}
    >
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <i aria-hidden="true" />
    </button>
  );
}

export function MusicSettingsCard({
  settings: initial,
  disabled,
  onCommand,
}: MusicSettingsCardProps) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function apply(command: string) {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const next = await onCommand(command);
      if (next) setSettings((current) => ({ ...current, ...next }));
    } finally {
      setBusy(false);
    }
  }

  const blend = settings.automix_blend_seconds || 8;
  const crossfade = settings.crossfade_seconds || 0;
  const filter = settings.audio_filter || "off";

  return (
    <section className="music-settings-card">
      <header>
        <span className="music-card-icon" aria-hidden="true">♫</span>
        <div>
          <strong>Music room controls</strong>
          <small>Changes apply to this Huddle voice room</small>
        </div>
        <span className={`music-live-pill ${disabled ? "" : "live"}`}>
          {disabled ? "Join voice" : "Live"}
        </span>
      </header>

      <div className="music-toggle-grid">
        <Toggle
          label="Smart Autoplay"
          hint="Keep the room playing"
          enabled={Boolean(settings.autoplay)}
          onClick={() => void apply(`/autoplay ${settings.autoplay ? "off" : "on"}`)}
        />
        <Toggle
          label="AutoMix"
          hint="Smooth track transitions"
          enabled={Boolean(settings.automix)}
          onClick={() => void apply(`/automix ${settings.automix ? "off" : "on"}`)}
        />
        <Toggle
          label="Artist diversity"
          hint="Avoid repeat artists"
          enabled={Boolean(settings.artist_diversity)}
          onClick={() =>
            void apply(`/artistdiversity ${settings.artist_diversity ? "off" : "on"}`)
          }
        />
        <Toggle
          label="Vibe matching"
          hint="Keep similar energy"
          enabled={Boolean(settings.vibe_match)}
          onClick={() =>
            void apply(`/vibematch ${settings.vibe_match ? "off" : "on"}`)
          }
        />
      </div>

      <div className="music-slider-grid">
        <label>
          <span>AutoMix blend <b>{blend}s</b></span>
          <input
            type="range"
            min={4}
            max={15}
            value={blend}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                automix_blend_seconds: Number(event.target.value),
              }))
            }
            onPointerUp={(event) =>
              void apply(`/automixblend ${(event.target as HTMLInputElement).value}`)
            }
          />
        </label>
        <label>
          <span>Crossfade <b>{crossfade}s</b></span>
          <input
            type="range"
            min={0}
            max={10}
            value={crossfade}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                crossfade_seconds: Number(event.target.value),
              }))
            }
            onPointerUp={(event) =>
              void apply(`/crossfade ${(event.target as HTMLInputElement).value}`)
            }
          />
        </label>
      </div>

      <div className="music-filter-row" aria-label="Music filter">
        {["off", "bassboost", "nightcore", "slowed", "8d", "karaoke"].map(
          (preset) => (
            <button
              type="button"
              key={preset}
              className={filter === preset ? "active" : ""}
              onClick={() => void apply(`/filter ${preset}`)}
            >
              {preset === "off" ? "Clean" : preset}
            </button>
          ),
        )}
      </div>

      <div className="music-quick-actions">
        <button type="button" onClick={() => void onCommand("/like")}>♡ Like</button>
        <button type="button" onClick={() => void onCommand("/dislike")}>⊘ Avoid</button>
        <button type="button" onClick={() => void onCommand("/lyricsnow")}>♪ Lyrics</button>
        <button type="button" onClick={() => void onCommand("/queue")}>≡ Queue</button>
        <button type="button" onClick={() => void onCommand("/shuffle")}>⤨ Shuffle</button>
        <button type="button" onClick={() => void onCommand("/wrapped")}>✦ Wrapped</button>
      </div>
    </section>
  );
}

export function MusicStatsCard({
  wrapped,
  label,
  plays = 0,
  unique = 0,
  hours = 0,
  topSongs = [],
  topRequesters = [],
}: {
  wrapped?: boolean;
  label?: string;
  plays?: number;
  unique?: number;
  hours?: number;
  topSongs?: Array<[string, number]>;
  topRequesters?: Array<[string, number]>;
}) {
  const maximum = Math.max(1, ...topSongs.map(([, count]) => count));
  return (
    <section className={`music-stats-card ${wrapped ? "wrapped" : ""}`}>
      <header>
        <span className="music-card-icon" aria-hidden="true">
          {wrapped ? "✦" : "↗"}
        </span>
        <div>
          <strong>{wrapped ? "Room Wrapped" : "Listening stats"}</strong>
          <small>{label || "All time in this room"}</small>
        </div>
      </header>
      <div className="music-stat-totals">
        <div><b>{plays}</b><span>plays</span></div>
        <div><b>{unique}</b><span>unique tracks</span></div>
        <div><b>{hours}</b><span>hours</span></div>
      </div>
      <div className="music-chart">
        <h4>Top tracks</h4>
        {topSongs.length ? topSongs.map(([title, count], index) => (
          <div className="music-chart-row" key={`${title}-${index}`}>
            <span className="music-chart-rank">{index + 1}</span>
            <div>
              <span>{title}</span>
              <i style={{ width: `${Math.max(12, (count / maximum) * 100)}%` }} />
            </div>
            <b>{count}×</b>
          </div>
        )) : <p className="music-empty">Play a few tracks and they will appear here.</p>}
      </div>
      {topRequesters.length > 0 && (
        <div className="music-requesters">
          <h4>Top listeners</h4>
          {topRequesters.map(([name, count]) => (
            <span key={name}>{name}<b>{count}</b></span>
          ))}
        </div>
      )}
    </section>
  );
}
