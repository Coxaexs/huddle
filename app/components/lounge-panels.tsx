"use client";

import { proxiedImage } from "@/app/lib/image-proxy";
import { useRef, useState, useEffect } from "react";
import { ChessPawn, Clapperboard, Crown, ExternalLink, Film, Music, Pause, Play, Plus, Radio, RotateCw, SkipBack, SkipForward, ThumbsUp, Trash2, Upload, Volume2, X, Search, Loader2, PlayCircle } from "lucide-react";
import { MONSTER_PALETTE, tokenImageUrl } from "@/lib/battlemap-tokens";
import {
  PAWNS_EACH, PAWNS_GM, PAWN_KINDS, QUEUE_MAX, TABLE_MOODS, addInitiative, cinemaSeatLabel, currentEntry, removeInitiative, skipVotesNeeded, stepTurn, watchPosition,
  type GameMaster, type HouseLights, type Initiative, type PawnKind, type QueueOp, type TableCharacter, type TableFog, type TableMap, type TableMood, type TablePawn, type WatchQueue, type WatchState,
  WATCH_QUALITIES, type WatchQuality,
} from "@/lib/lounge-shared";
import { ABILITIES, SCREEN_SIZES, pagesFor, resizeChoice, type CharacterSheet, type ScreenPageId, type ScreenRole } from "../lib/gm-screen";
import { CLASSES, slotsFor } from "@/lib/dnd-spells";
import { searchSpells } from "../lib/spell-book";
import type { VoiceParticipant } from "@/lib/protocol";
import { apiFetch } from "../lib/client";
import type { LoungePose } from "../lib/living-room";
import type { GameSystem } from "@/lib/v5-sheet";
import { downloadYouTubeVideo, extractYouTubeId, needsYouTubeDownload, resolveVideo } from "../lib/watch-video";
import { jellyfinLink } from "../lib/stream-url";
import { SubtitlePicker } from "./watch-subtitles";
import { useI18n } from "../lib/i18n-context";
import type { MessageKey } from "@/lib/i18n";

const formatTime = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration: string;
}

/** Uploads a file to this server and returns the link everyone can load it from. */
export async function upload(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const result = await apiFetch<{ url: string }>("/api/uploads", { method: "POST", body: form });
  return result.url;
}

/** Search YouTube via our backend proxy */
async function searchYouTube(query: string): Promise<YouTubeVideo[]> {
  try {
    const res = await apiFetch<{ videos: YouTubeVideo[] }>(`/api/youtube/search?q=${encodeURIComponent(query)}`);
    return res.videos || [];
  } catch {
    return [];
  }
}

export interface WatchInfo { duration: number; current: number; blocked: boolean; error: string | null; buffering: boolean }

/**
 * The watch party's queue: what plays after this film, most votes first, a
 * vote to skip, and a box to add another. The hub keeps the order and starts
 * the next film when this one ends.
 */
function QueueSection({ queue, watch, myUserId, roomSize, sendQueue }: {
  queue: WatchQueue | null;
  watch: WatchState;
  myUserId: string | null;
  roomSize: number;
  sendQueue: (op: QueueOp) => void;
}) {
  const { t } = useI18n();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const films = queue?.films ?? [];
  const skipVotes = queue?.skip?.url === watch.url ? queue.skip.votes : [];
  const iSkipped = Boolean(myUserId && skipVotes.includes(myUserId));
  const needed = skipVotesNeeded(roomSize);

  const [quality, setQuality] = useWatchQuality();
  const add = async () => {
    const raw = link.trim();
    if (!raw) return;
    if (films.length >= QUEUE_MAX) { setProblem(t("lp.queueFull", { max: QUEUE_MAX })); return; }
    setBusy(true); setProblem(null);
    try {
      const { url, title } = await resolveVideo(raw);
      sendQueue({ op: "add", url, title, ...(jellyfinLink(url) ? { quality } : {}) });
      setLink("");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("lp.queueAddFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lr-queue">
      <div className="lr-row lr-queue-head">
        <strong>{t("lp.upNext", { suffix: films.length ? ` (${films.length})` : "" })}</strong>
        <button
          type="button"
          className={iSkipped ? "lr-on" : undefined}
          aria-pressed={iSkipped}
          onClick={() => sendQueue({ op: "skip" })}
          title={t("lp.skipTitle", { needed, roomSize })}
        >
          <SkipForward size={13} /> {iSkipped ? t("lp.votedToSkip") : t("lp.voteToSkip")} ({skipVotes.length}/{needed})
        </button>
      </div>
      {films.length ? (
        <ol className="lr-queue-list">
          {films.map((film, index) => {
            const mine = myUserId === film.userId;
            const voted = Boolean(myUserId && film.votes.includes(myUserId));
            return (
              <li key={film.id}>
                <span className="lr-queue-text">
                  <span className="lr-queue-title" title={film.title}>{film.title}</span>
                  <small>{film.by}</small>
                </span>
                <button
                  type="button"
                  className={voted ? "lr-on" : undefined}
                  aria-pressed={voted}
                  aria-label={voted ? t("lp.takeBackVoteAria", { title: film.title }) : t("lp.voteForAria", { title: film.title })}
                  onClick={() => sendQueue({ op: "vote", id: film.id })}
                >
                  <ThumbsUp size={12} /> {film.votes.length}
                </button>
                {index === 0 && (
                  <button type="button" onClick={() => sendQueue({ op: "next", from: watch.url })} title={t("lp.startNowTitle")} aria-label={t("lp.playNowAria", { title: film.title })}>
                    <PlayCircle size={13} />
                  </button>
                )}
                {mine && (
                  <button type="button" onClick={() => sendQueue({ op: "remove", id: film.id })} aria-label={t("lp.removeQueueAria", { title: film.title })}>
                    <Trash2 size={12} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="lr-note">{t("lp.queueEmpty")}</p>
      )}
      <form className="lr-row" onSubmit={(event) => { event.preventDefault(); void add(); }}>
        <input value={link} onChange={(event) => setLink(event.target.value)} placeholder={t("lp.queuePlaceholder")} aria-label={t("lp.queueAddAria")} maxLength={600} disabled={busy} />
        <button type="submit" disabled={!link.trim() || busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {t("lp.queueBtn")}</button>
      </form>
      {jellyfinLink(link.trim()) && <QualityPicker value={quality} onChange={setQuality} />}
      {problem && <p className="lr-note" style={{ color: "#ff6b6b" }}>{problem}</p>}
    </div>
  );
}

export { extractYouTubeId };

const QUALITY_LABEL_KEYS: Record<WatchQuality, MessageKey> = {
  original: "lp.quality.original",
  "8": "lp.quality.8",
  "4": "lp.quality.4",
};

/** The quality a Jellyfin film starts at, remembered for next time. */
function useWatchQuality(): [WatchQuality, (quality: WatchQuality) => void] {
  const [quality, setQuality] = useState<WatchQuality>(() => {
    try {
      const saved = localStorage.getItem("huddle-watch-quality");
      return (WATCH_QUALITIES as readonly string[]).includes(saved ?? "") ? (saved as WatchQuality) : "original";
    } catch {
      return "original";
    }
  });
  const choose = (next: WatchQuality) => {
    setQuality(next);
    try { localStorage.setItem("huddle-watch-quality", next); } catch { /* private mode */ }
  };
  return [quality, choose];
}

/**
 * Original, 8 or 4 Mbps for a Jellyfin film. Whatever is picked, Jellyfin
 * converts it once for the whole room ("Original" only converts when a
 * browser cannot play the file as it is).
 */
function QualityPicker({ value, onChange, label }: { value: WatchQuality; onChange: (quality: WatchQuality) => void; label?: string }) {
  const { t } = useI18n();
  const shownLabel = label ?? t("lp.qualityDefault");
  return (
    <div className="lr-row lr-quality" role="radiogroup" aria-label={shownLabel}>
      <small title={t("lp.qualityTitle")}>{shownLabel}</small>
      {WATCH_QUALITIES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          className={value === option ? "lr-on" : undefined}
          onClick={() => onChange(option)}
          title={option === "original" ? t("lp.qualityOrigTitle") : t("lp.qualityOptTitle", { opt: option })}
        >
          {t(QUALITY_LABEL_KEYS[option])}
        </button>
      ))}
    </div>
  );
}

/** Watch together: pick a video (a link, upload, or YouTube search) and the whole room sees it on the screen, in step. */
export function WatchPanel({ watch, hubNow, info, volume, onVolume, setWatch, onStartSound, onYoutube, onClose, queue = null, myUserId = null, roomSize = 1, sendQueue }: {
  watch: WatchState | null;
  queue?: WatchQueue | null;
  myUserId?: string | null;
  /** People in the call, for how many skip votes it takes. */
  roomSize?: number;
  sendQueue?: (op: QueueOp) => void;
  hubNow: () => number;
  info: WatchInfo;
  volume: number;
  onVolume: (volume: number) => void;
  setWatch: (value: Omit<WatchState, "at" | "by"> | null) => void;
  onStartSound: () => void;
  onYoutube?: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showYouTube, setShowYouTube] = useState(false);
  const [ytQuery, setYtQuery] = useState("");
  const [ytResults, setYtResults] = useState<YouTubeVideo[]>([]);
  const [ytSearching, setYtSearching] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const searchDebounce = useRef<NodeJS.Timeout | null>(null);
  const here = watch ? watchPosition(watch, hubNow()) : 0;
  const [quality, setQuality] = useWatchQuality();
  const start = (url: string, title: string) =>
    setWatch({ url, title, position: 0, paused: false, ...(jellyfinLink(url) ? { quality } : {}) });
  const chooseFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    setBusy(true); setProblem(null); setBusyMessage(t("lp.uploadingVideo"));
    try { start(await upload(chosen), chosen.name.replace(/\.[^.]+$/, "")); }
    catch (error) { setProblem(error instanceof Error ? error.message : t("lp.uploadFailed")); }
    finally { setBusy(false); setBusyMessage(null); if (file.current) file.current.value = ""; }
  };

  // Debounced YouTube search
  useEffect(() => {
    if (!showYouTube || !ytQuery.trim()) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setYtSearching(true);
      setYtError(null);
      const results = await searchYouTube(ytQuery);
      setYtResults(results);
      setYtSearching(false);
      if (results.length === 0) setYtError(t("lp.noVideosFound"));
    }, 400);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [ytQuery, showYouTube, t]);

  const handleYtSelect = async (video: YouTubeVideo) => {
    setBusy(true);
    setProblem(null);
    setBusyMessage(t("lp.downloadingYt", { title: video.title }));
    try {
      const { streamUrl, title } = await downloadYouTubeVideo(`https://www.youtube.com/watch?v=${video.id}`);
      start(streamUrl, title || video.title);
      setShowYouTube(false);
      setYtQuery("");
      setYtResults([]);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : t("lp.ytDownloadFailed"));
    } finally {
      setBusy(false);
      setBusyMessage(null);
    }
  };

  return (
    <div className="living-room-panel" role="dialog" aria-label={t("lp.watchTogether")} style={{ maxHeight: "85vh", overflow: "auto" }}>
      <div className="living-room-panel-head"><strong><Film size={14} /> {t("lp.watchTogether")}</strong><button type="button" onClick={onClose} aria-label={t("common.close")}><X size={14} /></button></div>
      {watch ? (
        <>
          <div className="lr-line"><span className="lr-title">{watch.title || t("lp.videoFallback")}</span><small>{t("lp.startedBy", { by: watch.by })}</small></div>
          <div className="lr-row">
            <button type="button" onClick={() => setWatch({ url: watch.url, title: watch.title, position: here, paused: !watch.paused })}>{watch.paused ? t("lp.playBtn") : t("lp.pauseBtn")}</button>
            <input
              type="range" min={0} max={Math.max(1, Math.floor(info.duration || 1))} step={1} value={Math.min(Math.floor(here), Math.floor(info.duration || 1))}
              disabled={!info.duration} aria-label={t("lp.seekAria")}
              onChange={(event) => setWatch({ url: watch.url, title: watch.title, position: Number(event.target.value), paused: watch.paused })}
            />
            <small>{formatTime(here)} / {info.duration ? formatTime(info.duration) : "--:--"}</small>
          </div>
          <label className="lr-row"><small>{t("lp.volume")}</small><input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => onVolume(Number(event.target.value))} aria-label={t("lp.filmVolumeAria")} /></label>
          {info.blocked && <button type="button" className="lr-wide" onClick={onStartSound}>{t("lp.startSound")}</button>}
          {info.error && <p className="lr-note">{info.error}</p>}
          {jellyfinLink(watch.url) && <div className="lr-row"><small>{t("lp.subtitles")}</small><SubtitlePicker url={watch.url} /></div>}
          {jellyfinLink(watch.url) && (
            <QualityPicker
              value={watch.quality ?? "original"}
              onChange={(next) => setWatch({ url: watch.url, title: watch.title, position: here, paused: watch.paused, quality: next })}
              label={t("lp.qualityForEveryone")}
            />
          )}
          <div className="lr-row"><button type="button" onClick={() => setWatch(null)}>{t("lp.stopForEveryone")}</button></div>
          {sendQueue && <QueueSection queue={queue} watch={watch} myUserId={myUserId} roomSize={roomSize} sendQueue={sendQueue} />}
        </>
      ) : (
        <>
          {!showYouTube ? (
            <>
              <form className="lr-row" onSubmit={async (event) => {
                event.preventDefault();
                const raw = link.trim();
                if (!raw) return;
                setBusy(true);
                setProblem(null);
                // A YouTube link, or anything that is not a web address (a name), goes through yt-dlp.
                setBusyMessage(needsYouTubeDownload(raw) ? t("lp.downloadingYtServer") : null);
                try {
                  const { url, title } = await resolveVideo(raw);
                  start(url, title);
                  setLink("");
                } catch (err) {
                  setProblem(err instanceof Error ? err.message : t("lp.videoPlayFailed"));
                } finally {
                  setBusy(false);
                  setBusyMessage(null);
                }
              }}>
                <input value={link} onChange={(event) => setLink(event.target.value)} placeholder={t("lp.videoLinkPlaceholder")} aria-label={t("lp.videoLinkAria")} maxLength={600} disabled={busy} />
                <button type="submit" disabled={!link.trim() || busy}>{busy ? t("lp.downloading") : t("lp.play")}</button>
              </form>
              {jellyfinLink(link.trim()) && <QualityPicker value={quality} onChange={setQuality} />}
              {busy && busyMessage && (
                <div className="lr-row" style={{ color: "var(--lr-accent, #ffd27a)", fontSize: 13, gap: 8 }}>
                  <Loader2 size={15} className="animate-spin" />
                  <span>{busyMessage}</span>
                </div>
              )}
              <div className="lr-row">
                <button type="button" disabled={busy} onClick={() => file.current?.click()}><Upload size={14} /> {busy ? t("lp.uploading") : t("lp.uploadVideo")}</button>
                <input ref={file} type="file" accept="video/mp4,video/webm,.mp4,.webm" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
                <button type="button" disabled={busy} onClick={() => setShowYouTube(true)} title={t("lp.searchYtTitle")}><PlayCircle size={14} /> {t("lp.ytMore")}</button>
              </div>
              <p className="lr-note">{t("lp.watchSupportedNote")}</p>
              {problem && <p className="lr-note" style={{ color: "#ff6b6b" }}>{problem}</p>}
            </>
          ) : (
            <div style={{ padding: "8px 0" }}>
              <div className="lr-row" style={{ gap: 8 }}>
                <Search size={14} style={{ opacity: 0.5 }} />
                <input
                  value={ytQuery}
                  onChange={(e) => { setYtQuery(e.target.value); setYtError(null); }}
                  placeholder={t("lp.searchYtPlaceholder")}
                  aria-label={t("lp.searchYtTitle")}
                  style={{ flex: 1, minWidth: 0 }}
                  autoFocus
                />
                {ytSearching && <Loader2 size={14} className="animate-spin" />}
              </div>
              {ytError && <p className="lr-note" style={{ color: "#ff6b6b" }}>{ytError}</p>}
              {ytResults.length > 0 && (
                <div style={{ maxHeight: "40vh", overflow: "auto" }}>
                  {ytResults.map((video) => (
                    <button
                      key={video.id}
                      type="button"
                      className="lr-row"
                      onClick={() => handleYtSelect(video)}
                      style={{ textAlign: "left", padding: "8px", borderRadius: "8px", background: "var(--panel)", border: "1px solid var(--line)", transition: "background 0.1s", width: "100%" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--line)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "var(--panel)"}
                    >
                      <img src={proxiedImage(video.thumbnail)} alt="" style={{ width: 120, height: 68, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{video.title}</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{video.channelTitle}</div>
                        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>{video.duration}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="lr-row" style={{ marginTop: 8 }}>
                <button type="button" onClick={() => setShowYouTube(false)}>{t("lp.back")}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The projection booth's desk: run the film (play, pause, skip, stop), set the house lights for the whole room,
 * and run the usual moments (showtime, intermission) with one press. Only reachable from inside the booth.
 */
export function BoothPanel({ watch, hubNow, info, house, setWatch, setHouse, onPick, onClose }: {
  watch: WatchState | null;
  hubNow: () => number;
  info: WatchInfo;
  house: HouseLights | null;
  setWatch: (value: Omit<WatchState, "at" | "by"> | null) => void;
  setHouse: (value: Pick<HouseLights, "level" | "auto"> | null) => void;
  onPick: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const here = watch ? watchPosition(watch, hubNow()) : 0;
  const auto = house?.auto ?? true;
  const level = house?.level ?? 1;
  const playing = !!watch && !watch.paused;
  // The slider is dragged continuously, but the hub takes a change at most every 120 ms: send once it settles.
  const [draft, setDraft] = useState<number | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  const dragLights = (value: number) => {
    setDraft(value);
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => { setHouse({ level: value, auto: false }); setDraft(null); }, 160);
  };
  const seek = (position: number) => { if (watch) setWatch({ url: watch.url, title: watch.title, position: Math.max(0, position), paused: watch.paused }); };
  const mode = auto ? "auto" : level >= 0.95 ? "up" : level <= 0.02 ? "out" : "dim";
  const scenes: Array<{ id: string; label: string; hint: string; run: () => void }> = [
    { id: "showtime", label: t("lp.showtimeLabel"), hint: t("lp.showtimeHint"), run: () => { setHouse({ level: 0, auto: true }); if (watch) setWatch({ url: watch.url, title: watch.title, position: here, paused: false }); } },
    { id: "intermission", label: t("lp.intermissionLabel"), hint: t("lp.intermissionHint"), run: () => { if (watch) setWatch({ url: watch.url, title: watch.title, position: here, paused: true }); setHouse({ level: 1, auto: false }); } },
  ];
  return (
    <div className="living-room-panel lr-booth" role="dialog" aria-label={t("lp.boothTitle")}>
      <div className="living-room-panel-head">
        <strong><Clapperboard size={14} /> {t("lp.boothTitle")} {playing && <span className="lr-onair">{t("lp.onAir")}</span>}</strong>
        <button type="button" onClick={onClose} aria-label={t("common.close")}><X size={14} /></button>
      </div>
      <div className="lr-line">
        <span className="lr-title">{watch ? watch.title || t("lp.videoFallback") : t("lp.nothingLoaded")}</span>
        <small>{watch ? t("lp.loadedBy", { by: watch.by }) : t("lp.pickForScreen")}</small>
      </div>
      <div className="lr-row">
        <button type="button" onClick={onPick}><Film size={13} /> {watch ? t("lp.changeFilm") : t("lp.chooseFilm")}</button>
        {watch && <button type="button" onClick={() => setWatch(null)}>{t("lp.eject")}</button>}
      </div>
      {watch && (
        <>
          <div className="lr-row">
            <button type="button" onClick={() => seek(here - 10)} aria-label={t("lp.back10s")} title={t("lp.back10s")}><SkipBack size={13} /> 10s</button>
            <button type="button" className={playing ? "active" : ""} onClick={() => setWatch({ url: watch.url, title: watch.title, position: here, paused: playing })}>{playing ? t("lp.pauseBtn") : t("lp.playBtn")}</button>
            <button type="button" onClick={() => seek(Math.min(here + 10, info.duration || here + 10))} aria-label={t("lp.fwd10s")} title={t("lp.fwd10s")}>10s <SkipForward size={13} /></button>
            <button type="button" onClick={() => seek(0)} title={t("lp.backToStartTitle")}>{t("lp.startBtn")}</button>
          </div>
          <div className="lr-row">
            <input
              type="range" min={0} max={Math.max(1, Math.floor(info.duration || 1))} step={1} value={Math.min(Math.floor(here), Math.floor(info.duration || 1))}
              disabled={!info.duration} aria-label={t("lp.seekAria")} style={{ flex: 1 }} onChange={(event) => seek(Number(event.target.value))}
            />
            <small>{formatTime(here)} / {info.duration ? formatTime(info.duration) : "--:--"}</small>
          </div>
        </>
      )}
      <div className="lr-line"><span className="lr-title">{t("lp.houseLights")}</span><small>{t("lp.houseLightsDesc")}</small></div>
      <div className="lr-row">
        {scenes.map((scene) => <button key={scene.id} type="button" onClick={scene.run} title={scene.hint} disabled={!watch && scene.id !== "intermission"}>{scene.label}</button>)}
      </div>
      <div className="lr-row">
        <button type="button" className={mode === "up" ? "active" : ""} onClick={() => setHouse({ level: 1, auto: false })}>{t("lp.lightsUp")}</button>
        <button type="button" className={mode === "dim" ? "active" : ""} onClick={() => setHouse({ level: 0.35, auto: false })}>{t("lp.lightsDim")}</button>
        <button type="button" className={mode === "out" ? "active" : ""} onClick={() => setHouse({ level: 0, auto: false })}>{t("lp.lightsOut")}</button>
        <button type="button" className={mode === "auto" ? "active" : ""} onClick={() => setHouse(null)} title={t("lp.lightsAutoTitle")}>{t("lp.lightsAuto")}</button>
      </div>
      <label className="lr-row">
        <small style={{ width: 54 }}>{Math.round((draft ?? level) * 100)}%</small>
        <input type="range" min={0} max={1} step={0.01} value={draft ?? level} disabled={auto && !draft} aria-label={t("lp.houseLightLevelAria")} style={{ flex: 1 }} onChange={(event) => dragLights(Number(event.target.value))} />
      </label>
      {info.error && <p className="lr-note">{info.error}</p>}
    </div>
  );
}

/** Who sits where in the cinema, and a button to take the free seat beside them. */
export function SeatFinder({ participants, poses, myId, onSitNear, onClose }: {
  participants: VoiceParticipant[];
  poses: Map<string, LoungePose>;
  myId: string | null;
  onSitNear: (connectionId: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const people = participants.filter((p) => !p.bot && !p.recorder && poses.has(p.connectionId))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  return (
    <div className="living-room-panel" role="dialog" aria-label={t("lp.findSeatAria")}>
      <div className="living-room-panel-head"><strong>{t("lp.whoIsWhere")}</strong><button type="button" onClick={onClose} aria-label={t("common.close")}><X size={14} /></button></div>
      <ul className="lr-list">
        {people.map((person) => {
          const seat = poses.get(person.connectionId)?.seat ?? null;
          return (
            <li key={person.connectionId}>
              <span className="lr-name">{person.displayName}{person.connectionId === myId ? t("lp.youSuffix") : ""}</span>
              <small>{cinemaSeatLabel(seat) ?? t("lp.standing")}</small>
              {person.connectionId !== myId && seat && <button type="button" onClick={() => onSitNear(person.connectionId)}>{t("lp.sitNextTo")}</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The initiative order: who goes when, whose turn it is, and who the game master is. */
export function InitiativePanel({ initiative, gm, myId, myName, setInitiative, setGm, onRollMine, onClose }: {
  initiative: Initiative | null;
  gm: GameMaster | null;
  myId: string | null;
  myName: string;
  setInitiative: (value: Initiative | null) => void;
  setGm: (value: GameMaster | null) => void;
  onRollMine: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const isGm = Boolean(gm && gm.connectionId === myId);
  const canEdit = !gm || isGm;
  const current = currentEntry(initiative);
  const addNpc = () => {
    const label = name.trim();
    if (!label) return;
    const rolled = value.trim() === "" ? Math.floor(Math.random() * 20) + 1 : Number(value);
    setInitiative(addInitiative(initiative, { id: `n${Date.now().toString(36)}`, name: label, value: Number.isFinite(rolled) ? rolled : 0 }));
    setName(""); setValue("");
  };
  return (
    <div className="living-room-panel" role="dialog" aria-label={t("lp.initiative")}>
      <div className="living-room-panel-head">
        <strong>{t("lp.initiative")}{initiative ? t("lp.roundSuffix", { round: initiative.round }) : ""}</strong>
        <button type="button" onClick={onClose} aria-label={t("common.close")}><X size={14} /></button>
      </div>
      <div className="lr-row">
        {gm ? <small><Crown size={12} /> {t("lp.gmLabel", { name: gm.name })}</small> : <small>{t("lp.noGmYet")}</small>}
        {isGm ? <button type="button" onClick={() => setGm(null)}>{t("lp.handOver")}</button>
          : !gm && myId ? <button type="button" onClick={() => setGm({ connectionId: myId, name: myName })}>{t("lp.imGm")}</button> : null}
      </div>
      {initiative ? (
        <ol className="lr-order">
          {initiative.entries.map((entry, index) => (
            <li key={entry.id} className={index === initiative.turn ? "turn" : ""}>
              <b>{entry.value}</b><span>{entry.name}</span>
              {canEdit && <button type="button" onClick={() => setInitiative(removeInitiative(initiative, entry.id))} aria-label={t("lp.removeEntryAria", { name: entry.name })}><Trash2 size={12} /></button>}
            </li>
          ))}
        </ol>
      ) : <p className="lr-note">{t("lp.orderEmpty")}</p>}
      <div className="lr-row">
        <button type="button" onClick={onRollMine} title={t("lp.rollInitTitle")}>{t("lp.rollMyInit")}</button>
        {canEdit && initiative && (
          <>
            <button type="button" onClick={() => setInitiative(stepTurn(initiative, -1))} aria-label={t("lp.prevTurnAria")}><SkipBack size={14} /></button>
            <button type="button" className="primary" onClick={() => setInitiative(stepTurn(initiative, 1))} title={current ? t("lp.nextAfterTitle", { name: current.name }) : t("lp.nextTurn")}>{t("lp.nextTurn")} <SkipForward size={14} /></button>
          </>
        )}
      </div>
      {canEdit && (
        <form className="lr-row" onSubmit={(event) => { event.preventDefault(); addNpc(); }}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("lp.goblinPlaceholder")} aria-label={t("lp.nameAria")} maxLength={40} />
          <input className="lr-narrow" value={value} onChange={(event) => setValue(event.target.value.replace(/[^\d-]/g, ""))} placeholder="d20" aria-label={t("lp.initiative")} inputMode="numeric" maxLength={4} />
          <button type="submit" disabled={!name.trim()} aria-label={t("lp.addAria")}><Plus size={14} /></button>
        </form>
      )}
      {canEdit && initiative && <div className="lr-row"><button type="button" onClick={() => setInitiative(null)}>{t("lp.endCombat")}</button></div>}
    </div>
  );
}

/** My character at the table: the name and portrait on my tent card. */
/**
 * What a screen's panels show, panel by panel, and how many it has: the game
 * master's three to five, a player's two to four.
 */
export function ScreenPagesPicker({ role, choice, setChoice, system = "dnd5e" }: { role: ScreenRole; choice: ScreenPageId[]; setChoice: (value: ScreenPageId[]) => void; system?: GameSystem }) {
  const { t } = useI18n();
  const { min, max } = SCREEN_SIZES[role];
  const counts = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  // As the owner sees them: Left, Middle, Right; with more, the ones between are numbered.
  const label = (index: number) =>
    index === 0 ? t("lp.panelLeft") : index === choice.length - 1 ? t("lp.panelRight") : choice.length === 3 ? t("lp.panelMiddle") : t("lp.panelN", { num: index + 1 });
  return (
    <>
      <div className="lr-row lr-panels" role="group" aria-label={t("lp.panels")}>
        <small>{t("lp.panels")}</small>
        {counts.map((count) => (
          <button key={count} type="button" className={choice.length === count ? "active" : ""} aria-pressed={choice.length === count} onClick={() => setChoice(resizeChoice(role, choice, count, system))}>{count}</button>
        ))}
      </div>
      {choice.map((id, index) => (
        <label key={index} className="lr-field lr-inline">
          <small>{label(index)}</small>
          <select value={id} onChange={(event) => setChoice(choice.map((old, i) => (i === index ? (event.target.value as ScreenPageId) : old)))}>
            {pagesFor(role, system).map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}
          </select>
        </label>
      ))}
    </>
  );
}

/** My own little screen at the table: only I ever see it. */
export interface PlayerScreenSettings {
  open: boolean;
  setOpen: (open: boolean) => void;
  choice: ScreenPageId[];
  setChoice: (value: ScreenPageId[]) => void;
  notes: string;
  setNotes: (value: string) => void;
}

/** The old sheet this browser kept ("Rogue 3", "18/24"), read into numbers to start the new one with. */
function fromLegacy(sheet: CharacterSheet | null): Partial<TableCharacter> {
  if (!sheet) return {};
  const int = (text: string) => { const n = parseInt(text, 10); return Number.isFinite(n) ? n : undefined; };
  const cls = CLASSES.find((c) => sheet.level.toLowerCase().includes(c.toLowerCase()));
  const hp = /(\d+)\s*\/\s*(\d+)/.exec(sheet.hp);
  return {
    ...(cls ? { cls } : {}),
    level: int(sheet.level.replace(/\D+/g, " ").trim()),
    ...(hp ? { hp: Number(hp[1]), maxHp: Number(hp[2]) } : { maxHp: int(sheet.hp) }),
    ac: int(sheet.ac),
    speed: int(sheet.speed),
    abilities: sheet.abilities.map((a) => int(a) ?? 0),
  };
}

/** Spells by name: type a few letters, pick one; each shows as a chip to take off again. */
function SpellPicker({ spells, setSpells, edition }: { spells: string[]; setSpells: (value: string[]) => void; edition?: "2014" | "2024" }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<string[]>([]);
  useEffect(() => {
    if (query.trim().length < 2) { setFound([]); return; }
    let live = true;
    const later = setTimeout(() => { void searchSpells(query, edition).then((names) => { if (live) setFound(names.filter((n) => !spells.includes(n))); }); }, 250);
    return () => { live = false; clearTimeout(later); };
  }, [query, spells, edition]);
  const add = (name: string) => { if (!spells.includes(name) && spells.length < 40) setSpells([...spells, name]); setQuery(""); setFound([]); };
  return (
    <div className="lr-field">
      <small>{t("lp.spells")}</small>
      {spells.length > 0 && (
        <div className="lr-chips">
          {spells.map((name) => (
            <span key={name} className="lr-chip">{name}<button type="button" onClick={() => setSpells(spells.filter((s) => s !== name))} aria-label={t("lp.removeEntryAria", { name })}><X size={11} /></button></span>
          ))}
        </div>
      )}
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("lp.spellPlaceholder")} aria-label={t("lp.findSpellAria")} maxLength={60}
        onKeyDown={(event) => { if (event.key === "Enter" && found[0]) { event.preventDefault(); add(found[0]); } }} />
      {found.length > 0 && (
        <div className="lr-chips">
          {found.map((name) => <button key={name} type="button" className="lr-suggest" onClick={() => add(name)}><Plus size={11} /> {name}</button>)}
        </div>
      )}
    </div>
  );
}

/**
 * My character: a name, class and level, the few numbers play uses, and my
 * spells. Slots come from the class and level by themselves. The portrait,
 * ability scores and my own screen fold away under "More".
 */
export function CharacterPanel({ mine, fallbackName, setMine, legacy, screen, edition, onOpenCompanion, onClose }: {
  mine: TableCharacter | null;
  fallbackName: string;
  setMine: (value: TableCharacter | null) => void;
  /** What this browser's old sheet held, to start from when there is no sheet yet. */
  legacy: CharacterSheet | null;
  screen: PlayerScreenSettings;
  edition?: "2014" | "2024";
  onOpenCompanion?: (path?: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const start = { ...(mine?.maxHp === undefined && !mine?.cls ? fromLegacy(legacy) : {}), ...Object.fromEntries(Object.entries(mine ?? {}).filter(([, v]) => v !== undefined)) } as Partial<TableCharacter>;
  const [name, setName] = useState(start.name ?? "");
  const [portrait, setPortrait] = useState(start.portraitUrl ?? "");
  const [cls, setCls] = useState(start.cls ?? "");
  const [level, setLevel] = useState(String(start.level ?? 1));
  const [maxHp, setMaxHp] = useState(start.maxHp !== undefined ? String(start.maxHp) : "");
  const [ac, setAc] = useState(start.ac !== undefined ? String(start.ac) : "");
  const [speed, setSpeed] = useState(String(start.speed ?? 30));
  const [abilities, setAbilities] = useState<string[]>((start.abilities ?? [0, 0, 0, 0, 0, 0]).map((n) => (n ? String(n) : "")));
  const [spells, setSpells] = useState<string[]>(start.spells ?? []);
  const auto = slotsFor(cls, Number(level) || 1);
  const [customSlots, setCustomSlots] = useState<string[] | null>(() =>
    start.slots && start.slots.some((n, i) => n !== slotsFor(start.cls ?? "", start.level ?? 1)[i]) ? start.slots.map(String) : null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const num = (text: string) => { const n = Math.round(Number(text)); return text.trim() && Number.isFinite(n) ? n : undefined; };
  const save = () => {
    const slots = customSlots ? customSlots.map((n) => Math.max(0, num(n) ?? 0)) : auto;
    const max = num(maxHp);
    const oldMax = mine?.maxHp;
    // A new maximum heals by the difference; a lower one caps what is left.
    const hp = max === undefined ? undefined : mine?.hp === undefined ? max : Math.max(0, Math.min(max, mine.hp + (oldMax === undefined ? 0 : max - oldMax)));
    setMine({
      ...(mine ?? {}),
      name: name.trim() || fallbackName,
      portraitUrl: portrait.trim() || null,
      ...(cls ? { cls } : {}),
      level: num(level) ?? 1,
      ...(max !== undefined ? { maxHp: max, hp } : {}),
      ...(num(ac) !== undefined ? { ac: num(ac) } : {}),
      speed: num(speed) ?? 30,
      abilities: abilities.map((a) => num(a) ?? 0),
      slots,
      used: (mine?.used ?? Array(9).fill(0)).map((n, i) => Math.min(n, slots[i] ?? 0)),
      spells,
      ...(edition ? { edition } : {}),
    });
  };
  const chooseFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    setBusy(true); setProblem(null);
    try { setPortrait(await upload(chosen)); }
    catch (error) { setProblem(error instanceof Error ? error.message : t("lp.uploadFailed")); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };
  const caster = auto.some((n) => n > 0);
  return (
    <div className="living-room-panel" role="dialog" aria-label={t("lp.myCharacter")}>
      <div className="living-room-panel-head"><strong>{t("lp.myCharacter")}</strong><button type="button" onClick={onClose} aria-label={t("common.close")}><X size={14} /></button></div>
      <label className="lr-field"><small>{t("lp.name")}</small><input value={name} onChange={(event) => setName(event.target.value)} placeholder={fallbackName} maxLength={40} /></label>
      <div className="lr-sheet lr-sheet-2">
        <label className="lr-field"><small>{t("lp.class")}</small>
          <select value={cls} onChange={(event) => setCls(event.target.value)}>
            <option value="">{t("lp.choose")}</option>
            {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="lr-field"><small>{t("lp.level")}</small><input value={level} onChange={(event) => setLevel(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="1" /></label>
      </div>
      <div className="lr-sheet">
        <label className="lr-field"><small>{t("lp.maxHp")}</small><input value={maxHp} onChange={(event) => setMaxHp(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="24" /></label>
        <label className="lr-field"><small>{t("lp.ac")}</small><input value={ac} onChange={(event) => setAc(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="15" /></label>
        <label className="lr-field"><small>{t("lp.speedFt")}</small><input value={speed} onChange={(event) => setSpeed(event.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="30" /></label>
      </div>
      {caster && !customSlots && (
        <p className="lr-note">{t("lp.spellSlotsNote", { slots: auto.map((n, i) => (n ? `${n}×${i + 1}${i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th"}` : "")).filter(Boolean).join(" · ") })}</p>
      )}
      <SpellPicker spells={spells} setSpells={setSpells} edition={edition} />
      <div className="lr-row">
        <button type="button" className="primary" onClick={() => { save(); onClose(); }}>{t("lp.save")}</button>
        {mine && <button type="button" onClick={() => { setMine(null); onClose(); }}>{t("lp.clear")}</button>}
        {onOpenCompanion && <button type="button" onClick={() => onOpenCompanion("/sheet")} title={t("lp.tavernSheetTitle")}><ExternalLink size={12} /> {t("lp.tavernSheet")}</button>}
      </div>

      <details className="lr-more">
        <summary>{t("lp.moreSummary")}</summary>
        <label className="lr-field"><small>{t("lp.portrait")}</small><input value={portrait} onChange={(event) => setPortrait(event.target.value)} placeholder={t("lp.portraitPlaceholder")} maxLength={600} /></label>
        <div className="lr-row">
          <button type="button" disabled={busy} onClick={() => file.current?.click()}><Upload size={14} /> {busy ? t("lp.uploading") : t("lp.uploadPortrait")}</button>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
        </div>
        {problem && <p className="lr-note">{problem}</p>}
        <div className="lr-abilities">
          {ABILITIES.map((ability, i) => (
            <label key={ability} className="lr-field"><small>{ability}</small>
              <input value={abilities[i]} inputMode="numeric" maxLength={2} placeholder="10" onChange={(event) => setAbilities(abilities.map((old, j) => (j === i ? event.target.value.replace(/\D/g, "") : old)))} />
            </label>
          ))}
        </div>
        <label className="living-room-switch">
          <span><strong>{t("lp.ownSlots")}</strong><small>{t("lp.ownSlotsDesc")}</small></span>
          <input type="checkbox" checked={Boolean(customSlots)} onChange={(event) => setCustomSlots(event.target.checked ? auto.map(String) : null)} />
        </label>
        {customSlots && (
          <div className="lr-slot-edit">
            {customSlots.map((n, i) => (
              <label key={i} className="lr-field"><small>{i + 1}</small>
                <input value={n} inputMode="numeric" maxLength={1} onChange={(event) => setCustomSlots(customSlots.map((old, j) => (j === i ? event.target.value.replace(/\D/g, "").slice(0, 1) : old)))} />
              </label>
            ))}
          </div>
        )}
        <small className="lr-heading">{t("lp.myScreen")}</small>
        <div className="lr-row">
          <button type="button" className={screen.open ? "active" : ""} aria-pressed={screen.open} onClick={() => screen.setOpen(!screen.open)}>
            {screen.open ? t("lp.putScreenAway") : t("lp.standScreenUp")}
          </button>
        </div>
        {screen.open && (
          <>
            <ScreenPagesPicker role="player" choice={screen.choice} setChoice={screen.setChoice} />
            <label className="lr-field">
              <small>{t("lp.myNotes")}</small>
              <textarea value={screen.notes} onChange={(event) => screen.setNotes(event.target.value)} rows={3} maxLength={2000} placeholder={t("lp.playerNotesPlaceholder")} />
            </label>
          </>
        )}
      </details>
    </div>
  );
}
/**
 * The tabletop's game master: who it is and their chair, the battle map on
 * the table, and what the inside of their screen shows.
 */
export function GameMasterPanel({ gm, myId, inGmChair, onTakeChair, setGm, myName, map, canEditMap, setMap, squares, setSquares, fog, setFog, drawingFog, onToggleDrawFog, onOpenCompanion, choice, setChoice, folded, setFolded, notes, setNotes, onClose, system = "dnd5e" }: {
  gm: GameMaster | null;
  myId: string | null;
  myName: string;
  inGmChair: boolean;
  onTakeChair: () => void;
  setGm: (value: GameMaster | null) => void;
  map: TableMap | null;
  canEditMap: boolean;
  setMap: (value: { url: string; turns: number; zoom: number } | null) => void;
  /** The map's width in 5-foot squares: the scale of pawns, rulers and spells. */
  squares: number;
  setSquares: (squares: number) => void;
  fog?: TableFog | null;
  setFog?: (fog: TableFog | null) => void;
  drawingFog?: boolean;
  onToggleDrawFog?: () => void;
  onOpenCompanion?: (path?: string) => void;
  choice: ScreenPageId[];
  setChoice: (value: ScreenPageId[]) => void;
  /** The screen folded flat on the table, for everyone. */
  folded: boolean;
  setFolded: (folded: boolean) => void;
  notes: string;
  setNotes: (value: string) => void;
  onClose: () => void;
  /** The game the table plays: which reference pages the screen offers. */
  system?: GameSystem;
}) {
  const { t } = useI18n();
  const isGm = Boolean(gm && gm.connectionId === myId);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [zoom, setZoom] = useState(map?.zoom ?? 1);
  const file = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setZoom(map?.zoom ?? 1); }, [map?.zoom]);
  const [grid, setGrid] = useState(squares);
  useEffect(() => { setGrid(squares); }, [squares]);
  useEffect(() => {
    if (grid === squares) return;
    const later = setTimeout(() => setSquares(grid), 250);
    return () => clearTimeout(later);
  }, [grid, squares, setSquares]);
  // A slider sends many values; the room only needs the one it settles on.
  useEffect(() => {
    if (!map || zoom === map.zoom) return;
    const later = setTimeout(() => setMap({ url: map.url, turns: map.turns, zoom }), 250);
    return () => clearTimeout(later);
  }, [zoom, map, setMap]);
  const chooseFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    setBusy(true); setProblem(null);
    try { setMap({ url: await upload(chosen), turns: 0, zoom: 1 }); }
    catch (error) { setProblem(error instanceof Error ? error.message : t("lp.uploadFailed")); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };
  return (
    <div className="living-room-panel" role="dialog" aria-label={t("lp.gameMaster")}>
      <div className="living-room-panel-head"><strong>{t("lp.gameMaster")}</strong><button type="button" onClick={onClose} aria-label={t("common.close")}><X size={14} /></button></div>
      <div className="lr-row">
        {gm ? <small><Crown size={12} /> {t("lp.gmLabel", { name: isGm ? t("lp.you") : gm.name })}</small> : <small>{t("lp.noGm")}</small>}
        {!inGmChair && (!gm || isGm) && <button type="button" onClick={onTakeChair}>{t("lp.sitGmChair")}</button>}
        {isGm ? <button type="button" onClick={() => setGm(null)}>{t("lp.handOver")}</button>
          : !gm && myId ? <button type="button" onClick={() => setGm({ connectionId: myId, name: myName })}>{t("lp.imGm")}</button> : null}
      </div>

      <small className="lr-heading">{t("lp.battleMap")}</small>
      {canEditMap ? (
        <>
          <div className="lr-row">
            <button type="button" disabled={busy} onClick={() => file.current?.click()}><Upload size={14} /> {busy ? t("lp.uploading") : map ? t("lp.changeMap") : t("lp.uploadMap")}</button>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
            {map && <button type="button" onClick={() => setMap({ url: map.url, turns: (map.turns + 1) % 4, zoom: map.zoom })} title={t("lp.turnMapTitle")}><RotateCw size={14} /> {t("lp.turn")}</button>}
            {map && <button type="button" onClick={() => setMap(null)}>{t("lp.useDrawnMap")}</button>}
          </div>
          {map && (
            <label className="lr-field">
              <small>{t("lp.zoom", { val: zoom.toFixed(1) })}</small>
              <input type="range" min={1} max={4} step={0.1} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label={t("lp.mapZoomAria")} />
            </label>
          )}
          <label className="lr-field">
            <small>{t("lp.scale", { grid, feet: grid * 5 })}</small>
            <input type="range" min={10} max={60} step={1} value={grid} onChange={(event) => setGrid(Number(event.target.value))} aria-label={t("lp.squaresAcrossAria")} />
          </label>
          {setFog && (
            <>
              <small className="lr-heading">{t("lp.fogOfWar", { suffix: fog?.enabled ? ` · ${fog.rects.length} ${fog.rects.length === 1 ? t("lp.fogZoneSingle") : t("lp.fogZonePlural")}` : "" })}</small>
              <div className="lr-row">
                {onToggleDrawFog && (
                  <button type="button" className={drawingFog ? "active" : ""} onClick={onToggleDrawFog} title={t("lp.drawFogTitle")}>
                    {drawingFog ? t("lp.finishFog") : t("lp.drawFog")}
                  </button>
                )}
                <button type="button" onClick={() => setFog({ enabled: true, rects: [{ id: "fullmap", x: 0, y: 0, w: 100, h: 100 }] })}>{t("lp.coverMap")}</button>
                {fog?.enabled && <button type="button" onClick={() => setFog(null)}>{t("lp.clearFog")}</button>}
              </div>
            </>
          )}
          {onOpenCompanion && (
            <div className="lr-row">
              <button type="button" onClick={() => onOpenCompanion("/gm")}><ExternalLink size={12} /> {t("lp.tavernGmStudio")}</button>
            </div>
          )}
          {problem && <p className="lr-note">{problem}</p>}
          <p className="lr-note">{t("lp.mapNote")}</p>
        </>
      ) : (
        <p className="lr-note">{map ? t("lp.mapUploadedBy", { by: map.by }) : ""}{t("lp.onlyGmChangesMap")}</p>
      )}

      {isGm ? (
        <>
          <small className="lr-heading">{t("lp.yourScreen")}</small>
          <div className="lr-row">
            <button type="button" className={folded ? "" : "active"} aria-pressed={!folded} onClick={() => setFolded(!folded)}>
              {folded ? t("lp.standScreenUpGm") : t("lp.foldScreenAwayGm")}
            </button>
          </div>
          {!folded && (
            <>
              <small className="lr-heading">{t("lp.insideScreen")}</small>
              <ScreenPagesPicker role="gm" choice={choice} setChoice={setChoice} system={system} />
            </>
          )}
          <label className="lr-field">
            <small>{t("lp.myNotes")}</small>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={2000} placeholder={t("lp.gmNotesPlaceholder")} />
          </label>
        </>
      ) : (
        <p className="lr-note">{t("lp.gmScreenNote")}</p>
      )}
    </div>
  );
}

/** The cabinet's miniatures as the panel names them. */
export const PAWN_NAMES: Record<PawnKind, { name: string; glyph: string }> = {
  fighter: { name: "Fighter", glyph: "⚔️" },
  wizard: { name: "Wizard", glyph: "🧙" },
  rogue: { name: "Rogue", glyph: "🗡️" },
  cleric: { name: "Cleric", glyph: "✨" },
  beast: { name: "Ogre", glyph: "👹" },
  dragon: { name: "Dragon", glyph: "🐉" },
};
const PAWN_NAME_KEYS: Record<PawnKind, MessageKey> = {
  fighter: "lp.pawn.fighter",
  wizard: "lp.pawn.wizard",
  rogue: "lp.pawn.rogue",
  cleric: "lp.pawn.cleric",
  beast: "lp.pawn.beast",
  dragon: "lp.pawn.dragon",
};

/** The paints on the cabinet's shelf. */
export const PAWN_PAINTS = ["#3b4fa8", "#8a1c1c", "#2f6b3a", "#c9a45c", "#6a3d9a", "#d9822b", "#e8e2d0", "#2b2b2b"];

/**
 * The miniatures cabinet: take a pawn to the table, painted and named as you
 * like, then click it and click the map to move it. Players keep a few each;
 * the game master keeps the monsters, and can move anyone's.
 */
export function PawnsPanel({ pawns, myUserId, isGm, held, channelId, onTake, onSpawnMonster, onHold, onPutBack, onClear, onClose }: {
  pawns: Record<string, TablePawn>;
  myUserId: string | null;
  isGm: boolean;
  held: string | null;
  channelId?: string | null;
  onTake: (kind: PawnKind, colour: string, label: string) => void;
  onSpawnMonster?: (spec: { name: string; hp: number; size: number; kind: PawnKind; colour: string; portraitUrl?: string }) => void;
  onHold: (id: string | null) => void;
  onPutBack: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [colour, setColour] = useState(PAWN_PAINTS[0]);
  const [label, setLabel] = useState("");
  const [monsterQ, setMonsterQ] = useState("");
  const [monsters, setMonsters] = useState<Array<{ name: string; hp: number; size: number; kind: PawnKind }>>([]);
  const [searching, setSearching] = useState(false);
  const all = Object.values(pawns).sort((a, b) => a.ownerName.localeCompare(b.ownerName) || a.at - b.at);
  const mine = all.filter((pawn) => pawn.owner === myUserId);
  const limit = isGm ? PAWNS_GM : PAWNS_EACH;
  const shown = isGm ? all : mine;
  const full = mine.length >= limit;

  useEffect(() => {
    const q = monsterQ.trim();
    if (!isGm || !onSpawnMonster || q.length < 2) {
      setMonsters([]);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const qs = new URLSearchParams({ command: "monster", query: q });
        if (channelId) qs.set("channelId", channelId);
        const data = await apiFetch<{ payload?: { title?: string; subtitle?: string; facts?: Array<{ label: string; value: string }> } }>(`/api/integrations/dnd/lookup?${qs.toString()}`);
        const p = data.payload;
        const title = p?.title;
        if (!live || !title) return;
        const hpFact = p.facts?.find((f) => /hp|hit points/i.test(f.label))?.value ?? "";
        const hp = Number(/(\d+)/.exec(hpFact)?.[1] || 15);
        const sub = (p.subtitle ?? "").toLowerCase();
        const size = sub.includes("gargantuan") || sub.includes("huge") ? 3 : sub.includes("large") ? 2 : 1;
        const kind: PawnKind = /dragon|wyrm|drake|wyvern/i.test(title) ? "dragon" : size >= 2 ? "beast" : "fighter";
        setMonsters([{ name: title, hp, size, kind }]);
      } catch {
        if (live) setMonsters([]);
      } finally {
        if (live) setSearching(false);
      }
    }, 280);
    return () => { live = false; clearTimeout(timer); };
  }, [monsterQ, isGm, onSpawnMonster, channelId]);

  return (
    <div className="living-room-panel" role="dialog" aria-label={t("lp.miniatures")}>
      <div className="living-room-panel-head"><strong><ChessPawn size={14} /> {t("lp.miniatures")}</strong><button type="button" onClick={onClose} aria-label={t("common.close")}><X size={14} /></button></div>
      <p className="lr-note">{t("lp.miniaturesHint")}{isGm ? t("lp.miniaturesGm") : t("lp.miniaturesPlayer", { limit })}</p>
      <div className="lr-row" role="group" aria-label={t("lp.paintAria")}>
        {PAWN_PAINTS.map((paint) => (
          <button key={paint} type="button" className="lr-paint" style={{ background: paint }} aria-label={t("lp.paintColourAria", { paint })} aria-pressed={paint === colour} onClick={() => setColour(paint)} />
        ))}
      </div>
      <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={isGm ? t("lp.pawnLabelGmPlaceholder") : t("lp.pawnLabelPlaceholder")} aria-label={t("lp.pawnLabelAria")} maxLength={24} />
      <div className="lr-pawn-kinds">
        {PAWN_KINDS.map((kind) => {
          const kindName = t(PAWN_NAME_KEYS[kind]);
          return (
            <button key={kind} type="button" disabled={full || !myUserId} onClick={() => { onTake(kind, colour, label.trim()); if (isGm) setLabel(""); }} title={full ? t("lp.pawnFullTitle", { limit }) : t("lp.pawnPutTitle", { kind: kindName.toLowerCase() })}>
              <span aria-hidden="true">{PAWN_NAMES[kind].glyph}</span>{kindName}
            </button>
          );
        })}
      </div>
      {isGm && onSpawnMonster && (
        <>
          <small className="lr-heading">{t("lp.quickMonsterSpawner")}</small>
          <div className="lr-chips">
            {MONSTER_PALETTE.slice(0, 8).map((m) => (
              <button
                key={m.label}
                type="button"
                disabled={full || !myUserId}
                onClick={() => onSpawnMonster({
                  name: m.label,
                  hp: m.hp ?? 15,
                  size: m.size,
                  kind: m.size >= 3 ? "dragon" : m.size >= 2 ? "beast" : "fighter",
                  colour: m.color,
                  portraitUrl: tokenImageUrl(m.label),
                })}
              >
                + {m.label}
              </button>
            ))}
          </div>
          <div className="lr-row">
            <input value={monsterQ} onChange={(e) => setMonsterQ(e.target.value)} placeholder={t("lp.searchMonsterPlaceholder")} aria-label={t("lp.searchMonsterAria")} />
            {searching && <Loader2 size={14} className="spin" />}
          </div>
          {monsters.length > 0 && (
            <div className="lr-chips">
              {monsters.map((m) => (
                <button
                  key={m.name}
                  type="button"
                  className="primary"
                  disabled={full || !myUserId}
                  onClick={() => {
                    onSpawnMonster({ ...m, colour: "#9c3b30", portraitUrl: tokenImageUrl(m.name) });
                    setMonsterQ("");
                    setMonsters([]);
                  }}
                >
                  <Plus size={12} /> {m.name} ({m.hp} HP)
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {shown.length > 0 && (
        <>
          <small>{isGm ? t("lp.onTheTable", { count: all.length }) : t("lp.yoursOnTable", { count: mine.length, limit })}</small>
          <ul className="lr-list">
            {shown.map((pawn) => {
              const pawnLabel = pawn.label || t(PAWN_NAME_KEYS[pawn.kind]);
              return (
                <li key={pawn.id} className={pawn.id === held ? "lr-held" : ""}>
                  <span className="lr-name"><i className="lr-dot" style={{ background: pawn.colour }} />{pawnLabel}{isGm && pawn.owner !== myUserId ? <small> · {pawn.ownerName}</small> : null}</span>
                  <button type="button" className={pawn.id === held ? "active" : ""} aria-pressed={pawn.id === held} onClick={() => onHold(pawn.id === held ? null : pawn.id)} title={t("lp.moveTitle")}>{pawn.id === held ? t("lp.moving") : t("lp.move")}</button>
                  <button type="button" onClick={() => onPutBack(pawn.id)} aria-label={t("lp.putBackAria", { name: pawnLabel })} title={t("lp.putBackTitle")}><Trash2 size={12} /></button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {(isGm ? all.length > 0 : mine.length > 1) && (
        <div className="lr-row"><button type="button" onClick={onClear}>{isGm ? t("lp.clearTable") : t("lp.putAllMineBack")}</button></div>
      )}
    </div>
  );
}

interface BardSnapshot {
  available: boolean;
  connected?: boolean;
  in_voice?: boolean;
  room?: string | null;
  can_seat?: boolean;
  state?: {
    scene?: string;
    mood?: string;
    playing?: boolean;
    volume?: number;
    scenes?: Array<{ id: string; name?: string; title?: string } | string>;
    ambience?: Array<{ id: string; name?: string; active?: boolean } | string>;
    sfx?: Array<{ id: string; name?: string } | string>;
  } | null;
}

const BARD_MOODS = ["explore", "combat", "tavern", "tension", "victory"] as const;

export function BardPanel({ channelId, mood, onMood, onOpenCompanion, onClose }: {
  channelId: string | null;
  mood: TableMood;
  onMood: (mood: TableMood) => void;
  onOpenCompanion?: (path?: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [snap, setSnap] = useState<BardSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const data = await apiFetch<BardSnapshot>("/api/integrations/dnd/bard");
      setSnap(data);
    } catch {
      setSnap({ available: false });
    }
  };
  useEffect(() => { void load(); }, []);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await apiFetch("/api/integrations/dnd/bard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, channelId }),
      });
      await load();
    } catch {
      // Best effort.
    } finally {
      setBusy(false);
    }
  };
  const st = snap?.state;
  const vol = typeof st?.volume === "number" ? st.volume : 70;
  return (
    <div className="living-room-panel lr-bard" role="dialog" aria-label={t("lp.bardAria")}>
      <div className="living-room-panel-head">
        <strong><Music size={14} /> {t("lp.bardTitle")}</strong>
        <button type="button" onClick={onClose} aria-label={t("common.close")}><X size={14} /></button>
      </div>
      <small className="lr-heading">{t("lp.tableLightingMood")}</small>
      <div className="lr-chips">
        {TABLE_MOODS.map((m) => (
          <button key={m} type="button" className={mood === m ? "active" : ""} onClick={() => onMood(m)}>
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <small className="lr-heading">{t("lp.bardCompanion")}{snap?.in_voice ? t("lp.bardInVoice") : snap?.available ? t("lp.bardReady") : t("lp.bardOffline")}</small>
      {snap?.available ? (
        <>
          <div className="lr-row">
            {snap.in_voice ? (
              <button type="button" disabled={busy} onClick={() => void act({ action: "leave" })}><Radio size={13} /> {t("lp.leaveVoice")}</button>
            ) : (
              <button type="button" className="primary" disabled={busy || !snap.can_seat || !channelId} onClick={() => void act({ action: "join" })}><Radio size={13} /> {t("lp.joinVoice")}</button>
            )}
            <button type="button" disabled={busy} onClick={() => void act({ action: "command", cmd: "playback.toggle" })} title={st?.playing ? t("lp.pauseBtn") : t("lp.playBtn")}>
              {st?.playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button type="button" disabled={busy} onClick={() => void act({ action: "command", cmd: "playback.next" })} title={t("lp.skipTrack")}><SkipForward size={13} /></button>
            {onOpenCompanion && <button type="button" onClick={() => onOpenCompanion("/bard")}><ExternalLink size={12} /> {t("lp.fullBard")}</button>}
          </div>
          <label className="lr-field">
            <small><Volume2 size={11} /> {t("lp.volumePct", { vol: Math.round(vol) })}</small>
            <input type="range" min={0} max={100} value={vol} onChange={(e) => void act({ action: "command", cmd: "volume.set", payload: { volume: Number(e.target.value) } })} />
          </label>
          <small className="lr-heading">{t("lp.playlistMood")}</small>
          <div className="lr-chips">
            {BARD_MOODS.map((m) => (
              <button key={m} type="button" className={st?.mood === m ? "active" : ""} disabled={busy} onClick={() => void act({ action: "command", cmd: "mood.set", payload: { mood: m } })}>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          {Array.isArray(st?.scenes) && st.scenes.length > 0 && (
            <>
              <small className="lr-heading">{t("lp.scenes")}</small>
              <div className="lr-chips">
                {st.scenes.slice(0, 8).map((sc) => {
                  const id = typeof sc === "string" ? sc : sc.id;
                  const label = typeof sc === "string" ? sc : sc.name || sc.title || sc.id;
                  return (
                    <button key={id} type="button" className={st?.scene === id ? "active" : ""} disabled={busy} onClick={() => void act({ action: "command", cmd: "scene.set", payload: { scene: id } })}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {Array.isArray(st?.ambience) && st.ambience.length > 0 && (
            <>
              <small className="lr-heading">{t("lp.ambience")}</small>
              <div className="lr-chips">
                {st.ambience.slice(0, 8).map((am) => {
                  const id = typeof am === "string" ? am : am.id;
                  const label = typeof am === "string" ? am : am.name || am.id;
                  const active = typeof am !== "string" && Boolean(am.active);
                  return (
                    <button key={id} type="button" className={active ? "active" : ""} disabled={busy} onClick={() => void act({ action: "command", cmd: "ambience.toggle", payload: { id } })}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {Array.isArray(st?.sfx) && st.sfx.length > 0 && (
            <>
              <small className="lr-heading">{t("lp.sfx")}</small>
              <div className="lr-chips">
                {st.sfx.slice(0, 8).map((fx) => {
                  const id = typeof fx === "string" ? fx : fx.id;
                  const label = typeof fx === "string" ? fx : fx.name || fx.id;
                  return (
                    <button key={id} type="button" disabled={busy} onClick={() => void act({ action: "command", cmd: "sfx.play", payload: { id } })}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        <p className="lr-note">{t("lp.bardOfflineNote")}</p>
      )}
    </div>
  );
}
