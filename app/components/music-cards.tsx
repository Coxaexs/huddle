"use client";

import { useState } from "react";
import { KARAOKE_OFFSET_RANGE, readMicSettings, requestMicSettings, type MicSettings } from "../lib/mic-chain";
import {
  Settings,
  Search,
  Plus,
  X,
  BarChart2,
  Trash2,
  Sparkles,
  Heart,
  ThumbsDown,
  List,
  Shuffle,
  Crown,
  Music2,
  MoonStar,
  Loader2,
  Play,
  SkipForward,
  User,
  History,
  RotateCcw,
  Trophy,
  Scroll,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { tNow } from "../lib/i18n-context";

export interface MusicSettings {
  voiceChannelId?: string;
  autoplay?: boolean;
  automix?: boolean;
  automix_blend_seconds?: number;
  crossfade_seconds?: number;
  audio_filter?: string | null;
  artist_diversity?: boolean;
  vibe_match?: boolean;
  /** The mood radio station on in this room (the bot's stations.py id), or null. */
  radio?: string | null;
  radio_stations?: Array<{ id: string; label: string; emoji: string; songs: number }>;
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

  const crossfade = settings.crossfade_seconds || 0;
  const filter = settings.audio_filter || "off";
  // Your own mic, not the room's: the same switch as Settings → Voice → Voice effect.
  const [singing, setSinging] = useState(() => typeof window !== "undefined" && readMicSettings().voiceEffect === "singer");
  const [mic, setMic] = useState<Pick<MicSettings, "tuneStyle" | "karaokeLead" | "karaokeOffsetMs">>(() => {
    const saved = typeof window !== "undefined" ? readMicSettings() : null;
    return { tuneStyle: saved?.tuneStyle ?? "hard", karaokeLead: saved?.karaokeLead ?? true, karaokeOffsetMs: saved?.karaokeOffsetMs ?? 0 };
  });
  const changeMic = (next: Partial<typeof mic>) => {
    setMic((current) => ({ ...current, ...next }));
    requestMicSettings(next);
  };

  return (
    <section className="music-settings-card">
      <header>
        <span className="music-card-icon" aria-hidden="true">
          <Settings size={18} />
        </span>
        <div>
          <strong>{tNow("music.card.settingsTitle")}</strong>
          <small>{tNow("music.card.settingsSub")}</small>
        </div>
        <span className={`music-live-pill ${disabled ? "" : "live"}`}>
          {disabled ? tNow("music.card.joinVoice") : tNow("music.card.liveRoom")}
        </span>
      </header>

      <div className="music-card-section-label">{tNow("music.card.playbackAi")}</div>
      <div className="music-toggle-grid">
        <Toggle
          label={tNow("music.card.autoplay")}
          hint={tNow("music.card.autoplayHint")}
          enabled={Boolean(settings.autoplay)}
          onClick={() => void apply(`/autoplay ${settings.autoplay ? "off" : "on"}`)}
        />
        <Toggle
          label={tNow("music.card.automix")}
          hint={tNow("music.card.automixHint")}
          enabled={Boolean(settings.automix)}
          onClick={() => void apply(`/automix ${settings.automix ? "off" : "on"}`)}
        />
        <Toggle
          label={tNow("music.card.artistDiversity")}
          hint={tNow("music.card.artistDiversityHint")}
          enabled={Boolean(settings.artist_diversity)}
          onClick={() =>
            void apply(`/artistdiversity ${settings.artist_diversity ? "off" : "on"}`)
          }
        />
        <Toggle
          label={tNow("music.card.vibeMatch")}
          hint={tNow("music.card.vibeMatchHint")}
          enabled={Boolean(settings.vibe_match)}
          onClick={() =>
            void apply(`/vibematch ${settings.vibe_match ? "off" : "on"}`)
          }
        />
      </div>

      {(settings.radio_stations || []).some((station) => station.songs) && (
        <>
          <div className="music-card-section-label">{tNow("music.card.moodRadio")}</div>
          <div className="music-filter-row" aria-label={tNow("music.card.moodRadioAria")}>
            {(settings.radio_stations || [])
              .filter((station) => station.songs)
              .map((station) => (
                <button
                  type="button"
                  key={station.id}
                  title={tNow("music.card.radioSongsTitle", { count: station.songs })}
                  className={settings.radio === station.id ? "active" : ""}
                  aria-pressed={settings.radio === station.id}
                  onClick={() =>
                    void apply(`/radio ${settings.radio === station.id ? "off" : station.id}`)
                  }
                >
                  {station.emoji} {station.label}
                </button>
              ))}
            {settings.radio && (
              <button type="button" onClick={() => void apply("/radio off")}>
                {tNow("music.card.off")}
              </button>
            )}
          </div>
        </>
      )}

      <div className="music-card-section-label">{tNow("music.card.mixTimings")}</div>
      <div className="music-slider-grid">
        <label>
          <span>{tNow("music.card.crossfade")} <b>{crossfade}s</b></span>
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

      <div className="music-card-section-label">{tNow("music.card.audioEffects")}</div>
      <div className="music-filter-row" aria-label={tNow("music.card.musicFilterAria")}>
        {[
          { id: "off", label: tNow("music.card.filter.off") },
          { id: "bassboost", label: tNow("music.card.filter.bassboost") },
          { id: "nightcore", label: tNow("music.card.filter.nightcore") },
          { id: "slowed", label: tNow("music.card.filter.slowed") },
          { id: "8d", label: tNow("music.card.filter.8d") },
          { id: "karaoke", label: tNow("music.card.filter.karaoke") },
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

      <div className="music-card-section-label">{tNow("music.card.yourMic")}</div>
      <div className="music-toggle-grid">
        <Toggle
          label={tNow("music.card.singingVoice")}
          hint={filter === "karaoke" ? tNow("music.card.singingKaraokeHint") : tNow("music.card.singingDefaultHint")}
          enabled={singing}
          onClick={() => {
            const next = !singing;
            setSinging(next);
            requestMicSettings({ voiceEffect: next ? "singer" : "none" });
          }}
        />
        {singing && (
          <>
            <Toggle
              label={tNow("music.card.keepVibrato")}
              hint={mic.tuneStyle === "natural" ? tNow("music.card.vibratoNaturalHint") : tNow("music.card.vibratoHardHint")}
              enabled={mic.tuneStyle === "natural"}
              onClick={() => changeMic({ tuneStyle: mic.tuneStyle === "natural" ? "hard" : "natural" })}
            />
            <Toggle
              label={tNow("music.card.syncRoom")}
              hint={tNow("music.card.syncRoomHint")}
              enabled={mic.karaokeLead}
              onClick={() => changeMic({ karaokeLead: !mic.karaokeLead })}
            />
          </>
        )}
      </div>
      {singing && mic.karaokeLead && (
        <div className="music-slider-grid">
          <label>
            <span>{tNow("music.card.songTiming")} <b>{mic.karaokeOffsetMs > 0 ? "+" : ""}{mic.karaokeOffsetMs} ms</b></span>
            <input
              type="range"
              min={KARAOKE_OFFSET_RANGE.min}
              max={KARAOKE_OFFSET_RANGE.max}
              step={10}
              value={mic.karaokeOffsetMs}
              aria-label={tNow("music.card.karaokeOffsetAria")}
              onChange={(event) => changeMic({ karaokeOffsetMs: Number(event.target.value) })}
            />
          </label>
        </div>
      )}

      <div className="music-quick-actions">
        <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/wrapped")}><Sparkles size={14} /> {tNow("music.card.wrapped")}</button>
        <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/stats")}><BarChart2 size={14} /> {tNow("music.card.stats")}</button>
        <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/like")}><Heart size={14} /> {tNow("music.card.like")}</button>
        <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/dislike")}><ThumbsDown size={14} /> {tNow("music.card.avoid")}</button>
        <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/lyricsnow")}><Music2 size={14} /> {tNow("music.card.lyrics")}</button>
        <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/queue")}><List size={14} /> {tNow("musicCard.queue")}</button>
        <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/shuffle")}><Shuffle size={14} /> {tNow("music.card.shuffle")}</button>
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
          {wrapped ? <Sparkles size={18} /> : <BarChart2 size={18} />}
        </span>
        <div>
          <strong>{wrapped ? tNow("music.card.wrapped2026") : tNow("music.card.listeningStatsTitle")}</strong>
          <small>{label || (wrapped ? tNow("music.card.wrappedSub") : tNow("music.card.statsSub"))}</small>
        </div>
        <span className={`music-live-pill ${wrapped ? "wrapped-pill" : "live"}`}>
          {wrapped ? tNow("music.card.wrappedBadge") : tNow("music.card.liveStatsBadge")}
        </span>
      </header>

      {/* Wrapped Special Banner / Personality Highlights */}
      {(wrapped || personality || topArtist || topGenre) && (
        <div className="music-wrapped-highlights">
          {personality && (
            <div className="music-highlight-badge">
              <span className="music-highlight-icon"><Sparkles size={16} /></span>
              <div>
                <small>{tNow("music.card.roomPersonality")}</small>
                <strong>{personality}</strong>
              </div>
            </div>
          )}
          {topArtist && (
            <div className="music-highlight-badge">
              <span className="music-highlight-icon"><Crown size={16} /></span>
              <div>
                <small>{tNow("music.card.topArtist")}</small>
                <strong>{topArtist}</strong>
              </div>
            </div>
          )}
          {topGenre && (
            <div className="music-highlight-badge">
              <span className="music-highlight-icon"><Music2 size={16} /></span>
              <div>
                <small>{tNow("music.card.topGenre")}</small>
                <strong>{topGenre}</strong>
              </div>
            </div>
          )}
          {peakHour && (
            <div className="music-highlight-badge">
              <span className="music-highlight-icon"><MoonStar size={16} /></span>
              <div>
                <small>{tNow("music.card.peakListening")}</small>
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
          <span>{tNow("music.card.totalPlays")}</span>
        </div>
        <div>
          <b>{unique}</b>
          <span>{tNow("music.card.uniqueTracks")}</span>
        </div>
        <div>
          <b>{hours}</b>
          <span>{tNow("music.card.listeningHours")}</span>
        </div>
        {streakDays ? (
          <div>
            <b>{streakDays}d</b>
            <span>{tNow("music.card.activeStreak")}</span>
          </div>
        ) : null}
      </div>

      {/* Top Tracks Chart with Play Action */}
      <div className="music-chart">
        <h4>{tNow("music.card.topTracks")}</h4>
        {topSongs.length ? (
          topSongs.map(([title, count], index) => {
            const isPlayingThis = requestingTrack === title;
            return (
              <div className="music-chart-row" key={`${title}-${index}`}>
                <span className={`music-chart-rank rank-${index + 1}`}>
                  {index === 0 ? <Trophy size={14} /> : index === 1 ? <Trophy size={14} /> : index === 2 ? <Trophy size={14} /> : index + 1}
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
                    title={tNow("music.card.playTitle", { title })}
                  >
                    {isPlayingThis ? <Loader2 size={13} className="animate-spin" /> : <><Play size={13} /> {tNow("music.card.playBtn")}</>}
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <p className="music-empty">{tNow("music.card.statsEmpty")}</p>
        )}
      </div>

      {/* Top Listeners / Requesters */}
      {topRequesters.length > 0 && (
        <div className="music-requesters">
          <h4>{tNow("music.card.topListeners")}</h4>
          <div className="music-requester-tags">
            {topRequesters.map(([name, count]) => (
              <span key={name} className="music-requester-chip">
                <User size={13} /> {name} <b>{tNow("music.card.playsCount", { count })}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer Navigation Shortcuts */}
      {onCommand && (
        <div className="music-quick-actions">
          {!wrapped && (
            <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/wrapped")}>
              <Sparkles size={14} /> {tNow("music.card.roomWrappedBtn")}
            </button>
          )}
          {wrapped && (
            <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/stats")}>
              <BarChart2 size={14} /> {tNow("music.card.listeningStatsBtn")}
            </button>
          )}
          <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/settings")}>
            <Settings size={14} /> {tNow("music.card.roomSettingsBtn")}
          </button>
          <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/lyricsnow")}>
            <Music2 size={14} /> Lyrics
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
          <List size={18} />
        </span>
        <div>
          <strong>{tNow("musicCard.roomQueue")}</strong>
          <small>
            {queue.length
              ? queue.length === 1
                ? tNow("music.card.tracksWaitingSingle")
                : tNow("music.card.tracksWaitingPlural", { count: queue.length })
              : tNow("music.card.queueEmptySub")}
          </small>
        </div>
        <span className="music-live-pill live">
          {queue.length ? tNow("music.card.queuedBadge", { count: queue.length }) : tNow("music.card.readyBadge")}
        </span>
      </header>

      {currentTrack && (
        <div className="music-now-playing-banner">
          <span className="music-eq-icon"><Music2 size={18} /></span>
          <div className="music-np-details">
            <small>{tNow("music.card.nowPlayingBadge")}</small>
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
                <SkipForward size={13} /> {tNow("music.card.skipBtn")}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="music-chart">
        <h4>{tNow("music.card.upNext", { count: queue.length })}</h4>
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
                    title={tNow("music.card.skipToTitle", { index: item.index })}
                  >
                    <Play size={13} /> {tNow("music.card.jumpBtn")}
                  </button>
                  <button
                    type="button"
                    className="music-remove-btn"
                    disabled={disabled || busyAction === `/remove ${item.index}`}
                    onClick={() => void handleAction(`/remove ${item.index}`)}
                    title={tNow("music.card.removeIndexTitle", { index: item.index })}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="music-empty">{tNow("music.card.queueEmptyPrefix")} <code>/play song name</code> {tNow("music.card.queueEmptySuffix")}</p>
        )}
      </div>

      {onCommand && (
        <div className="music-quick-actions">
          <button type="button" className="flex items-center gap-1" onClick={() => void handleAction("/shuffle")}><Shuffle size={14} /> {tNow("music.card.shuffle")}</button>
          <button type="button" className="flex items-center gap-1" onClick={() => void handleAction("/removedupes")}><RotateCcw size={14} /> {tNow("music.card.removeDupes")}</button>
          <button type="button" className="flex items-center gap-1" onClick={() => void handleAction("/clear")}><Trash2 size={14} /> {tNow("musicCard.clearQueue")}</button>
          <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/settings")}><Settings size={14} /> {tNow("music.card.settingsBtn")}</button>
        </div>
      )}
    </section>
  );
}

export interface MusicHistoryCardProps {
  history?: Array<{
    index: number;
    title: string;
    artist?: string | null;
    duration?: number | null;
    /** /longhistory only: when it played (ms) and who asked for it. */
    playedAt?: number | null;
    requestedBy?: string | null;
  }>;
  /** /longhistory: up to 250 tracks, shown a page at a time. */
  long?: boolean;
  disabled?: boolean;
  onCommand?: (command: string) => Promise<MusicSettings | void>;
}

const HISTORY_PAGE_SIZE = 25;

function playedWhen(ms: number): string {
  const when = new Date(ms);
  const time = when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const days = Math.round(
    (new Date().setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return `${when.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

export function MusicHistoryCard({
  history = [],
  long,
  disabled,
  onCommand,
}: MusicHistoryCardProps) {
  const [requestingTrack, setRequestingTrack] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLocaleLowerCase();
  const matching = long && needle
    ? history.filter((item) =>
        `${item.title} ${item.artist || ""} ${item.requestedBy || ""}`
          .toLocaleLowerCase()
          .includes(needle),
      )
    : history;
  const pages = Math.max(1, Math.ceil(matching.length / HISTORY_PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const shown = long
    ? matching.slice(currentPage * HISTORY_PAGE_SIZE, (currentPage + 1) * HISTORY_PAGE_SIZE)
    : history;

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
          <History size={18} />
        </span>
        <div>
          <strong>{long ? tNow("music.card.longHistoryTitle") : tNow("music.card.shortHistoryTitle")}</strong>
          <small>
            {long
              ? history.length === 1
                ? tNow("music.card.longHistorySubSingle")
                : tNow("music.card.longHistorySubPlural", { count: history.length })
              : tNow("music.card.shortHistorySub")}
          </small>
        </div>
        <span className="music-live-pill live">{tNow("music.card.historyBadge")}</span>
      </header>

      {long && history.length > HISTORY_PAGE_SIZE && (
        <label className="music-history-filter">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={filter}
            placeholder={tNow("music.card.historySearchPlaceholder")}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
          />
        </label>
      )}

      <div className="music-chart">
        {shown.length ? (
          shown.map((item) => (
            <div className="music-chart-row" key={`${item.title}-${item.index}`}>
              <span className="music-chart-rank">#{item.index}</span>
              <div className="music-chart-info">
                <span title={item.title}>{item.title}</span>
                {item.artist && <small>{item.artist}</small>}
                {(item.playedAt || item.requestedBy) && (
                  <small>
                    {[item.playedAt ? playedWhen(item.playedAt) : null, item.requestedBy]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                )}
              </div>
              {onCommand && (
                <button
                  type="button"
                  className="music-play-track-btn"
                  disabled={disabled || requestingTrack === item.title}
                  onClick={() => void handlePlay(item.title)}
                >
                  {requestingTrack === item.title ? <Loader2 size={13} className="animate-spin" /> : <><Play size={13} /> {tNow("music.card.replayBtn")}</>}
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="music-empty">
            {needle ? tNow("music.card.historyNoMatch") : tNow("music.card.historyEmpty")}
          </p>
        )}
      </div>

      {long && pages > 1 && (
        <div className="music-quick-actions music-history-pager">
          <button
            type="button"
            className="flex items-center gap-1"
            disabled={currentPage === 0}
            onClick={() => setPage(Math.max(0, currentPage - 1))}
          >
            <ChevronLeft size={14} /> {tNow("music.card.newer")}
          </button>
          <span>
            {tNow("music.card.pageOf", { page: currentPage + 1, pages })}
          </span>
          <button
            type="button"
            className="flex items-center gap-1"
            disabled={currentPage >= pages - 1}
            onClick={() => setPage(Math.min(pages - 1, currentPage + 1))}
          >
            {tNow("music.card.older")} <ChevronRight size={14} />
          </button>
        </div>
      )}

      {onCommand && (
        <div className="music-quick-actions">
          <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/stats")}><BarChart2 size={14} /> {tNow("music.card.stats")}</button>
          <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/wrapped")}><Sparkles size={14} /> {tNow("music.card.wrapped")}</button>
          <button type="button" className="flex items-center gap-1" onClick={() => void onCommand("/settings")}><Settings size={14} /> {tNow("music.card.settingsBtn")}</button>
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
          <Search size={18} />
        </span>
        <div>
          <strong>{tNow("music.card.searchResult")}</strong>
          <small>{tNow("music.card.topHitFor", { query })}</small>
        </div>
        <span className="music-live-pill live">{tNow("music.card.matchBadge")}</span>
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
              <Play size={13} /> {tNow("music.card.playNow")}
            </button>
            <button
              type="button"
              className="music-action-btn flex items-center gap-1"
              disabled={disabled || busyAction === `/playnext ${track.title}`}
              onClick={() => void handleAction(`/playnext ${track.title}`)}
            >
              <Plus size={14} /> {tNow("musicCard.queueNext")}
            </button>
            <button
              type="button"
              className="music-action-btn flex items-center gap-1"
              disabled={disabled || busyAction === `/lyrics ${track.title}`}
              onClick={() => void handleAction(`/lyrics ${track.title}`)}
            >
              <Music2 size={14} /> {tNow("music.card.lyrics")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
