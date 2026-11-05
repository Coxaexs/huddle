"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pause, Play, Plus, Repeat, RotateCcw, Shuffle, SkipForward, Square } from "lucide-react";
import { apiFetch } from "@/app/lib/client";
import { useI18n } from "@/app/lib/i18n-context";
import { proxiedImage } from "@/app/lib/image-proxy";
import type { WidgetSize } from "@/lib/layout-prefs";
import { heard, playbackPosition, type Track } from "@/lib/protocol";
import { useWidgetHost } from "./widget-host";

type Props = { size: WidgetSize };

/** /loop on its own means off, so the button steps through the three modes. */
const NEXT_LOOP = { off: "queue", queue: "track", track: "off" } as const;

/** The room these widgets show: yours, or else one playing in this server. */
function useRoomMusic() {
  const host = useWidgetHost();
  const room = host.voiceChannelId;
  const elsewhere = room ? null : host.voiceRooms.find((candidate) => host.players[candidate.id]?.track) ?? null;
  const roomId = room ?? elsewhere?.id ?? null;
  const state = heard(host.players[roomId ?? ""] ?? null);
  const track = state?.track ?? null;
  return { room, roomId, state, track, playing: Boolean(track && !state?.paused) };
}

/** Runs a music command the way the slash commands do, so the DJ booth gets it too. */
function useMusicCommand() {
  const { room } = useRoomMusic();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(timer);
  }, [note]);
  const run = async (command: string) => {
    if (!room || busy) return;
    setBusy(true);
    try {
      await apiFetch("/api/music/command", {
        method: "POST",
        body: JSON.stringify({ command, voiceChannelId: room, textChannelId: null, silent: true }),
      });
    } catch (error) {
      setNote(error instanceof Error ? error.message : t("widget.failed"));
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, note, canRun: Boolean(room) };
}

function Idle() {
  const { t } = useI18n();
  const { room } = useRoomMusic();
  return <p className="bw-muted">{t(room ? "widget.music.idle" : "widget.music.joinFirst")}</p>;
}

function TrackLine({ track }: { track: Pick<Track, "title" | "artist"> }) {
  return (
    <span className="bw-grow bw-line" title={track.title}>
      {track.title}
      {track.artist ? <span className="bw-muted"> · {track.artist}</span> : null}
    </span>
  );
}

export function MusicControlsWidget({ size }: Props) {
  const { t } = useI18n();
  const { track, playing, state } = useRoomMusic();
  const { run, busy, note, canRun } = useMusicCommand();
  if (!canRun) return <Idle />;
  const off = busy || !track;
  const small = size === "small";
  return (
    <div className="bw">
      <div className="bw-row">
        <button type="button" className="bw-btn" disabled={off} title={t("widget.musicControls.replay")} aria-label={t("widget.musicControls.replay")} onClick={() => void run("/replay")}><RotateCcw size={14} /></button>
        <button type="button" className="bw-btn on" disabled={off} title={t(playing ? "widget.music.pause" : "widget.music.play")} aria-label={t(playing ? "widget.music.pause" : "widget.music.play")} onClick={() => void run(playing ? "/pause" : "/resume")}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
        <button type="button" className="bw-btn" disabled={off} title={t("widget.music.skip")} aria-label={t("widget.music.skip")} onClick={() => void run("/skip")}><SkipForward size={14} /></button>
        {!small && (
          <>
            <button type="button" className="bw-btn" disabled={busy || !state?.queue.length} title={t("widget.musicControls.shuffle")} aria-label={t("widget.musicControls.shuffle")} onClick={() => void run("/shuffle")}><Shuffle size={14} /></button>
            <button type="button" className={`bw-btn ${state?.loop && state.loop !== "off" ? "on" : ""}`} disabled={off} title={t("widget.musicControls.loop")} aria-label={t("widget.musicControls.loop")} onClick={() => void run(`/loop ${NEXT_LOOP[state?.loop ?? "off"]}`)}><Repeat size={14} /></button>
            <button type="button" className="bw-btn" disabled={off} title={t("widget.musicControls.stop")} aria-label={t("widget.musicControls.stop")} onClick={() => void run("/stop")}><Square size={14} /></button>
          </>
        )}
      </div>
      {note && <p className="bw-muted">{note}</p>}
    </div>
  );
}

export function MusicQueueWidget({ size }: Props) {
  const { t } = useI18n();
  const { state } = useRoomMusic();
  const queue = state?.queue ?? [];
  if (size === "small") {
    return <div className="bw-row bw-line">{queue[0] ? <TrackLine track={queue[0]} /> : <span className="bw-muted">{t("widget.musicQueue.empty")}</span>}</div>;
  }
  const shown = queue.slice(0, size === "large" ? 12 : 5);
  return (
    <div className="bw">
      <span className="bw-head">{t("widget.music.upNext")}</span>
      {!shown.length ? <p className="bw-muted">{t("widget.musicQueue.empty")}</p> : (
        <ol className="bw-list">{shown.map((item) => <li key={item.id}><TrackLine track={item} /></li>)}</ol>
      )}
      {queue.length > shown.length && <span className="bw-muted">{t("widget.music.more", { count: queue.length - shown.length })}</span>}
    </div>
  );
}

export function MusicHistoryWidget({ size }: Props) {
  const { t } = useI18n();
  const { state } = useRoomMusic();
  const { run, busy, canRun } = useMusicCommand();
  const history = state?.history ?? [];
  if (size === "small") {
    return <div className="bw-row bw-line">{history[0] ? <TrackLine track={history[0]} /> : <span className="bw-muted">{t("widget.musicHistory.empty")}</span>}</div>;
  }
  const shown = history.slice(0, size === "large" ? 12 : 5);
  return (
    <div className="bw">
      <span className="bw-head">{t("widget.musicHistory")}</span>
      {!shown.length ? <p className="bw-muted">{t("widget.musicHistory.empty")}</p> : (
        <ul className="bw-list">
          {shown.map((item) => (
            <li key={item.id}>
              <TrackLine track={item} />
              {canRun && (
                <button type="button" className="bw-btn" disabled={busy} title={t("widget.musicHistory.again")} aria-label={t("widget.musicHistory.again")} onClick={() => void run(`/playnext ${item.pageUrl || item.title}`)}>
                  <Plus size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MusicCoverWidget({ size }: Props) {
  const { track } = useRoomMusic();
  if (!track) return <Idle />;
  const cover = track.thumbnail ? proxiedImage(track.thumbnail) : null;
  return (
    <div className={size === "small" ? "bw-row" : "bw"}>
      {cover && <img className="bw-cover" src={cover} alt="" />}
      <TrackLine track={track} />
    </div>
  );
}

type LyricsAnswer = { trackId: string | null; lines?: Array<[number, string]>; lyrics?: string | null };

/** Saved lyrics only: asking for a lookup here would spend the small Musixmatch plan. */
export function MusicLyricsWidget({ size }: Props) {
  const { t } = useI18n();
  const { roomId, track, state, playing } = useRoomMusic();
  const [answer, setAnswer] = useState<LyricsAnswer | null>(null);
  const [, setTick] = useState(0);
  const trackId = track?.id ?? null;

  useEffect(() => {
    setAnswer(null);
    if (!roomId || !trackId) return;
    let stale = false;
    void apiFetch<LyricsAnswer>(`/api/music/lyrics?${new URLSearchParams({ voiceChannelId: roomId })}`)
      .then((body) => { if (!stale) setAnswer(body); })
      .catch(() => { if (!stale) setAnswer({ trackId: null }); });
    return () => { stale = true; };
  }, [roomId, trackId]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [playing]);

  if (!track) return <Idle />;
  const lines = answer?.lines ?? [];
  if (!lines.length) {
    const plain = answer?.lyrics;
    if (plain && size === "large") return <div className="bw bw-text">{plain}</div>;
    return <p className="bw-muted">{t("widget.musicLyrics.none")}</p>;
  }
  const seconds = state ? playbackPosition(state) / 1000 : 0;
  let index = 0;
  lines.forEach(([at], position) => { if (at <= seconds) index = position; });
  const now = lines[index]?.[1] || "♪";
  if (size === "small") return <div className="bw-line">{now}</div>;
  const after = lines.slice(index + 1, index + (size === "large" ? 5 : 2));
  return (
    <div className="bw">
      <span className="bw-lyric-now">{now}</span>
      {after.map(([at, line]) => <span key={at} className="bw-muted">{line || "♪"}</span>)}
    </div>
  );
}

type Result = { title: string; artist: string; url: string };

export function MusicSearchWidget({ size }: Props) {
  const { t } = useI18n();
  const { track } = useRoomMusic();
  const { run, busy, note, canRun } = useMusicCommand();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);

  if (!canRun) return <Idle />;
  const add = (what: string) => void run(`${track ? "/playnext" : "/play"} ${what}`);
  const search = async (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    if (size === "small") {
      setQuery("");
      add(text);
      return;
    }
    setSearching(true);
    try {
      const body = await apiFetch<{ results?: Result[] }>(`/api/music/search?${new URLSearchParams({ q: text })}`);
      setResults(body.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };
  return (
    <div className="bw">
      <form className="bw-row" onSubmit={(event) => void search(event)}>
        <input className="bw-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("widget.music.queueAdd")} aria-label={t("widget.musicSearch")} />
        <button type="submit" className="bw-btn" disabled={busy || searching || !query.trim()}>{size === "small" ? <Plus size={12} /> : t("widget.musicSearch.go")}</button>
      </form>
      {results.length > 0 && (
        <ul className="bw-list">
          {results.slice(0, size === "large" ? 8 : 4).map((item) => (
            <li key={item.url}>
              <TrackLine track={item} />
              <button type="button" className="bw-btn" disabled={busy} aria-label={t("widget.music.queueAdd")} onClick={() => add(item.url)}><Plus size={12} /></button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="bw-muted">{note}</p>}
    </div>
  );
}

type Playlist = { name: string; count: number };

export function MusicPlaylistsWidget({ size }: Props) {
  const { t } = useI18n();
  const { room } = useRoomMusic();
  const [lists, setLists] = useState<Playlist[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!room) return;
    let stale = false;
    void apiFetch<{ playlists?: Playlist[] }>(`/api/music/playlists?${new URLSearchParams({ voiceChannelId: room })}`)
      .then((body) => { if (!stale) setLists(body.playlists ?? []); })
      .catch(() => { if (!stale) setLists([]); });
    return () => { stale = true; };
  }, [room]);

  const play = async (name: string) => {
    try {
      const body = await apiFetch<{ message?: string }>("/api/music/playlists", {
        method: "POST",
        body: JSON.stringify({ voiceChannelId: room, name, mode: "play" }),
      });
      setNote(body.message ?? null);
    } catch (error) {
      setNote(error instanceof Error ? error.message : t("widget.failed"));
    }
  };

  if (!room) return <Idle />;
  if (!lists) return <p className="bw-muted">…</p>;
  if (!lists.length) return <p className="bw-muted">{t("widget.musicPlaylists.empty")}</p>;
  const shown = lists.slice(0, size === "small" ? 1 : size === "large" ? 12 : 5);
  return (
    <div className="bw">
      <ul className="bw-list">
        {shown.map((list) => (
          <li key={list.name}>
            <span className="bw-grow bw-line">{list.name} <span className="bw-muted">{list.count}</span></span>
            <button type="button" className="bw-btn" aria-label={t("widget.music.play")} onClick={() => void play(list.name)}><Play size={12} /></button>
          </li>
        ))}
      </ul>
      {note && <p className="bw-muted">{note}</p>}
    </div>
  );
}

/** What is playing in every voice room of this server, with a way in. */
export function MusicRoomsWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const rooms = useMemo(
    () => host.voiceRooms.map((room) => ({ ...room, track: heard(host.players[room.id] ?? null)?.track ?? null })).filter((room) => room.track),
    [host.voiceRooms, host.players],
  );
  if (!rooms.length) return <p className="bw-muted">{t("widget.musicRooms.none")}</p>;
  return (
    <ul className="bw-list">
      {rooms.slice(0, size === "small" ? 1 : 8).map((room) => (
        <li key={room.id}>
          <span className="bw-grow bw-line"><strong>{room.name}</strong> <span className="bw-muted">{room.track?.title}</span></span>
          {room.id !== host.voiceChannelId && <button type="button" className="bw-btn" onClick={() => host.joinVoice(room.id)}>{t("widget.music.join")}</button>}
        </li>
      ))}
    </ul>
  );
}
