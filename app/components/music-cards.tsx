"use client";

import { useState } from "react";

export interface MusicSettings {
  voiceChannelId?: string;
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
        <span className="music-card-icon" aria-hidden="true">
          ⚙️
        </span>
        <div>
          <strong>Music room settings</strong>
          <small>Configure audio, playback, and AI DJ features for this room</small>
        </div>
        <span className={`music-live-pill ${disabled ? "" : "live"}`}>
          {disabled ? "Join voice" : "Live Room"}
        </span>
      </header>

      <div className="music-card-section-label">Playback & AI Controls</div>
      <div className="music-toggle-grid">
        <Toggle
          label="Smart Autoplay"
          hint="Keep room playing related tracks"
          enabled={Boolean(settings.autoplay)}
          onClick={() => void apply(`/autoplay ${settings.autoplay ? "off" : "on"}`)}
        />
        <Toggle
          label="AutoMix DJ"
          hint="Seamless track blending"
          enabled={Boolean(settings.automix)}
          onClick={() => void apply(`/automix ${settings.automix ? "off" : "on"}`)}
        />
        <Toggle
          label="Artist diversity"
          hint="Avoid repeat artist tracks"
          enabled={Boolean(settings.artist_diversity)}
          onClick={() =>
            void apply(`/artistdiversity ${settings.artist_diversity ? "off" : "on"}`)
          }
        />
        <Toggle
          label="Vibe matching"
          hint="Maintain mood energy"
          enabled={Boolean(settings.vibe_match)}
          onClick={() =>
            void apply(`/vibematch ${settings.vibe_match ? "off" : "on"}`)
          }
        />
      </div>

      <div className="music-card-section-label">Mix & Transition Timings</div>
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

      <div className="music-card-section-label">Audio Effects & Filters</div>
      <div className="music-filter-row" aria-label="Music filter">
        {[
          { id: "off", label: "🧼 Clean" },
          { id: "bassboost", label: "🔊 Bass Boost" },
          { id: "nightcore", label: "⚡ Nightcore" },
          { id: "slowed", label: "🌙 Slowed" },
          { id: "8d", label: "🎧 8D Spatial" },
          { id: "karaoke", label: "🎤 Karaoke" },
        ].map((preset) => (
          <button
            type="button"
            key={preset.id}
            className={filter === preset.id ? "active" : ""}
            onClick={() => void apply(`/filter ${preset.id}`)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="music-quick-actions">
        <button type="button" onClick={() => void onCommand("/wrapped")}>✦ Wrapped</button>
        <button type="button" onClick={() => void onCommand("/stats")}>📊 Stats</button>
        <button type="button" onClick={() => void onCommand("/like")}>♡ Like</button>
        <button type="button" onClick={() => void onCommand("/dislike")}>⊘ Avoid</button>
        <button type="button" onClick={() => void onCommand("/lyricsnow")}>♪ Lyrics</button>
        <button type="button" onClick={() => void onCommand("/queue")}>≡ Queue</button>
        <button type="button" onClick={() => void onCommand("/shuffle")}>⤨ Shuffle</button>
      </div>
    </section>
  );
}

export interface MusicStatsCardProps {
  wrapped?: boolean;
  label?: string;
  plays?: number;
  unique?: number;
  hours?: number;
  topSongs?: Array<[string, number]>;
  topRequesters?: Array<[string, number]>;
  topArtist?: string | null;
  topGenre?: string | null;
  peakHour?: string | null;
  streakDays?: number;
  personality?: string | null;
  disabled?: boolean;
  onCommand?: (command: string) => Promise<MusicSettings | void>;
}

export function MusicStatsCard({
  wrapped,
  label,
  plays = 0,
  unique = 0,
  hours = 0,
  topSongs = [],
  topRequesters = [],
  topArtist,
  topGenre,
  peakHour,
  streakDays,
  personality,
  disabled,
  onCommand,
}: MusicStatsCardProps) {
  const [requestingTrack, setRequestingTrack] = useState<string | null>(null);
  const maximum = Math.max(1, ...topSongs.map(([, count]) => count));

  async function handlePlayTrack(title: string) {
    if (!onCommand || disabled) return;
    setRequestingTrack(title);
    try {
      await onCommand(`/play ${title}`);
    } finally {
      setRequestingTrack(null);
    }
  }

  return (
    <section className={`music-stats-card ${wrapped ? "wrapped" : ""}`}>
      <header>
        <span className="music-card-icon" aria-hidden="true">
          {wrapped ? "✦" : "📊"}
        </span>
        <div>
          <strong>{wrapped ? "Room Wrapped 2026" : "Room listening stats"}</strong>
          <small>{label || (wrapped ? "Annual music recap & highlights" : "All time in this room")}</small>
        </div>
        <span className={`music-live-pill ${wrapped ? "wrapped-pill" : "live"}`}>
          {wrapped ? "✦ WRAPPED" : "LIVE STATS"}
        </span>
      </header>

      {/* Wrapped Special Banner / Personality Highlights */}
      {(wrapped || personality || topArtist || topGenre) && (
        <div className="music-wrapped-highlights">
          {personality && (
            <div className="music-highlight-badge">
              <span className="music-highlight-icon">✨</span>
              <div>
                <small>Room Personality</small>
                <strong>{personality}</strong>
              </div>
            </div>
          )}
          {topArtist && (
            <div className="music-highlight-badge">
              <span className="music-highlight-icon">👑</span>
              <div>
                <small>Top Artist</small>
                <strong>{topArtist}</strong>
              </div>
            </div>
          )}
          {topGenre && (
            <div className="music-highlight-badge">
              <span className="music-highlight-icon">🎶</span>
              <div>
                <small>Top Genre</small>
                <strong>{topGenre}</strong>
              </div>
            </div>
          )}
          {peakHour && (
            <div className="music-highlight-badge">
              <span className="music-highlight-icon">🌙</span>
              <div>
                <small>Peak Listening</small>
                <strong>{peakHour}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Totals Grid */}
      <div className="music-stat-totals">
        <div>
          <b>{plays}</b>
          <span>Total Plays</span>
        </div>
        <div>
          <b>{unique}</b>
          <span>Unique Tracks</span>
        </div>
        <div>
          <b>{hours}</b>
          <span>Listening Hours</span>
        </div>
        {streakDays ? (
          <div>
            <b>{streakDays}d</b>
            <span>Active Streak</span>
          </div>
        ) : null}
      </div>

      {/* Top Tracks Chart with Play Action */}
      <div className="music-chart">
        <h4>Top tracks</h4>
        {topSongs.length ? (
          topSongs.map(([title, count], index) => {
            const isPlayingThis = requestingTrack === title;
            return (
              <div className="music-chart-row" key={`${title}-${index}`}>
                <span className={`music-chart-rank rank-${index + 1}`}>
                  {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}
                </span>
                <div className="music-chart-info">
                  <span title={title}>{title}</span>
                  <i style={{ width: `${Math.max(10, (count / maximum) * 100)}%` }} />
                </div>
                <b className="music-chart-count">{count}×</b>
                {onCommand && (
                  <button
                    type="button"
                    className="music-play-track-btn"
                    disabled={disabled || isPlayingThis}
                    onClick={() => void handlePlayTrack(title)}
                    title={`Play ${title}`}
                  >
                    {isPlayingThis ? "⌛" : "▶ Play"}
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <p className="music-empty">Play a few tracks and your top room history will appear here.</p>
        )}
      </div>

      {/* Top Listeners / Requesters */}
      {topRequesters.length > 0 && (
        <div className="music-requesters">
          <h4>Top listeners</h4>
          <div className="music-requester-tags">
            {topRequesters.map(([name, count]) => (
              <span key={name} className="music-requester-chip">
                👤 {name} <b>{count} plays</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer Navigation Shortcuts */}
      {onCommand && (
        <div className="music-quick-actions">
          {!wrapped && (
            <button type="button" onClick={() => void onCommand("/wrapped")}>
              ✦ Room Wrapped
            </button>
          )}
          {wrapped && (
            <button type="button" onClick={() => void onCommand("/stats")}>
              📊 Listening Stats
            </button>
          )}
          <button type="button" onClick={() => void onCommand("/settings")}>
            ⚙️ Room Settings
          </button>
          <button type="button" onClick={() => void onCommand("/lyricsnow")}>
            ♪ Lyrics
          </button>
        </div>
      )}
    </section>
  );
}

export interface MusicQueueItem {
  index: number;
  id?: string;
  title: string;
  artist?: string | null;
  duration?: number | null;
}

export interface MusicQueueCardProps {
  currentTrack?: { title: string; artist?: string | null; duration?: number | null } | null;
  queue?: MusicQueueItem[];
  totalTracks?: number;
  disabled?: boolean;
  onCommand?: (command: string) => Promise<MusicSettings | void>;
}

export function MusicQueueCard({
  currentTrack,
  queue = [],
  totalTracks = 0,
  disabled,
  onCommand,
}: MusicQueueCardProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function handleAction(command: string) {
    if (!onCommand || disabled) return;
    setBusyAction(command);
    try {
      await onCommand(command);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="music-queue-card">
      <header>
        <span className="music-card-icon" aria-hidden="true">
          ≡
        </span>
        <div>
          <strong>Room Music Queue</strong>
          <small>{queue.length ? `${queue.length} track${queue.length === 1 ? "" : "s"} waiting in queue` : "The queue is currently empty"}</small>
        </div>
        <span className="music-live-pill live">
          {queue.length ? `${queue.length} QUEUED` : "READY"}
        </span>
      </header>

      {currentTrack && (
        <div className="music-now-playing-banner">
          <span className="music-eq-icon">🎵</span>
          <div className="music-np-details">
            <small>NOW PLAYING</small>
            <strong>{currentTrack.title}</strong>
            {currentTrack.artist && <span>{currentTrack.artist}</span>}
          </div>
          {onCommand && (
            <div className="music-np-quick-actions">
              <button
                type="button"
                className="music-play-track-btn"
                disabled={disabled || busyAction === "/skip"}
                onClick={() => void handleAction("/skip")}
              >
                ⏭ Skip
              </button>
            </div>
          )}
        </div>
      )}

      <div className="music-chart">
        <h4>Up Next ({queue.length})</h4>
        {queue.length ? (
          queue.map((item) => (
            <div className="music-chart-row queue-row" key={`${item.title}-${item.index}`}>
              <span className="music-chart-rank">#{item.index}</span>
              <div className="music-chart-info">
                <span title={item.title}>{item.title}</span>
                {item.artist && <small>{item.artist}</small>}
              </div>
              {onCommand && (
                <div className="music-queue-item-btns">
                  <button
                    type="button"
                    className="music-play-track-btn"
                    disabled={disabled || busyAction === `/skipto ${item.index}`}
                    onClick={() => void handleAction(`/skipto ${item.index}`)}
                    title={`Skip directly to #${item.index}`}
                  >
                    ▶ Jump
                  </button>
                  <button
                    type="button"
                    className="music-remove-btn"
                    disabled={disabled || busyAction === `/remove ${item.index}`}
                    onClick={() => void handleAction(`/remove ${item.index}`)}
                    title={`Remove #${item.index}`}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="music-empty">The queue is empty. Use <code>/play song name</code> to add tracks.</p>
        )}
      </div>

      {onCommand && (
        <div className="music-quick-actions">
          <button type="button" onClick={() => void handleAction("/shuffle")}>⤨ Shuffle</button>
          <button type="button" onClick={() => void handleAction("/removedupes")}>⟳ Remove Dupes</button>
          <button type="button" onClick={() => void handleAction("/clear")}>🗑 Clear Queue</button>
          <button type="button" onClick={() => void onCommand("/settings")}>⚙️ Settings</button>
        </div>
      )}
    </section>
  );
}

export interface MusicHistoryCardProps {
  history?: Array<{ index: number; title: string; artist?: string | null; duration?: number | null }>;
  disabled?: boolean;
  onCommand?: (command: string) => Promise<MusicSettings | void>;
}

export function MusicHistoryCard({
  history = [],
  disabled,
  onCommand,
}: MusicHistoryCardProps) {
  const [requestingTrack, setRequestingTrack] = useState<string | null>(null);

  async function handlePlay(title: string) {
    if (!onCommand || disabled) return;
    setRequestingTrack(title);
    try {
      await onCommand(`/play ${title}`);
    } finally {
      setRequestingTrack(null);
    }
  }

  return (
    <section className="music-history-card">
      <header>
        <span className="music-card-icon" aria-hidden="true">
          📜
        </span>
        <div>
          <strong>Room Listening History</strong>
          <small>Recently played tracks in this room</small>
        </div>
        <span className="music-live-pill live">HISTORY</span>
      </header>

      <div className="music-chart">
        {history.length ? (
          history.map((item) => (
            <div className="music-chart-row" key={`${item.title}-${item.index}`}>
              <span className="music-chart-rank">#{item.index}</span>
              <div className="music-chart-info">
                <span title={item.title}>{item.title}</span>
                {item.artist && <small>{item.artist}</small>}
              </div>
              {onCommand && (
                <button
                  type="button"
                  className="music-play-track-btn"
                  disabled={disabled || requestingTrack === item.title}
                  onClick={() => void handlePlay(item.title)}
                >
                  {requestingTrack === item.title ? "⌛" : "▶ Replay"}
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="music-empty">This room has not played anything yet.</p>
        )}
      </div>

      {onCommand && (
        <div className="music-quick-actions">
          <button type="button" onClick={() => void onCommand("/stats")}>📊 Stats</button>
          <button type="button" onClick={() => void onCommand("/wrapped")}>✦ Wrapped</button>
          <button type="button" onClick={() => void onCommand("/settings")}>⚙️ Settings</button>
        </div>
      )}
    </section>
  );
}

export interface MusicSearchCardProps {
  query?: string;
  track?: { title: string; artist?: string | null; duration?: number | null; pageUrl?: string | null };
  disabled?: boolean;
  onCommand?: (command: string) => Promise<MusicSettings | void>;
}

export function MusicSearchCard({
  query,
  track,
  disabled,
  onCommand,
}: MusicSearchCardProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function handleAction(command: string) {
    if (!onCommand || disabled) return;
    setBusyAction(command);
    try {
      await onCommand(command);
    } finally {
      setBusyAction(null);
    }
  }

  if (!track) return null;

  return (
    <section className="music-search-card">
      <header>
        <span className="music-card-icon" aria-hidden="true">
          🔍
        </span>
        <div>
          <strong>Search Result</strong>
          <small>Top hit for "{query}"</small>
        </div>
        <span className="music-live-pill live">MATCH</span>
      </header>

      <div className="music-search-result-body">
        <div className="music-search-details">
          <strong className="music-search-title">{track.title}</strong>
          {track.artist && <span className="music-search-artist">{track.artist}</span>}
        </div>
        {onCommand && (
          <div className="music-search-buttons">
            <button
              type="button"
              className="music-play-track-btn"
              disabled={disabled || busyAction === `/play ${track.title}`}
              onClick={() => void handleAction(`/play ${track.title}`)}
            >
              ▶ Play Now
            </button>
            <button
              type="button"
              className="music-action-btn"
              disabled={disabled || busyAction === `/playnext ${track.title}`}
              onClick={() => void handleAction(`/playnext ${track.title}`)}
            >
              ➕ Queue Next
            </button>
            <button
              type="button"
              className="music-action-btn"
              disabled={disabled || busyAction === `/lyrics ${track.title}`}
              onClick={() => void handleAction(`/lyrics ${track.title}`)}
            >
              ♪ Lyrics
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
