"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Check,
  History,
  Library,
  ListMusic,
  Maximize2,
  MicVocal,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Repeat1,
  RotateCcw,
  Search,
  Shuffle,
  SkipForward,
  Square,
  X,
} from "lucide-react";
import { apiFetch } from "@/app/lib/client";
import { useI18n } from "@/app/lib/i18n-context";
import { proxiedImage } from "@/app/lib/image-proxy";
import type { WidgetSize } from "@/lib/layout-prefs";
import { heard, playbackPosition } from "@/lib/protocol";
import { openMusicPlayer } from "../music-player";
import { useWidgetHost } from "./widget-host";
import { clock, Progress, Row, Shell, ThinBar, Thumb, Tile, useTicking } from "./widget-parts";

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
  return { room, elsewhere, roomId, state, track, playing: Boolean(track && !state?.paused) };
}

/** How far through its song a room is. Nothing playing, or a live stream, has no answer. */
function songProgress(state: ReturnType<typeof heard>) {
  const duration = state?.track?.duration ? state.track.duration * 1000 : 0;
  if (!state || !duration) return null;
  const position = Math.min(playbackPosition(state), duration);
  return { position, duration, percent: (position / duration) * 100 };
}

/** The Music widget's bar for the song in this room; a thin line at small size. */
function TrackBar({ size }: Props) {
  const { state, playing } = useRoomMusic();
  useTicking(playing);
  const progress = songProgress(state);
  if (!progress) return null;
  if (size === "small") return <ThinBar edge percent={progress.percent} />;
  return <Progress position={progress.position} duration={progress.duration} />;
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

/** The line under a title when there is nothing to show. */
function useIdleLine() {
  const { t } = useI18n();
  const { room } = useRoomMusic();
  return t(room ? "widget.music.idle" : "widget.music.joinFirst");
}

export function MusicControlsWidget({ size }: Props) {
  const { t } = useI18n();
  const { track, playing, state } = useRoomMusic();
  const { run, busy, note, canRun } = useMusicCommand();
  const idle = useIdleLine();

  const off = busy || !track || !canRun;
  const loop = state?.loop ?? "off";
  const main = (
    <button type="button" className="mw-btn mw-btn-main" disabled={off} title={t(playing ? "widget.music.pause" : "widget.music.play")} aria-label={t(playing ? "widget.music.pause" : "widget.music.play")} onClick={() => void run(playing ? "/pause" : "/resume")}>
      {playing ? <Pause size={size === "small" ? 14 : 16} /> : <Play size={size === "small" ? 14 : 16} />}
    </button>
  );
  const skip = (
    <button type="button" className="mw-btn" disabled={off} title={t("widget.music.skip")} aria-label={t("widget.music.skip")} onClick={() => void run("/skip")}><SkipForward size={14} /></button>
  );
  const tile = <Tile image={track?.thumbnail}><Music2 size={size === "small" ? 13 : 18} /></Tile>;
  const title = track?.title || t("widget.musicControls");
  const subtitle = track ? track.artist : idle;
  if (size === "small") {
    return <Shell size={size} tile={tile} title={title} note={note} bar={<TrackBar size={size} />} right={<span className="mw-controls">{main}{skip}</span>} />;
  }
  return (
    <Shell size={size} bigTile tile={tile} title={title} subtitle={subtitle} note={note} bar={<TrackBar size={size} />}>
      <div className="xw-transport">
        <button type="button" className={`mw-btn ${loop !== "off" ? "xw-on" : ""}`} disabled={off} title={t("widget.musicControls.loop")} aria-label={t("widget.musicControls.loop")} onClick={() => void run(`/loop ${NEXT_LOOP[loop]}`)}>
          {loop === "track" ? <Repeat1 size={14} /> : <Repeat size={14} />}
        </button>
        <button type="button" className="mw-btn" disabled={off} title={t("widget.musicControls.replay")} aria-label={t("widget.musicControls.replay")} onClick={() => void run("/replay")}><RotateCcw size={14} /></button>
        {main}
        {skip}
        <button type="button" className="mw-btn" disabled={busy || !state?.queue.length || !canRun} title={t("widget.musicControls.shuffle")} aria-label={t("widget.musicControls.shuffle")} onClick={() => void run("/shuffle")}><Shuffle size={14} /></button>
        <button type="button" className="mw-btn" disabled={off} title={t("widget.musicControls.stop")} aria-label={t("widget.musicControls.stop")} onClick={() => void run("/stop")}><Square size={13} /></button>
      </div>
    </Shell>
  );
}

export function MusicQueueWidget({ size }: Props) {
  const { t } = useI18n();
  const { state } = useRoomMusic();
  const { run, busy, note, canRun } = useMusicCommand();
  const queue = state?.queue ?? [];
  const next = queue[0];
  const tile = <Tile image={next?.thumbnail}><ListMusic size={size === "small" ? 13 : 18} /></Tile>;
  if (size === "small") {
    return <Shell size={size} tile={tile} title={next?.title || t("widget.musicQueue")} subtitle={next ? t("widget.music.upNext") : t("widget.musicQueue.empty")} note={note} bar={<TrackBar size={size} />} />;
  }
  const seconds = queue.reduce((sum, item) => sum + (item.duration ?? 0), 0);
  const count = t("widget.musicQueue.count", { count: queue.length });
  const shown = queue.slice(0, size === "large" ? 12 : 4);
  return (
    <Shell size={size} tile={tile} title={t("widget.musicQueue")} subtitle={queue.length ? (seconds ? `${count} · ${clock(seconds * 1000)}` : count) : t("widget.musicQueue.empty")} note={note} bar={<TrackBar size={size} />}>
      {shown.length > 0 && (
        <ol className="xw-list">
          {shown.map((item, index) => (
            <Row
              key={item.id}
              thumb={<Thumb image={item.thumbnail}>{index + 1}</Thumb>}
              title={item.title}
              subtitle={item.artist}
              label={t("widget.musicQueue.jump")}
              onClick={canRun && !busy ? () => void run(`/skipto ${index + 1}`) : undefined}
              end={
                canRun ? (
                  <button type="button" className="mw-btn xw-on-hover" disabled={busy} title={t("widget.musicQueue.remove")} aria-label={t("widget.musicQueue.remove")} onClick={() => void run(`/remove ${index + 1}`)}><X size={13} /></button>
                ) : null
              }
            />
          ))}
        </ol>
      )}
      {queue.length > shown.length && <small className="mw-more">{t("widget.music.more", { count: queue.length - shown.length })}</small>}
    </Shell>
  );
}

export function MusicHistoryWidget({ size }: Props) {
  const { t } = useI18n();
  const { state } = useRoomMusic();
  const { run, busy, note, canRun } = useMusicCommand();
  const history = state?.history ?? [];
  const last = history[0];
  const tile = <Tile image={last?.thumbnail}><History size={size === "small" ? 13 : 18} /></Tile>;
  if (size === "small") {
    return <Shell size={size} tile={tile} title={last?.title || t("widget.musicHistory")} subtitle={last ? t("widget.musicHistory") : t("widget.musicHistory.empty")} note={note} bar={<TrackBar size={size} />} />;
  }
  const shown = history.slice(0, size === "large" ? 12 : 4);
  return (
    <Shell size={size} tile={tile} title={t("widget.musicHistory")} subtitle={history.length ? t("widget.musicQueue.count", { count: history.length }) : t("widget.musicHistory.empty")} note={note} bar={<TrackBar size={size} />}>
      {shown.length > 0 && (
        <ul className="xw-list">
          {shown.map((item) => (
            <Row
              key={item.id}
              thumb={<Thumb image={item.thumbnail}><Music2 size={13} /></Thumb>}
              title={item.title}
              subtitle={item.artist}
              end={
                canRun ? (
                  <button type="button" className="mw-btn xw-on-hover" disabled={busy} title={t("widget.musicHistory.again")} aria-label={t("widget.musicHistory.again")} onClick={() => void run(`/playnext ${item.pageUrl || item.title}`)}><Plus size={13} /></button>
                ) : null
              }
            />
          ))}
        </ul>
      )}
    </Shell>
  );
}

export function MusicCoverWidget({ size }: Props) {
  const { t } = useI18n();
  const { track, roomId } = useRoomMusic();
  const idle = useIdleLine();
  if (size === "small" || !track) {
    return <Shell size={size} tile={<Tile image={track?.thumbnail}><Music2 size={size === "small" ? 13 : 18} /></Tile>} title={track?.title || t("widget.musicCover")} subtitle={track ? track.artist : idle} bar={<TrackBar size={size} />} />;
  }
  return (
    <button type="button" className={`xw-cover xw-cover-${size}`} title={t("widget.musicCover.open")} aria-label={t("widget.musicCover.open")} onClick={() => openMusicPlayer({ channelId: roomId })}>
      {track.thumbnail ? <img src={proxiedImage(track.thumbnail)} alt="" loading="lazy" /> : <span className="xw-cover-none"><Music2 size={36} /></span>}
      <span className="xw-cover-text">
        <strong>{track.title}</strong>
        {track.artist ? <small>{track.artist}</small> : null}
        <TrackBar size={size} />
      </span>
    </button>
  );
}

type LyricsAnswer = { trackId: string | null; lines?: Array<[number, string]>; lyrics?: string | null };

/** Saved lyrics only: a lookup from here would spend the small Musixmatch plan. */
export function MusicLyricsWidget({ size }: Props) {
  const { t } = useI18n();
  const { roomId, track, state, playing } = useRoomMusic();
  const idle = useIdleLine();
  const [answer, setAnswer] = useState<LyricsAnswer | null>(null);
  const trackId = track?.id ?? null;
  useTicking(playing, 500);

  useEffect(() => {
    setAnswer(null);
    if (!roomId || !trackId) return;
    let stale = false;
    void apiFetch<LyricsAnswer>(`/api/music/lyrics?${new URLSearchParams({ voiceChannelId: roomId })}`)
      .then((body) => { if (!stale) setAnswer(body); })
      .catch(() => { if (!stale) setAnswer({ trackId: null }); });
    return () => { stale = true; };
  }, [roomId, trackId]);

  const lines = answer?.lines ?? [];
  const seconds = state ? playbackPosition(state) / 1000 : 0;
  let index = 0;
  lines.forEach(([at], position) => { if (at <= seconds) index = position; });
  const now = lines[index]?.[1] || "♪";
  const tile = <Tile image={track?.thumbnail}><MicVocal size={size === "small" ? 13 : 18} /></Tile>;
  const full = roomId ? (
    <button type="button" className="mw-btn" title={t("widget.musicLyrics.open")} aria-label={t("widget.musicLyrics.open")} onClick={() => openMusicPlayer({ channelId: roomId, tab: "lyrics" })}><Maximize2 size={14} /></button>
  ) : null;

  if (size === "small") {
    return <Shell size={size} tile={tile} title={lines.length ? now : track?.title || t("widget.musicLyrics")} subtitle={lines.length ? undefined : track ? t("widget.musicLyrics.none") : idle} bar={<TrackBar size={size} />} />;
  }
  if (!track) return <Shell size={size} tile={tile} title={t("widget.musicLyrics")} subtitle={idle} />;
  if (!lines.length) {
    const plain = answer?.lyrics;
    return (
      <Shell size={size} tile={tile} title={track.title} subtitle={plain ? track.artist : t("widget.musicLyrics.none")} right={full} bar={<TrackBar size={size} />}>
        {plain && size === "large" && <div className="xw-text">{plain}</div>}
      </Shell>
    );
  }
  const around = size === "large" ? 2 : 1;
  const before = lines.slice(Math.max(0, index - around), index);
  const after = lines.slice(index + 1, index + 1 + around);
  return (
    <Shell size={size} tile={tile} title={track.title} subtitle={track.artist} right={full} bar={<TrackBar size={size} />}>
      <div className="xw-lyrics">
        {before.map(([at, line]) => <span key={at}>{line || "♪"}</span>)}
        <strong>{now}</strong>
        {after.map(([at, line]) => <span key={at}>{line || "♪"}</span>)}
      </div>
    </Shell>
  );
}

type Result = { title: string; artist: string; url: string; thumbnail?: string | null; duration?: number | null };

export function MusicSearchWidget({ size }: Props) {
  const { t } = useI18n();
  const { track } = useRoomMusic();
  const { run, busy, note, canRun } = useMusicCommand();
  const idle = useIdleLine();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);

  const add = (what: string) => {
    setAdded((list) => [...list, what]);
    void run(`${track ? "/playnext" : "/play"} ${what}`);
  };
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
      setAdded([]);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };
  const box = (
    <form className="mw-queue" onSubmit={(event) => void search(event)}>
      {size === "small" ? <Plus size={13} aria-hidden="true" /> : <Search size={13} aria-hidden="true" />}
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("widget.music.queueAdd")} aria-label={t("widget.musicSearch")} maxLength={300} />
    </form>
  );
  const tile = <Tile><Search size={size === "small" ? 13 : 18} /></Tile>;
  if (!canRun) return <Shell size={size} tile={tile} title={t("widget.musicSearch")} subtitle={idle} bar={<TrackBar size={size} />} />;
  if (size === "small") {
    return <div className="mw mw-small">{tile}{note ? <span className="mw-line"><small role="status">{note}</small></span> : box}<TrackBar size={size} /></div>;
  }
  return (
    <Shell size={size} tile={tile} title={t("widget.musicSearch")} subtitle={searching ? "…" : t("widget.musicSearch.hint")} note={note} bar={<TrackBar size={size} />}>
      {box}
      {results.length > 0 && (
        <ul className="xw-list">
          {results.slice(0, size === "large" ? 8 : 4).map((item) => (
            <Row
              key={item.url}
              thumb={<Thumb image={item.thumbnail}><Music2 size={13} /></Thumb>}
              title={item.title}
              subtitle={item.artist}
              end={
                <button type="button" className="mw-btn" disabled={busy || added.includes(item.url)} title={t("widget.music.queueAdd")} aria-label={t("widget.music.queueAdd")} onClick={() => add(item.url)}>
                  {added.includes(item.url) ? <Check size={13} /> : <Plus size={13} />}
                </button>
              }
            />
          ))}
        </ul>
      )}
    </Shell>
  );
}

type Playlist = { name: string; count: number; cover?: string | null };

export function MusicPlaylistsWidget({ size }: Props) {
  const { t } = useI18n();
  const { room } = useRoomMusic();
  const idle = useIdleLine();
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

  const playButton = (name: string, main = false) => (
    <button type="button" className={`mw-btn ${main ? "mw-btn-main" : ""}`} title={t("widget.music.play")} aria-label={t("widget.music.play")} onClick={() => void play(name)}><Play size={13} /></button>
  );
  const first = lists?.[0];
  const tile = <Tile image={first?.cover}><Library size={size === "small" ? 13 : 18} /></Tile>;
  if (!room) return <Shell size={size} tile={tile} title={t("widget.musicPlaylists")} subtitle={idle} bar={<TrackBar size={size} />} />;
  if (size === "small") {
    return <Shell size={size} tile={tile} title={first?.name || t("widget.musicPlaylists")} subtitle={first ? undefined : t("widget.musicPlaylists.empty")} note={note} bar={<TrackBar size={size} />} right={first ? playButton(first.name, true) : null} />;
  }
  const shown = (lists ?? []).slice(0, size === "large" ? 12 : 4);
  return (
    <Shell size={size} tile={tile} title={t("widget.musicPlaylists")} subtitle={lists?.length ? t("widget.musicPlaylists.count", { count: lists.length }) : t("widget.musicPlaylists.empty")} note={note} bar={<TrackBar size={size} />}>
      {shown.length > 0 && (
        <ul className="xw-list">
          {shown.map((list) => (
            <Row key={list.name} thumb={<Thumb image={list.cover}><Library size={13} /></Thumb>} title={list.name} subtitle={t("widget.musicQueue.count", { count: list.count })} end={playButton(list.name)} />
          ))}
        </ul>
      )}
    </Shell>
  );
}

/** What is playing in every voice room of this server, with a way in. */
export function MusicRoomsWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const rooms = useMemo(
    () =>
      host.voiceRooms
        .map((room) => {
          const state = heard(host.players[room.id] ?? null);
          return { ...room, state, track: state?.track ?? null };
        })
        .filter((room) => room.track),
    [host.voiceRooms, host.players],
  );
  useTicking(rooms.some((room) => !room.state?.paused));
  const first = rooms[0];
  const firstProgress = songProgress(first?.state ?? null);
  const join = (id: string) =>
    id === host.voiceChannelId ? <small className="xw-here">{t("widget.musicRooms.here")}</small> : <button type="button" className="mw-join" onClick={() => host.joinVoice(id)}>{t("widget.music.join")}</button>;
  const tile = <Tile image={size === "small" ? first?.track?.thumbnail : null}><Radio size={size === "small" ? 13 : 18} /></Tile>;
  if (size === "small") {
    return <Shell size={size} tile={tile} title={first?.track?.title || t("widget.musicRooms")} subtitle={first ? first.name : t("widget.musicRooms.none")} right={first ? join(first.id) : null} bar={firstProgress ? <ThinBar edge percent={firstProgress.percent} /> : null} />;
  }
  return (
    <Shell size={size} tile={tile} title={t("widget.musicRooms")} subtitle={rooms.length ? t("widget.musicRooms.count", { count: rooms.length }) : t("widget.musicRooms.none")}>
      {rooms.length > 0 && (
        <ul className="xw-list">
          {rooms.slice(0, 8).map((room) => {
            const progress = songProgress(room.state);
            return (
              <Row
                key={room.id}
                thumb={<Thumb image={room.track?.thumbnail}><Music2 size={13} /></Thumb>}
                title={room.name}
                subtitle={room.track?.title}
                bar={progress ? <ThinBar percent={progress.percent} /> : null}
                end={join(room.id)}
              />
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
