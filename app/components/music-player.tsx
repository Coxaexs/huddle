"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ChevronDown,
  CirclePlus,
  CircleStop,
  Disc3,
  ExternalLink,
  Library,
  ListMusic,
  ListPlus,
  LoaderCircle,
  MicVocal,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  RotateCcw,
  Search,
  Shuffle,
  SkipForward,
  Sparkles,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { apiFetch } from "@/app/lib/client";
import { proxiedImage } from "@/app/lib/image-proxy";
import { heard, isSongLink, playbackPosition, type PlayerState, type Track } from "@/lib/protocol";
import { openWebView } from "./widgets/web-view";
import { lyricsSource } from "@/app/lib/lyrics-source";
import type { TimedWord, WordsDonor, WordsFrom } from "@/lib/musicbot";

/**
 * Hoffle's full-screen music player: the room's song with synced lyrics you
 * can click to jump to, what is up next, a search, the room's playlists and a
 * simple DJ booth.
 * It is the /lyricsnow card made big (the card's expand button opens it), and
 * /player opens it too. Everything goes through the same commands and hub
 * actions as the chat cards, so the DJ booth and permissions work the same.
 */

export type MusicPlayerTab = "lyrics" | "queue" | "search" | "playlists" | "dj";

/** Lyrics a /lyricsnow card already has, so opening it needs no new lookup. */
export interface MusicPlayerSeed {
  trackId: string;
  lines: Array<{ at: number; line: string }>;
  source?: string | null;
  sourceUrl?: string | null;
  versionLength?: number | null;
  loose?: boolean;
}

interface MusicPlayerView {
  /** The voice room to show; the one you are in when not given. */
  channelId: string | null;
  tab: MusicPlayerTab;
  seed: MusicPlayerSeed | null;
  /** Open the lyrics tab straight on "Wrong lyrics?" (the card's button). */
  fix?: boolean;
}

let current: MusicPlayerView | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function openMusicPlayer(view: Partial<MusicPlayerView> = {}) {
  current = {
    channelId: view.channelId ?? null,
    tab: view.tab ?? "lyrics",
    seed: view.seed ?? null,
    fix: view.fix ?? false,
  };
  emit();
}

export function closeMusicPlayer() {
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMusicPlayerView(): MusicPlayerView | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

function clock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "–:––";
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

function Thumb({ src, label }: { src: string | null | undefined; label?: string }) {
  return src ? (
    <img className="mp-thumb" src={proxiedImage(src)} alt={label ?? ""} loading="lazy" />
  ) : (
    <span className="mp-thumb empty" aria-hidden="true">
      <Music2 size={16} />
    </span>
  );
}

function Empty({ icon, title, text, children }: {
  icon: ReactNode;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mp-empty">
      <span className="mp-empty-icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export interface MusicPlayerLayerProps {
  /** Every voice room's player, from the hub. */
  players: Record<string, PlayerState>;
  /** The voice room this tab is in. */
  voiceChannelId: string | null;
  /** The server's voice rooms. */
  voiceRooms: Array<{ id: string; name: string }>;
  /** The smooth playback position of your own room (ms), from the page's player. */
  position: number;
  /** Moves a room's song to this point for everyone (the hub's seek). */
  onSeek: (channelId: string, positionMs: number) => void;
  joinVoice: (channelId: string) => void;
  /** Your own listening volume (0–100). */
  volume?: number;
  onVolume?: (volume: number) => void;
  /** Unlocks the page's audio element from a click. */
  prime?: () => void;
  /** Lyrics, search, playlists and the DJ booth come from the music bot. */
  musicBot?: boolean;
}

/** Mounted once by the chat shell; shows the player while it is open. */
export function MusicPlayerLayer(props: MusicPlayerLayerProps) {
  const view = useMusicPlayerView();
  if (!view) return null;
  return <MusicPlayer {...props} view={view} />;
}

const TABS: Array<{ id: MusicPlayerTab; label: string; icon: ReactNode }> = [
  { id: "lyrics", label: "Lyrics", icon: <MicVocal size={15} /> },
  { id: "queue", label: "Up next", icon: <ListMusic size={15} /> },
  { id: "search", label: "Search", icon: <Search size={15} /> },
  { id: "playlists", label: "Playlists", icon: <Library size={15} /> },
  { id: "dj", label: "DJ", icon: <Disc3 size={15} /> },
];

const LOOP_NEXT: Record<PlayerState["loop"], PlayerState["loop"]> = {
  off: "queue",
  queue: "track",
  track: "off",
};
const LOOP_LABEL: Record<PlayerState["loop"], string> = {
  off: "Repeat is off",
  queue: "Repeating the queue",
  track: "Repeating this song",
};

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
      (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(element.tagName)),
  );
}

function MusicPlayer({
  view,
  players,
  voiceChannelId,
  voiceRooms,
  position,
  onSeek,
  joinVoice,
  volume,
  onVolume,
  prime,
  musicBot = true,
}: MusicPlayerLayerProps & { view: MusicPlayerView }) {
  const [tab, setTab] = useState<MusicPlayerTab>(musicBot ? view.tab : "queue");
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<{ song: SongToAdd | null } | null>(null);
  const [openList, setOpenList] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetOpener = useRef<HTMLElement | null>(null);

  useEffect(() => setTab(view.tab), [view]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(timer);
  }, [note]);
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const roomId =
    view.channelId ??
    voiceChannelId ??
    voiceRooms.find((room) => players[room.id]?.track)?.id ??
    voiceRooms[0]?.id ??
    null;
  const roomName = voiceRooms.find((room) => room.id === roomId)?.name ?? "the voice room";
  const inRoom = Boolean(roomId && roomId === voiceChannelId);
  const playlists = useRoomPlaylists(roomId);
  const state = roomId ? heard(players[roomId] ?? null, now) : null;
  const track: Track | null = state?.track ?? null;
  const durationMs = track?.duration ? track.duration * 1000 : 0;
  const rawPosition = state && track ? (inRoom && position ? position : playbackPosition(state, now)) : 0;
  const positionMs = durationMs ? Math.min(rawPosition, durationMs) : rawPosition;
  const paused = !state || state.paused;
  const controls = inRoom && Boolean(track);

  /**
   * A music command for the room, without a chat message (like the widget),
   * answering with what the command route answers. Reads (/settings) work
   * from outside the room; everything else needs you in it.
   */
  const command = useCallback(
    async (
      text: string,
      options: { announce?: boolean; read?: boolean } = {},
    ): Promise<Record<string, any> | null> => {
      if (!roomId) return null;
      if (!inRoom && !options.read) {
        setNote(`Join ${roomName} to control its music.`);
        return null;
      }
      if (/^\/(play|playnext|resume|skip|skipto|replay)\b/.test(text)) prime?.();
      if (!options.read) setBusy(true);
      try {
        const data = await apiFetch<Record<string, any>>("/api/music/command", {
          method: "POST",
          body: JSON.stringify({ command: text, voiceChannelId: roomId, textChannelId: null, silent: true }),
        });
        if (options.announce && data?.text) setNote(String(data.text));
        return data ?? {};
      } catch (error) {
        setNote(error instanceof Error ? error.message : "That did not work.");
        return null;
      } finally {
        if (!options.read) setBusy(false);
      }
    },
    [roomId, inRoom, roomName, prime],
  );
  const run = useCallback(
    async (text: string, announce = false): Promise<boolean> =>
      (await command(text, { announce })) !== null,
    [command],
  );

  const seek = useCallback(
    (ms: number) => {
      if (!roomId || !inRoom) return;
      onSeek(roomId, Math.max(0, Math.round(durationMs ? Math.min(ms, durationMs - 500) : ms)));
    },
    [roomId, inRoom, onSeek, durationMs],
  );

  const toggle = useCallback(() => {
    if (controls) void run(paused ? "/resume" : "/pause");
  }, [controls, paused, run]);

  const playPlaylist = useCallback(
    async (name: string, mode: "play" | "queue", start = 0, startTitle?: string) => {
      if (!roomId) return;
      if (!inRoom) {
        setNote(`Join ${roomName} to play music there.`);
        return;
      }
      prime?.();
      try {
        const data = await apiFetch<{ message?: string }>("/api/music/playlists", {
          method: "POST",
          body: JSON.stringify({ voiceChannelId: roomId, name, mode, start, startTitle }),
        });
        setNote(data.message || "Done.");
        if (mode === "play") setTab("lyrics");
      } catch (error) {
        setNote(error instanceof Error ? error.message : "That playlist did not start.");
      }
    },
    [roomId, inRoom, roomName, prime],
  );

  const openSheet = useCallback((song: SongToAdd | null) => {
    sheetOpener.current = document.activeElement as HTMLElement | null;
    setSheet({ song });
  }, []);

  // Back to the button that opened it, once the player is no longer inert.
  useEffect(() => {
    if (sheet) return;
    sheetOpener.current?.focus();
    sheetOpener.current = null;
  }, [sheet]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (sheet) setSheet(null);
        else closeMusicPlayer();
      } else if (event.key === " " && !sheet && !isTyping(event.target)) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, sheet]);

  const seekFromBar = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!controls || !durationMs) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * durationMs);
  };
  const seekByKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!controls) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      seek(positionMs + (event.key === "ArrowRight" ? 5000 : -5000));
    }
  };

  const art = track?.thumbnail ? proxiedImage(track.thumbnail) : null;
  const progress = durationMs ? Math.min(1, positionMs / durationMs) : 0;
  const loop = state?.loop ?? "off";

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="music-player"
      role="dialog"
      aria-modal="true"
      aria-label="Music player"
      style={art ? ({ "--mp-art": `url("${art}")` } as CSSProperties) : undefined}
    >
      <div className="mp-backdrop" aria-hidden="true" />
      <header className="mp-top" inert={sheet !== null}>
        <button
          type="button"
          className="mp-icon-btn"
          onClick={closeMusicPlayer}
          aria-label="Close the player"
          title="Close (Esc)"
        >
          <ChevronDown size={22} />
        </button>
        <div className="mp-where">
          <small>{track ? (paused ? "Paused in" : "Playing in") : "Music in"}</small>
          <strong>{roomId ? roomName : "No voice room"}</strong>
        </div>
        <nav className="mp-tabs" role="tablist" aria-label="Player views">
          {TABS.filter((item) => musicBot || item.id === "queue").map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`mp-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`mp-pane-${item.id}`}
              className={`mp-tab ${tab === item.id ? "active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.id === "queue" && state?.queue.length ? (
                <em className="mp-count">{state.queue.length}</em>
              ) : null}
            </button>
          ))}
        </nav>
      </header>

      <div className="mp-body" inert={sheet !== null}>
        <section className="mp-now" aria-label="Now playing">
          <div className="mp-art">
            {art ? <img src={art} alt="" /> : <Music2 size={56} aria-hidden="true" />}
          </div>
          <div className="mp-meta">
            <h2 title={track?.title}>{track?.title ?? "Nothing is playing"}</h2>
            <p>
              {track
                ? track.artist || "Unknown artist"
                : roomId
                  ? `Search for a song or pick a playlist to start ${roomName}.`
                  : "Join a voice room to play music."}
            </p>
            {track?.requestedBy && (
              <small>
                Added by {track.requestedBy}
                {track.playlist?.name ? ` · from ${track.playlist.name}` : ""}
              </small>
            )}
            {track && musicBot && (
              <button
                type="button"
                className="mp-button ghost small mp-add-song"
                onClick={() => openSheet({ title: track.title, query: songQuery(track) })}
              >
                <CirclePlus size={14} /> Add to playlist
              </button>
            )}
          </div>

          {track && (
            <div className="mp-progress-wrap">
              <div
                className={`mp-progress ${controls ? "seekable" : ""}`}
                onClick={seekFromBar}
                onKeyDown={seekByKey}
                role="slider"
                tabIndex={controls ? 0 : -1}
                aria-label="Song position"
                aria-valuemin={0}
                aria-valuemax={Math.round(durationMs / 1000) || undefined}
                aria-valuenow={Math.round(positionMs / 1000)}
                aria-valuetext={`${clock(positionMs / 1000)} of ${clock(track.duration)}`}
              >
                <div className="mp-progress-fill" style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="mp-times">
                <span>{clock(positionMs / 1000)}</span>
                <span>{clock(track.duration)}</span>
              </div>
            </div>
          )}

          <div className="mp-controls">
            <button
              type="button"
              className={`mp-icon-btn ${loop !== "off" ? "on" : ""}`}
              onClick={() => void run(`/loop ${LOOP_NEXT[loop]}`)}
              disabled={!controls || busy}
              aria-label={LOOP_LABEL[loop]}
              title={LOOP_LABEL[loop]}
            >
              {loop === "track" ? <Repeat1 size={19} /> : <Repeat size={19} />}
            </button>
            <button
              type="button"
              className="mp-icon-btn"
              onClick={() => void run("/replay")}
              disabled={!controls || busy}
              aria-label="Start the song again"
              title="Start the song again"
            >
              <RotateCcw size={19} />
            </button>
            <button
              type="button"
              className="mp-play"
              onClick={toggle}
              disabled={!controls || busy}
              aria-label={paused ? "Play" : "Pause"}
              title={paused ? "Play (Space)" : "Pause (Space)"}
            >
              {paused ? <Play size={26} /> : <Pause size={26} />}
            </button>
            <button
              type="button"
              className="mp-icon-btn"
              onClick={() => void run("/skip")}
              disabled={!controls || busy}
              aria-label="Skip"
              title="Skip"
            >
              <SkipForward size={19} />
            </button>
            <button
              type="button"
              className="mp-icon-btn"
              onClick={() => void run("/shuffle", true)}
              disabled={!inRoom || busy || !state?.queue.length}
              aria-label="Shuffle what is up next"
              title="Shuffle what is up next"
            >
              <Shuffle size={19} />
            </button>
          </div>

          {inRoom && onVolume && (
            <label className="mp-volume" title="Your volume: only you hear this change">
              <Volume2 size={16} aria-hidden="true" />
              <input
                type="range"
                min={0}
                max={100}
                value={volume ?? 100}
                aria-label="Your volume"
                onChange={(event) => onVolume(Number(event.target.value))}
              />
            </label>
          )}
          {!inRoom && roomId && (
            <button type="button" className="mp-join" onClick={() => joinVoice(roomId)}>
              Join {roomName} to listen and control
            </button>
          )}
        </section>

        <section className="mp-pane" aria-label="Player views">
          <div role="tabpanel" id="mp-pane-lyrics" aria-labelledby="mp-tab-lyrics" hidden={tab !== "lyrics"} className="mp-pane-inner">
            <LyricsPane
              roomId={roomId}
              track={track}
              seed={view.seed}
              positionMs={positionMs}
              playing={!paused}
              canSeek={controls}
              onSeek={seek}
              active={tab === "lyrics"}
              pickRequest={view.fix ? view : null}
              onNote={setNote}
            />
          </div>
          <div role="tabpanel" id="mp-pane-queue" aria-labelledby="mp-tab-queue" hidden={tab !== "queue"} className="mp-pane-inner">
            <QueuePane state={state} inRoom={inRoom} run={run} onSearch={() => setTab("search")} />
          </div>
          <div role="tabpanel" id="mp-pane-search" aria-labelledby="mp-tab-search" hidden={tab !== "search"} className="mp-pane-inner">
            <SearchPane
              active={tab === "search"}
              inRoom={inRoom}
              playing={Boolean(track)}
              run={run}
              onAddToPlaylist={openSheet}
            />
          </div>
          <div role="tabpanel" id="mp-pane-playlists" aria-labelledby="mp-tab-playlists" hidden={tab !== "playlists"} className="mp-pane-inner">
            <PlaylistsPane
              roomId={roomId}
              inRoom={inRoom}
              lists={playlists.lists}
              error={playlists.error}
              onRetry={playlists.load}
              open={openList}
              onOpen={setOpenList}
              onPlay={playPlaylist}
              onNew={() => openSheet(null)}
              onFindSongs={() => setTab("search")}
            />
          </div>
          <div role="tabpanel" id="mp-pane-dj" aria-labelledby="mp-tab-dj" hidden={tab !== "dj"} className="mp-pane-inner">
            <DjPane
              roomId={roomId}
              inRoom={inRoom}
              active={tab === "dj"}
              command={command}
              onNote={setNote}
              prime={prime}
            />
          </div>
        </section>
      </div>

      {sheet && roomId && (
        <PlaylistSheet
          roomId={roomId}
          song={sheet.song}
          lists={playlists.lists}
          error={playlists.error}
          onRetry={playlists.load}
          onLists={playlists.setLists}
          onClose={() => setSheet(null)}
          onDone={(message, created) => {
            setSheet(null);
            setNote(message);
            if (created && !sheet.song) {
              setOpenList(created);
              setTab("playlists");
            }
          }}
        />
      )}

      {note && (
        <div className="mp-note" role="status">
          {note}
        </div>
      )}
    </div>
  );
}

/* ---------- Lyrics ---------- */

/** "Word by word…": timed versions of the playing song whose words fit its lyrics, to borrow from. */
function WordsBorrow({
  roomId,
  trackId,
  onClose,
  onBorrowed,
}: {
  roomId: string;
  trackId: string;
  onClose: () => void;
  onBorrowed: (title: string) => void;
}) {
  const [donors, setDonors] = useState<WordsDonor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiFetch<{ donors?: WordsDonor[] }>("/api/music/lyrics/words", {
      method: "POST",
      body: JSON.stringify({ voiceChannelId: roomId, trackId, action: "donors" }),
    })
      .then((body) => live && setDonors(body.donors || []))
      .catch((problem) => live && setError(problem instanceof Error ? problem.message : "Could not look."));
    return () => {
      live = false;
    };
  }, [roomId, trackId]);

  const pick = async (donor: WordsDonor) => {
    setBusy(donor.id);
    setError(null);
    try {
      await apiFetch("/api/music/lyrics/words", {
        method: "POST",
        body: JSON.stringify({ voiceChannelId: roomId, trackId, action: "borrow", from: donor.id }),
      });
      onBorrowed(donor.title);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not use that one.");
      setBusy(null);
    }
  };

  return (
    <div className="mp-list-wrap">
      <div className="mp-picker-head">
        <button type="button" className="mp-link" onClick={onClose}>
          <ArrowLeft size={14} /> Back to the lyrics
        </button>
        <h3>Word by word from another version</h3>
        <p className="mp-lyrics-note">
          These versions of the song have every word timed. Pick one: its timing is used for this song, starting where
          the lyrics put each line. If it's off, line it up with the timing buttons and save it.
        </p>
      </div>
      {error && <p className="mp-error">{error}</p>}
      {!donors && !error && (
        <Empty icon={<LoaderCircle size={28} className="mp-spin" />} title="Looking for timed versions…" />
      )}
      {donors && !donors.length && (
        <Empty
          icon={<MicVocal size={28} />}
          title="No timed version yet"
          text="None of the songs timed so far has these words. More get timed every hour; try again later."
        />
      )}
      {donors && donors.length > 0 && (
        <ol className="mp-list">
          {donors.map((donor) => (
            <li key={donor.id} className="mp-row">
              <div className="mp-row-main static">
                <span className="mp-row-text">
                  <strong>{donor.title}</strong>
                  <small>{Math.round(donor.match * 100)}% of the words match</small>
                </span>
                <span className="mp-row-time">{donor.duration ? clock(donor.duration) : ""}</span>
              </div>
              <span className="mp-row-actions">
                <button
                  type="button"
                  className="mp-button small"
                  disabled={busy !== null}
                  onClick={() => void pick(donor)}
                >
                  {busy === donor.id ? <LoaderCircle size={14} className="mp-spin" /> : null} Use this
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * How far through a word the singer is, 0 to 1, at `ms` from the word's start: by the time each letter
 * ends (`letters`, from Oracle's alignment) when there are some, so a held vowel holds the fill there
 * instead of moving on evenly, else evenly over the word.
 */
function wordFill(word: TimedWord, ms: number): number {
  const [start, end, , letters] = word;
  if (start === null || end === null) return ms >= 0 ? 1 : 0;
  if (ms <= 0) return 0;
  const length = Math.max(1, (end - start) * 1000);
  if (ms >= length) return 1;
  if (!letters.length) return ms / length;
  let done = 0;
  while (done < letters.length && letters[done] <= ms) done += 1;
  if (done >= letters.length) return 1;
  const from = done ? letters[done - 1] : 0;
  const to = Math.max(from + 1, letters[done]);
  return (done + (ms - from) / (to - from)) / letters.length;
}

/**
 * The line being sung, word by word: sung words light up, and the word being sung fills from left to
 * right as it is sung (like Apple Music). The room's position arrives four times a second, so this
 * runs its own clock from it between updates and paints straight onto the words (a CSS variable per
 * word), without rendering React on every frame.
 */
function SungLine({
  words,
  positionMs,
  offset,
  playing,
}: {
  words: TimedWord[];
  positionMs: number;
  offset: number;
  playing: boolean;
}) {
  const refs = useRef<Array<HTMLSpanElement | null>>([]);
  const anchor = useRef({ position: positionMs, at: 0 });

  useEffect(() => {
    anchor.current = { position: positionMs, at: performance.now() };
  }, [positionMs]);

  useEffect(() => {
    let frame = 0;
    const paint = () => {
      const { position, at } = anchor.current;
      // Never run more than a second past the last update (a stalled room should not race ahead).
      const ahead = playing ? Math.min(1000, performance.now() - at) : 0;
      const seconds = (position + ahead) / 1000 + offset;
      words.forEach((word, index) => {
        const element = refs.current[index];
        if (!element) return;
        const fill = word[0] === null ? (index === 0 ? 1 : 0) : wordFill(word, (seconds - word[0]) * 1000);
        const value = fill.toFixed(3);
        if (element.style.getPropertyValue("--fill") !== value) element.style.setProperty("--fill", value);
        element.classList.toggle("sung", fill > 0);
      });
      if (playing) frame = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [words, offset, playing, positionMs]);

  return (
    <span className="mp-words" aria-hidden="true">
      {words.map((word, index) => (
        <span key={index}>
          <span
            className="mp-word"
            ref={(element) => {
              refs.current[index] = element;
            }}
          >
            {word[2]}
          </span>
          {index < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}

interface LyricsData {
  trackId: string;
  /** `words`: when each word of the line is sung, for songs Oracle has timed (see SungLine). */
  lines: Array<{ at: number; line: string; words?: TimedWord[] }>;
  plain: string;
  source: string | null;
  sourceUrl: string | null;
  versionLength: number | null;
  loose: boolean;
  /** A full search ran for this song ("Search for lyrics"). */
  checked: boolean;
  /** Someone in this server picked these by hand ("Wrong lyrics?"). */
  picked: boolean;
  /** The word timing is another upload's (lined up automatically, or borrowed by hand). */
  wordsFrom: WordsFrom | null;
}

interface LyricsResponse {
  trackId: string | null;
  lines?: Array<[number, string]>;
  lyrics?: string | null;
  loose?: boolean;
  source?: string | null;
  sourceUrl?: string | null;
  versionLength?: number | null;
  musixmatchChecked?: boolean;
  picked?: boolean;
  /** lrclib did not answer the search: nothing was looked up. */
  unavailable?: boolean;
  words?: TimedWord[][] | null;
  wordsFrom?: WordsFrom | null;
}

function lyricsData(body: LyricsResponse, trackId: string, checked: boolean): LyricsData {
  return {
    trackId,
    lines: (body.lines || []).map(([at, line], index) => {
      // Timed words also correct the line's own start: lrclib often times another version of the song.
      const words = body.words?.[index]?.length ? body.words[index] : undefined;
      const first = words?.find((word) => word[0] !== null)?.[0];
      return { at: typeof first === "number" ? first : at, line, words };
    }),
    plain: body.lyrics || "",
    source: body.source || null,
    sourceUrl: body.sourceUrl || null,
    versionLength: body.versionLength || null,
    loose: Boolean(body.loose),
    checked,
    picked: Boolean(body.picked),
    wordsFrom: body.wordsFrom ?? null,
  };
}

function LyricsPane({
  roomId,
  track,
  seed,
  positionMs,
  playing,
  canSeek,
  onSeek,
  active,
  pickRequest,
  onNote,
}: {
  roomId: string | null;
  track: Track | null;
  seed: MusicPlayerSeed | null;
  positionMs: number;
  /** The song is moving (not paused): the sung line runs its own clock between updates. */
  playing: boolean;
  canSeek: boolean;
  onSeek: (ms: number) => void;
  active: boolean;
  /** Set when the player was opened to fix the lyrics: open the picker. */
  pickRequest: unknown;
  onNote: (text: string) => void;
}) {
  const trackId = track?.id ?? null;
  const [data, setData] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What "Try again" repeats: the saved-lyrics check, or the search.
  const [retrySearch, setRetrySearch] = useState(false);
  const [offset, setOffset] = useState(0);
  // "Wrong lyrics?": songs on lrclib with that name, to pick the right one.
  const [picking, setPicking] = useState(Boolean(pickRequest));
  // "Word by word…": borrow word timing from another version of the song.
  const [borrowing, setBorrowing] = useState(false);
  const [savingTiming, setSavingTiming] = useState(false);
  const ticket = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const handScrolledAt = useRef(0);
  // The chat card keeps the same timing correction under the same key.
  const storeKey = trackId ? `lyricsOffset:${trackId}` : null;

  const load = useCallback(
    async (find: boolean) => {
      if (!roomId || !trackId) return;
      const mine = ++ticket.current;
      if (find) setFinding(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ voiceChannelId: roomId });
        if (find) params.set("find", "1");
        const body = await apiFetch<LyricsResponse>(`/api/music/lyrics?${params}`);
        if (mine !== ticket.current || (body.trackId && body.trackId !== trackId)) return;
        if (body.unavailable) {
          setRetrySearch(find);
          setError("The lyrics site didn't answer just now. Try again in a moment.");
          return;
        }
        // A saved-lyrics read that finds nothing keeps the lines the chat card opened the player with.
        setData((old) =>
          !find && !body.lines?.length && old?.trackId === trackId && old.lines.length
            ? old
            : lyricsData(body, trackId, find),
        );
      } catch (problem) {
        if (mine === ticket.current) {
          setRetrySearch(find);
          setError(problem instanceof Error ? problem.message : "Could not load the lyrics.");
        }
      } finally {
        if (mine === ticket.current) {
          setLoading(false);
          setFinding(false);
        }
      }
    },
    [roomId, trackId],
  );

  useEffect(() => {
    setData((old) => (old?.trackId === trackId ? old : null));
    setError(null);
    if (!trackId) return;
    if (seed && seed.trackId === trackId && seed.lines.length) {
      setData({
        trackId,
        lines: seed.lines.map(({ at, line }) => ({ at, line })),
        plain: "",
        source: seed.source ?? null,
        sourceUrl: seed.sourceUrl ?? null,
        versionLength: seed.versionLength ?? null,
        loose: Boolean(seed.loose),
        checked: true,
        picked: false,
        wordsFrom: null,
      });
    }
    void load(false);
  }, [trackId, seed, load]);

  useEffect(() => {
    if (pickRequest) setPicking(true);
  }, [pickRequest]);

  useEffect(() => {
    if (!storeKey) return;
    try {
      const saved = Number(localStorage.getItem(storeKey));
      setOffset(Number.isFinite(saved) ? saved : 0);
    } catch {
      setOffset(0);
    }
  }, [storeKey]);

  const nudge = (delta: number) => {
    const next = delta === 0 ? 0 : Math.round((offset + delta) * 10) / 10;
    setOffset(next);
    try {
      if (!storeKey) return;
      if (next) localStorage.setItem(storeKey, String(next));
      else localStorage.removeItem(storeKey);
    } catch {
      /* private mode */
    }
  };

  const lines = data?.trackId === trackId ? data.lines : [];
  const timedWords = lines.some((line) => line.words?.length);

  const wordsCall = async (action: "shift" | "clear", delta?: number) =>
    apiFetch<{ error?: string }>("/api/music/lyrics/words", {
      method: "POST",
      body: JSON.stringify({ voiceChannelId: roomId, trackId, action, delta }),
    });

  // The timing someone lined up by ear becomes the words' own (for everyone), and the nudge goes back to 0.
  // The nudge shows lyrics `offset` s early, so the words move the other way.
  const saveTiming = async () => {
    if (!offset) return;
    setSavingTiming(true);
    try {
      await wordsCall("shift", -offset);
      nudge(0);
      onNote("Saved: everyone gets this timing for this song.");
      await load(false);
    } catch (problem) {
      onNote(problem instanceof Error ? problem.message : "Could not save the timing.");
    } finally {
      setSavingTiming(false);
    }
  };

  const stopBorrowing = async () => {
    try {
      await wordsCall("clear");
      nudge(0);
      onNote("Back to line-by-line lyrics for this song.");
      await load(false);
    } catch (problem) {
      onNote(problem instanceof Error ? problem.message : "Could not remove the word timing.");
    }
  };

  const seconds = positionMs / 1000 + offset;
  let activeIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].at <= seconds) activeIndex = index;
    else break;
  }

  // Keep the sung line in view, unless someone scrolled by hand just now.
  useEffect(() => {
    const list = listRef.current;
    if (!active || !list || activeIndex < 0) return;
    if (Date.now() - handScrolledAt.current < 4000) return;
    const line = list.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`);
    if (!line) return;
    const top = Math.max(0, line.offsetTop - list.clientHeight * 0.38);
    try {
      list.scrollTo({ top, behavior: "smooth" });
    } catch {
      list.scrollTop = top;
    }
  }, [activeIndex, active, lines.length]);

  const handScroll = () => {
    handScrolledAt.current = Date.now();
  };

  if (!track) {
    return (
      <Empty
        icon={<MicVocal size={28} />}
        title="Lyrics show up here"
        text="Play a song and its words can scroll along with it. Click a line to jump there."
      />
    );
  }

  if (picking && trackId && roomId) {
    return (
      <LyricsPicker
        roomId={roomId}
        trackId={trackId}
        duration={track.duration}
        picked={Boolean(data?.picked)}
        onClose={() => setPicking(false)}
        onPicked={(body) => {
          ticket.current += 1;
          setData(lyricsData(body, trackId, true));
          setPicking(false);
          onNote("Saved: these lyrics show for this song in this server from now on.");
        }}
        onCleared={() => {
          setPicking(false);
          onNote("Back to the automatic lyrics for this song.");
          void load(false);
        }}
      />
    );
  }

  if (borrowing && trackId && roomId) {
    return (
      <WordsBorrow
        roomId={roomId}
        trackId={trackId}
        onClose={() => setBorrowing(false)}
        onBorrowed={(title) => {
          setBorrowing(false);
          onNote(`Word timing from ${title}. If it's off, line it up with the timing buttons, then Save this timing.`);
          void load(false);
        }}
      />
    );
  }

  const pickButton = (label: string) => (
    <button type="button" className="mp-link" onClick={() => setPicking(true)}>
      {label}
    </button>
  );

  // Opening a song shows only lyrics already saved; looking them up (lrclib,
  // then Musixmatch, like /lyricsnow) waits for someone to ask.
  const findButton = data && !data.checked && !lines.length && (
    <button type="button" className="mp-button" onClick={() => void load(true)} disabled={finding}>
      {finding ? <LoaderCircle size={16} className="mp-spin" /> : <Search size={16} />}
      {finding ? "Searching…" : data.plain ? "Search for synced lyrics" : "Search for lyrics"}
    </button>
  );

  if (!lines.length) {
    if (finding) {
      return (
        <Empty icon={<LoaderCircle size={28} className="mp-spin" />} title="Searching for lyrics…" text="This takes a few seconds." />
      );
    }
    if (loading || (!data && !error)) {
      return (
        <Empty icon={<LoaderCircle size={28} className="mp-spin" />} title="Checking for saved lyrics…" />
      );
    }
    if (error) {
      return (
        <Empty icon={<MicVocal size={28} />} title="No lyrics right now" text={error}>
          <button type="button" className="mp-button" onClick={() => void load(retrySearch)}>Try again</button>
        </Empty>
      );
    }
    if (data?.plain) {
      return (
        <div className="mp-lyrics plain">
          <p className="mp-lyrics-note">
            {data.checked ? "Only unsynced lyrics exist for this song." : "These lyrics are not synced to the song."}
            {findButton}
            {pickButton("Wrong song?")}
          </p>
          <div className="mp-plain">{data.plain}</div>
          <p className="mp-source">
            Lyrics from{" "}
            <a href={lyricsSource(data.source, data.sourceUrl).url} target="_blank" rel="noreferrer">
              {lyricsSource(data.source, data.sourceUrl).label}
            </a>
          </p>
        </div>
      );
    }
    return (
      <Empty
        icon={<MicVocal size={28} />}
        title={data?.checked ? "No lyrics found for this song" : "Want the lyrics?"}
        text={
          data?.checked
            ? "Nobody has synced this one yet. Another version of the song might have them."
            : "They aren't saved for this song yet. Search for them and they scroll along with the song."
        }
      >
        {findButton}
        {pickButton(data?.checked ? "Search by hand" : "Or pick them by hand")}
      </Empty>
    );
  }

  return (
    <div className="mp-lyrics-wrap">
      {(data?.loose || data?.versionLength) && (
        <p className="mp-lyrics-note">
          {data.loose
            ? "Matched by song name only. Is this the right song?"
            : `These lyrics follow a ${clock(data.versionLength)} version of the song, so the timing may drift. Nudge it below.`}
          {pickButton(data.loose ? "Pick the right one" : "Pick another version")}
        </p>
      )}
      <div
        className={`mp-lyrics ${canSeek ? "seekable" : ""}`}
        ref={listRef}
        onWheel={handScroll}
        onTouchMove={handScroll}
        onKeyDown={handScroll}
      >
        {lines.map((item, index) => {
          const when = index === activeIndex ? "now" : index < activeIndex ? "past" : "next";
          const sung =
            when === "now" && item.words?.length ? (
              <SungLine words={item.words} positionMs={positionMs} offset={offset} playing={playing && active} />
            ) : (
              item.line
            );
          return canSeek ? (
            <button
              key={`${item.at}-${index}`}
              type="button"
              data-line={index}
              className={`mp-line ${when}`}
              aria-current={when === "now" ? "true" : undefined}
              aria-label={item.line}
              onClick={() => onSeek((item.at - offset) * 1000)}
              title={`Play from ${clock(item.at)}`}
            >
              {sung}
            </button>
          ) : (
            <p key={`${item.at}-${index}`} data-line={index} className={`mp-line ${when}`}>
              {sung}
            </p>
          );
        })}
      </div>
      {data?.wordsFrom && (
        <p className="mp-lyrics-note">
          {data.wordsFrom.borrowed
            ? `Word timing borrowed from ${data.wordsFrom.title || "another version"}.`
            : `Word timing from another upload of this recording${data.wordsFrom.title ? ` (${data.wordsFrom.title})` : ""}.`}
          {offset !== 0 && (
            <button type="button" className="mp-link" disabled={savingTiming} onClick={() => void saveTiming()}>
              {savingTiming ? "Saving…" : "Save this timing for everyone"}
            </button>
          )}
          <button type="button" className="mp-link" onClick={() => void stopBorrowing()}>
            Remove word timing
          </button>
        </p>
      )}
      <div className="mp-lyrics-bar" aria-label="Lyrics timing">
        <button type="button" onClick={() => nudge(-0.5)} title="Show the lyrics half a second later">
          −0.5s
        </button>
        {timedWords && (
          <button type="button" onClick={() => nudge(-0.1)} title="Show the lyrics a tenth of a second later">
            −0.1s
          </button>
        )}
        <span>{offset ? `${offset > 0 ? "+" : ""}${offset}s` : "In sync"}</span>
        {timedWords && (
          <button type="button" onClick={() => nudge(0.1)} title="Show the lyrics a tenth of a second earlier">
            +0.1s
          </button>
        )}
        <button type="button" onClick={() => nudge(0.5)} title="Show the lyrics half a second earlier">
          +0.5s
        </button>
        {offset !== 0 && (
          <button type="button" onClick={() => nudge(0)}>
            Reset
          </button>
        )}
        {!timedWords && trackId && roomId && (
          <button
            type="button"
            onClick={() => setBorrowing(true)}
            title="Use word-by-word timing from another version of this song"
          >
            Word by word…
          </button>
        )}
        <button type="button" onClick={() => setPicking(true)} title="Pick the right lyrics from songs with this name">
          Wrong lyrics?
        </button>
        <small>
          {canSeek ? "Click a line to jump there" : "Join the room to jump around"}
          {" · Lyrics from "}
          <a href={lyricsSource(data?.source, data?.sourceUrl).url} target="_blank" rel="noreferrer">
            {lyricsSource(data?.source, data?.sourceUrl).label}
          </a>
        </small>
      </div>
    </div>
  );
}

/* ---------- Up next ---------- */

function QueuePane({
  state,
  inRoom,
  run,
  onSearch,
}: {
  state: PlayerState | null;
  inRoom: boolean;
  run: (command: string, announce?: boolean) => Promise<boolean>;
  onSearch: () => void;
}) {
  const queue = state?.queue ?? [];
  if (!queue.length) {
    return (
      <Empty icon={<ListMusic size={28} />} title="Nothing up next" text="Songs you add play after this one.">
        <button type="button" className="mp-button" onClick={onSearch}>
          <Search size={16} /> Find a song
        </button>
      </Empty>
    );
  }
  const total = queue.reduce((sum, item) => sum + (item.duration || 0), 0);
  return (
    <div className="mp-list-wrap">
      <header className="mp-list-head">
        <strong>Up next</strong>
        <span>
          {queue.length} {queue.length === 1 ? "song" : "songs"}
          {total ? ` · ${clock(total)}` : ""}
        </span>
      </header>
      <ol className="mp-list">
        {queue.map((item, index) => (
          <li key={item.id} className="mp-row">
            <button
              type="button"
              className="mp-row-main"
              disabled={!inRoom}
              onClick={() => void run(`/skipto ${index + 1}`)}
              title={inRoom ? "Play this now" : undefined}
            >
              <span className="mp-row-index">{index + 1}</span>
              <Thumb src={item.thumbnail} />
              <span className="mp-row-text">
                <strong>{item.title}</strong>
                <small>{item.artist || `Added by ${item.requestedBy}`}</small>
              </span>
              <span className="mp-row-time">{item.duration ? clock(item.duration) : ""}</span>
            </button>
            {inRoom && (
              <button
                type="button"
                className="mp-icon-btn small"
                onClick={() => void run(`/remove ${index + 1}`)}
                aria-label={`Remove ${item.title} from the queue`}
                title="Remove from the queue"
              >
                <X size={15} />
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- Search ---------- */

interface SongResult {
  title: string;
  artist: string;
  duration: number | null;
  thumbnail: string | null;
  url: string;
  /** Its lyrics light up word by word. */
  words?: boolean;
}

function SearchPane({
  active,
  inRoom,
  playing,
  run,
  onAddToPlaylist,
}: {
  active: boolean;
  inRoom: boolean;
  playing: boolean;
  run: (command: string, announce?: boolean) => Promise<boolean>;
  onAddToPlaylist: (song: SongToAdd) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongResult[] | null>(null);
  const [searched, setSearched] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, "next" | "queue">>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text || searching) return;
    setSearching(true);
    setError(null);
    try {
      const data = await apiFetch<{ results?: SongResult[] }>(
        `/api/music/search?${new URLSearchParams({ q: text })}`,
      );
      setResults(data.results || []);
      setSearched(text);
      setAdded({});
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const add = async (result: SongResult, how: "next" | "queue") => {
    const command = how === "next" && playing ? "/playnext" : "/play";
    if (await run(`${command} ${result.url}`, true)) {
      setAdded((old) => ({ ...old, [result.url]: how }));
    }
  };

  return (
    <div className="mp-list-wrap">
      <form className="mp-search" onSubmit={(event) => void submit(event)} role="search">
        <Search size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Songs, artists, or a YouTube / Spotify link"
          aria-label="Search for music"
          maxLength={200}
        />
        <button type="submit" className="mp-button" disabled={!query.trim() || searching}>
          {searching ? <LoaderCircle size={16} className="mp-spin" /> : "Search"}
        </button>
      </form>
      {!inRoom && <p className="mp-lyrics-note">Join the voice room to play songs, or press + to save one to a playlist.</p>}
      {error && <p className="mp-error">{error}</p>}
      {results && !results.length && !error && (
        <Empty icon={<Search size={28} />} title={`Nothing found for “${searched}”`} text="Try other words, or paste a link." />
      )}
      {results && results.length > 0 && (
        <ol className="mp-list">
          {results.map((result) => (
            <li key={result.url} className="mp-row">
              <div className="mp-row-main static">
                <Thumb src={result.thumbnail} />
                <span className="mp-row-text">
                  <strong>
                    {result.title}
                    {result.words && (
                      <span
                        className="mp-words-mark"
                        role="img"
                        aria-label="Lyrics light up word by word"
                        title="Lyrics light up word by word"
                      >
                        <MicVocal size={13} aria-hidden="true" />
                      </span>
                    )}
                  </strong>
                  <small>{result.artist}</small>
                </span>
                <span className="mp-row-time">{result.duration ? clock(result.duration) : ""}</span>
              </div>
              {added[result.url] ? (
                <span className="mp-added">{added[result.url] === "next" ? "Plays next" : "Added"}</span>
              ) : (
                <span className="mp-row-actions">
                  <button
                    type="button"
                    className="mp-button small"
                    disabled={!inRoom}
                    onClick={() => void add(result, "next")}
                    title={playing ? "Play this after the current song" : "Play this now"}
                  >
                    <Play size={14} /> {playing ? "Next" : "Play"}
                  </button>
                  {playing && (
                    <button
                      type="button"
                      className="mp-icon-btn small"
                      disabled={!inRoom}
                      onClick={() => void add(result, "queue")}
                      aria-label={`Add ${result.title} to the end of the queue`}
                      title="Add to the end of the queue"
                    >
                      <ListPlus size={16} />
                    </button>
                  )}
                </span>
              )}
              <button
                type="button"
                className="mp-icon-btn small"
                onClick={() => onAddToPlaylist({ title: result.title, query: result.url })}
                aria-label={`Add ${result.title} to a playlist`}
                title="Add to playlist"
              >
                <CirclePlus size={16} />
              </button>
            </li>
          ))}
        </ol>
      )}
      {!results && !error && (
        <Empty
          icon={<Search size={28} />}
          title="Find something to play"
          text="Search YouTube, or paste a YouTube or Spotify link (playlists too)."
        />
      )}
    </div>
  );
}

/* ---------- Playlists ---------- */

interface RoomPlaylist {
  name: string;
  count: number;
  cover: string | null;
  description: string | null;
  auto: boolean;
  /** You may add songs: you made it, or you are an admin. */
  canEdit: boolean;
  tracks: Array<{ title: string; duration: string | null; thumbnail: string | null }>;
}

/** The song "Add to playlist" is for, and what the bot finds it by. */
interface SongToAdd {
  title: string;
  query: string;
}

/** What the bot finds a track by: its YouTube or Spotify page, else its name. */
function songQuery(track: Track): string {
  return track.pageUrl && isSongLink(track.pageUrl) ? track.pageUrl : `${track.artist} ${track.title}`.trim();
}

/** The room's playlists, for the Playlists tab and "Add to playlist". */
function useRoomPlaylists(roomId: string | null) {
  const [lists, setLists] = useState<RoomPlaylist[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ playlists?: RoomPlaylist[] }>(
        `/api/music/playlists?${new URLSearchParams({ voiceChannelId: roomId })}`,
      );
      setLists(data.playlists || []);
      setLoadedFor(roomId);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not load the playlists.");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  // Fetched as soon as the player opens: the bot sometimes needs a few
  // seconds (it rebuilds the day's stem mixes), and by the time someone
  // opens this tab the list is usually here.
  useEffect(() => {
    if (roomId && loadedFor !== roomId && !loading && !error) void load();
  }, [roomId, loadedFor, loading, error, load]);

  return { lists: loadedFor === roomId ? lists : null, error, load, setLists };
}

function PlaylistsPane({
  roomId,
  inRoom,
  lists,
  error,
  onRetry,
  open,
  onOpen,
  onPlay,
  onNew,
  onFindSongs,
}: {
  roomId: string | null;
  inRoom: boolean;
  lists: RoomPlaylist[] | null;
  error: string | null;
  onRetry: () => Promise<void>;
  open: string | null;
  onOpen: (name: string | null) => void;
  onPlay: (name: string, mode: "play" | "queue", start?: number, startTitle?: string) => Promise<void>;
  onNew: () => void;
  onFindSongs: () => void;
}) {
  if (!roomId) {
    return <Empty icon={<Library size={28} />} title="No voice room" text="Playlists belong to a voice room." />;
  }
  if (error) {
    return (
      <Empty icon={<Library size={28} />} title="Could not load the playlists" text={error}>
        <button type="button" className="mp-button" onClick={() => void onRetry()}>Try again</button>
      </Empty>
    );
  }
  if (!lists) {
    return <Empty icon={<LoaderCircle size={28} className="mp-spin" />} title="Loading playlists…" />;
  }
  if (!lists.length) {
    return (
      <Empty
        icon={<Library size={28} />}
        title="No playlists yet"
        text="Make the first one, then add songs to it."
      >
        <button type="button" className="mp-button" onClick={onNew}>
          <Plus size={16} /> New playlist
        </button>
      </Empty>
    );
  }

  const chosen = open ? lists.find((list) => list.name === open) : null;
  if (chosen) {
    return (
      <div className="mp-list-wrap">
        <header className="mp-playlist-head">
          <button type="button" className="mp-icon-btn" onClick={() => onOpen(null)} aria-label="All playlists" title="All playlists">
            <ArrowLeft size={18} />
          </button>
          <Thumb src={chosen.cover} />
          <div className="mp-row-text">
            <strong>{chosen.name}</strong>
            <small>
              {chosen.count} {chosen.count === 1 ? "song" : "songs"}
              {chosen.description ? ` · ${chosen.description}` : ""}
            </small>
          </div>
          <span className="mp-row-actions">
            <button type="button" className="mp-button" disabled={!inRoom || !chosen.count} onClick={() => void onPlay(chosen.name, "play")}>
              <Play size={15} /> Play
            </button>
            <button
              type="button"
              className="mp-icon-btn"
              disabled={!inRoom || !chosen.count}
              onClick={() => void onPlay(chosen.name, "queue")}
              aria-label={`Add ${chosen.name} to the queue`}
              title="Add to the queue"
            >
              <ListPlus size={18} />
            </button>
            {chosen.canEdit && (
              <button type="button" className="mp-icon-btn" onClick={onFindSongs} aria-label="Find songs to add" title="Find songs to add">
                <Search size={18} />
              </button>
            )}
          </span>
        </header>
        {!inRoom && <p className="mp-lyrics-note">Join the voice room to play a playlist.</p>}
        {!chosen.count && (
          <Empty
            icon={<Music2 size={28} />}
            title="Nothing in here yet"
            text={chosen.canEdit ? "Search for a song, then press + to add it here." : undefined}
          >
            {chosen.canEdit && (
              <button type="button" className="mp-button" onClick={onFindSongs}>
                <Search size={16} /> Find songs
              </button>
            )}
          </Empty>
        )}
        <ol className="mp-list">
          {chosen.tracks.map((item, index) => (
            <li key={`${item.title}-${index}`} className="mp-row">
              <button
                type="button"
                className="mp-row-main"
                disabled={!inRoom}
                onClick={() => void onPlay(chosen.name, "play", index, item.title)}
                title={inRoom ? "Play the playlist from this song" : undefined}
              >
                <span className="mp-row-index">{index + 1}</span>
                <Thumb src={item.thumbnail} />
                <span className="mp-row-text">
                  <strong>{item.title}</strong>
                </span>
                <span className="mp-row-time">{item.duration || ""}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="mp-list-wrap">
      <header className="mp-list-head">
        <strong>Playlists</strong>
        <button type="button" className="mp-button small" onClick={onNew}>
          <Plus size={14} /> New playlist
        </button>
      </header>
      <div className="mp-grid">
        {lists.map((list) => (
          <button key={list.name} type="button" className="mp-card" onClick={() => onOpen(list.name)}>
            <span className="mp-card-art">
              {list.cover ? <img src={proxiedImage(list.cover)} alt="" loading="lazy" /> : <Music2 size={28} aria-hidden="true" />}
            </span>
            <strong>{list.name}</strong>
            <small>
              {list.count} {list.count === 1 ? "song" : "songs"}
              {list.auto ? " · made for you" : ""}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * "Add to playlist" and "New playlist". It covers the player rather than
 * dropping out of a row, because the rows scroll and would clip it.
 */
function PlaylistSheet({
  roomId,
  song,
  lists,
  error,
  onRetry,
  onLists,
  onClose,
  onDone,
}: {
  roomId: string;
  /** Null when this only makes a playlist. */
  song: SongToAdd | null;
  lists: RoomPlaylist[] | null;
  error: string | null;
  onRetry: () => Promise<void>;
  onLists: (lists: RoomPlaylist[]) => void;
  onClose: () => void;
  onDone: (message: string, created: string | null) => void;
}) {
  const [name, setName] = useState("");
  /** The playlist being added to, or "" while making a new one. */
  const [saving, setSaving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const mine = lists?.filter((list) => list.canEdit) ?? [];

  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  const send = async (change: { action: "create" | "add_song"; name: string; query?: string }) => {
    const data = await apiFetch<{ message?: string; name?: string; playlists?: RoomPlaylist[] }>("/api/music/playlists", {
      method: "POST",
      body: JSON.stringify({ voiceChannelId: roomId, ...change }),
    });
    if (data.playlists) onLists(data.playlists);
    return data;
  };

  const save = async (label: string, work: () => Promise<{ message: string; created: string | null }>) => {
    if (saving !== null) return;
    setSaving(label);
    setProblem(null);
    try {
      const { message, created } = await work();
      onDone(message, created);
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : "That did not work.");
      setSaving(null);
    }
  };

  const addTo = (list: string) =>
    save(list, async () => {
      const data = await send({ action: "add_song", name: list, query: song?.query });
      return { message: data.message || `Added to ${list}.`, created: null };
    });

  const create = (event: FormEvent) => {
    event.preventDefault();
    const wanted = name.trim();
    if (!wanted) return;
    void save("", async () => {
      // The list stays if the song then fails: it shows up above, to try again.
      const made = await send({ action: "create", name: wanted });
      const created = made.name || wanted;
      setName("");
      if (!song) return { message: made.message || `Created ${created}.`, created };
      const added = await send({ action: "add_song", name: created, query: song.query });
      return { message: added.message || `Added to ${created}.`, created };
    });
  };

  return (
    <div
      className="mp-sheet-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={sheetRef}
        className="mp-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={song ? `Add ${song.title} to a playlist` : "New playlist"}
        tabIndex={-1}
      >
        <header className="mp-sheet-head">
          <span className="mp-row-text">
            <strong>{song ? "Add to playlist" : "New playlist"}</strong>
            {song && <small>{song.title}</small>}
          </span>
          <button type="button" className="mp-icon-btn small" onClick={onClose} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </header>
        {song && error && (
          <p className="mp-error">
            {error}{" "}
            <button type="button" className="mp-button ghost small" onClick={() => void onRetry()}>Try again</button>
          </p>
        )}
        {song && !error && !lists && <p className="mp-sheet-note">Loading playlists…</p>}
        {song && lists && !mine.length && (
          <p className="mp-sheet-note">You can add songs to playlists you made. Make one here.</p>
        )}
        {song && mine.length > 0 && (
          <ul className="mp-list mp-sheet-list">
            {mine.map((list) => (
              <li key={list.name} className="mp-row">
                <button type="button" className="mp-row-main" disabled={saving !== null} onClick={() => void addTo(list.name)}>
                  <Thumb src={list.cover} />
                  <span className="mp-row-text">
                    <strong>{list.name}</strong>
                    <small>{list.count} {list.count === 1 ? "song" : "songs"}</small>
                  </span>
                  {saving === list.name && <LoaderCircle size={16} className="mp-spin" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="mp-search" onSubmit={create}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={mine.length && song ? "Or a new playlist" : "Playlist name"}
            aria-label="New playlist name"
            maxLength={50}
          />
          <button type="submit" className="mp-button" disabled={!name.trim() || saving !== null}>
            {saving === "" ? <LoaderCircle size={16} className="mp-spin" /> : "Create"}
          </button>
        </form>
        {problem && <p className="mp-error">{problem}</p>}
      </section>
    </div>
  );
}

/* ---------- DJ ---------- */

interface DjDeck {
  name: string;
  loaded: boolean;
  loading: string | null;
  title: string | null;
  artist: string | null;
  thumbnail: string | null;
  playing: boolean;
  bpm: number | null;
  key: string | null;
}

/** The booth as /api/music/club answers (the club panel's slim state). */
interface DjState {
  active: boolean;
  paused: boolean;
  decks: Record<string, DjDeck>;
  master: string | null;
  mix: { label: string; progress: number; started: boolean } | null;
  auto: { on: boolean; mode: "real" | "auto"; vibe: string; autoplay: boolean };
  crate: Array<{ title: string; artist: string }>;
  notice: string | null;
}

interface RoomSettings {
  autoplay?: boolean;
  automix?: boolean;
  radio?: string | null;
  radio_stations?: Array<{ id: string; label: string; emoji: string; songs: number }>;
}

const DJ_MODES: Array<{ id: "real" | "auto"; label: string; hint: string }> = [
  { id: "real", label: "Real DJ", hint: "Picks the order and remixes as it goes" },
  { id: "auto", label: "Auto DJ", hint: "Mixes your queue in order" },
];
const VIBES = [
  { id: "chill", label: "Chill" },
  { id: "club", label: "Club" },
  { id: "hype", label: "Hype" },
];
const MIX_STYLES = [
  ["auto", "DJ's choice"],
  ["blend", "Blend"],
  ["fade", "Fade"],
  ["echo", "Echo out"],
  ["filter", "Filter sweep"],
  ["brake", "Brake"],
  ["spinback", "Spinback"],
  ["cut", "Cut"],
  ["drum_bridge", "Drum bridge"],
  ["mashup", "Mashup"],
] as const;
const MOVES = [
  ["drop", "Drop"],
  ["acapella", "Acapella"],
  ["beatbreak", "Beat break"],
  ["stutter", "Stutter"],
  ["echo", "Echo"],
] as const;

function Switch({ label, hint, on, disabled, onClick }: {
  label: string;
  hint: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`mp-switch ${on ? "on" : ""}`}
      aria-pressed={on}
      disabled={disabled}
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

/**
 * A simple DJ booth: start a set (Real DJ or Auto DJ, a vibe), then mix into
 * the next song with a chosen transition, fire a move, or end it. The full
 * booth (/dj) has the decks, mixer and FX; this is the everyday part, through
 * the same booth controls the club uses.
 */
function DjPane({
  roomId,
  inRoom,
  active,
  command,
  onNote,
  prime,
}: {
  roomId: string | null;
  inRoom: boolean;
  active: boolean;
  command: (text: string, options?: { announce?: boolean; read?: boolean }) => Promise<Record<string, any> | null>;
  onNote: (text: string) => void;
  prime?: () => void;
}) {
  const [dj, setDj] = useState<DjState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"real" | "auto">("real");
  const [vibe, setVibe] = useState("club");
  const [style, setStyle] = useState("auto");
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const askedSettings = useRef<string | null>(null);

  // While the tab is open, follow the booth: the decks and any mix under way.
  useEffect(() => {
    if (!active || !roomId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const next = await apiFetch<DjState>(`/api/music/club?${new URLSearchParams({ voiceChannelId: roomId })}`);
        if (!stopped) {
          setDj(next);
          setError(null);
        }
      } catch (problem) {
        if (!stopped) setError(problem instanceof Error ? problem.message : "The DJ booth did not answer.");
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, roomId]);

  useEffect(() => {
    if (!active || !roomId || askedSettings.current === roomId) return;
    askedSettings.current = roomId;
    void command("/settings", { read: true }).then((data) => {
      if (data?.state) setSettings(data.state as RoomSettings);
    });
  }, [active, roomId, command]);

  const booth = async (body: Record<string, unknown>) => {
    if (!roomId) return;
    if (!inRoom) {
      onNote("Join the room to DJ.");
      return;
    }
    if (body.op === "club") prime?.();
    setBusy(true);
    try {
      const next = await apiFetch<DjState>("/api/music/club", {
        method: "POST",
        body: JSON.stringify({ voiceChannelId: roomId, ...body }),
      });
      setDj(next);
      if (next.notice) onNote(next.notice);
    } catch (problem) {
      onNote(problem instanceof Error ? problem.message : "The DJ booth did not answer.");
    } finally {
      setBusy(false);
    }
  };

  const change = async (text: string) => {
    const data = await command(text);
    if (data?.state) setSettings(data.state as RoomSettings);
  };

  const openBooth = async () => {
    if (!roomId) return;
    try {
      const { url } = await apiFetch<{ url: string }>("/api/integrations/musicwatch/web-link", {
        method: "POST",
        body: JSON.stringify({ voiceChannelId: roomId, page: "dj" }),
      });
      openWebView({ url, title: "DJ booth" });
    } catch (problem) {
      onNote(problem instanceof Error ? problem.message : "The DJ booth did not open.");
    }
  };

  if (!roomId) {
    return <Empty icon={<Disc3 size={28} />} title="No voice room" text="The DJ plays in a voice room." />;
  }

  const onAir = Boolean(dj?.active);
  const decks = dj ? ["A", "B"].map((name) => dj.decks?.[name]).filter((deck): deck is DjDeck => Boolean(deck?.loaded || deck?.loading)) : [];
  const vibeLabel = VIBES.find((item) => item.id === dj?.auto.vibe)?.label ?? "Club";
  const locked = !inRoom || busy;

  return (
    <div className="mp-list-wrap mp-dj">
      {error && !dj && <p className="mp-error">{error}</p>}
      {!onAir ? (
        <section className="mp-dj-card">
          <header className="mp-dj-head">
            <span className="mp-empty-icon" aria-hidden="true"><Disc3 size={26} /></span>
            <div>
              <strong>DJ set</strong>
              <p>The bot mixes the room's music like a DJ: beat-matched transitions, remixes and drops, for everyone in the room.</p>
            </div>
          </header>
          <div className="mp-choice" role="radiogroup" aria-label="Who picks the songs">
            {DJ_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={mode === item.id}
                className={mode === item.id ? "on" : ""}
                onClick={() => setMode(item.id)}
              >
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>
          <div className="mp-chips" role="radiogroup" aria-label="Vibe">
            <span className="mp-chips-label">Vibe</span>
            {VIBES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={vibe === item.id}
                className={`mp-chip ${vibe === item.id ? "on" : ""}`}
                onClick={() => setVibe(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mp-dj-actions">
            <button type="button" className="mp-button" disabled={locked} onClick={() => void booth({ op: "club", mode, vibe })}>
              <Zap size={15} /> Start the set
            </button>
            <button type="button" className="mp-button ghost" onClick={() => void openBooth()}>
              <ExternalLink size={15} /> Full DJ booth
            </button>
          </div>
          <small className="mp-dj-hint">
            {inRoom
              ? "If the queue is short, the DJ adds songs that have stems so the set keeps going."
              : "Join the room to start a set."}
          </small>
        </section>
      ) : (
        <section className="mp-dj-card">
          <header className="mp-dj-head">
            <span className="mp-onair">On air</span>
            <div>
              <strong>{dj!.auto.on ? (dj!.auto.mode === "real" ? "Real DJ" : "Auto DJ") : "Hands on the decks"}</strong>
              <p>{vibeLabel} vibe{dj!.paused ? " · paused" : ""}</p>
            </div>
            <button type="button" className="mp-button danger small" disabled={locked} onClick={() => void booth({ op: "stop" })}>
              <CircleStop size={14} /> End the set
            </button>
          </header>
          <div className="mp-decks">
            {decks.map((deck) => (
              <div key={deck.name} className={`mp-deck ${dj!.master === deck.name ? "master" : ""}`}>
                <span className="mp-deck-name">{deck.name}</span>
                <Thumb src={deck.thumbnail} />
                <span className="mp-row-text">
                  <strong>{deck.title || deck.loading || "Loading…"}</strong>
                  <small>{[deck.artist, deck.bpm ? `${deck.bpm} BPM` : null, deck.key].filter(Boolean).join(" · ")}</small>
                </span>
                {deck.playing && <span className="mp-deck-live" title="Playing" aria-label="Playing" />}
              </div>
            ))}
          </div>
          {dj!.mix && (
            <div className="mp-mixing">
              <span>Mixing · {dj!.mix.label}</span>
              <div className="mp-progress">
                <div className="mp-progress-fill" style={{ width: `${Math.round(dj!.mix.progress * 100)}%` }} />
              </div>
            </div>
          )}
          <div className="mp-dj-row">
            <label className="mp-select">
              <span>Next transition</span>
              <select value={style} onChange={(event) => setStyle(event.target.value)}>
                {MIX_STYLES.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
            <button type="button" className="mp-button" disabled={locked} onClick={() => void booth({ op: "skip", style })}>
              <SkipForward size={15} /> Mix into the next song
            </button>
          </div>
          <div className="mp-chips" aria-label="Moves">
            <span className="mp-chips-label">Moves</span>
            {MOVES.map(([id, label]) => (
              <button key={id} type="button" className="mp-chip" disabled={locked} onClick={() => void booth({ op: "club_move", move: id })}>
                {label}
              </button>
            ))}
          </div>
          <div className="mp-chips" role="radiogroup" aria-label="Who picks the songs">
            <span className="mp-chips-label">Picks</span>
            {DJ_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={dj!.auto.mode === item.id}
                className={`mp-chip ${dj!.auto.on && dj!.auto.mode === item.id ? "on" : ""}`}
                disabled={locked}
                onClick={() => void booth({ op: "auto", mode: item.id, on: true })}
              >
                {item.label}
              </button>
            ))}
            <span className="mp-chips-label">Vibe</span>
            {VIBES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={dj!.auto.vibe === item.id}
                className={`mp-chip ${dj!.auto.vibe === item.id ? "on" : ""}`}
                disabled={locked}
                onClick={() => void booth({ op: "auto", vibe: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
          {dj!.crate.length > 0 && (
            <>
              <h4 className="mp-dj-sub">In the crate</h4>
              <ol className="mp-list">
                {dj!.crate.slice(0, 6).map((item, index) => (
                  <li key={`${item.title}-${index}`} className="mp-row">
                    <span className="mp-row-main static">
                      <span className="mp-row-index">{index + 1}</span>
                      <span className="mp-row-text">
                        <strong>{item.title}</strong>
                        <small>{item.artist}</small>
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
          <button type="button" className="mp-button ghost small" onClick={() => void openBooth()}>
            <ExternalLink size={14} /> Full DJ booth
          </button>
        </section>
      )}

      <section className="mp-dj-card">
        <header className="mp-dj-head">
          <div>
            <strong>Between songs</strong>
            <p>How the room's player goes from one song to the next while no DJ set is on.</p>
          </div>
        </header>
        <Switch
          label="AutoMix"
          hint="Songs flow into each other, matched in tempo and key"
          on={Boolean(settings?.automix)}
          disabled={!inRoom || !settings}
          onClick={() => void change(`/automix ${settings?.automix ? "off" : "on"}`)}
        />
        <Switch
          label="Smart Autoplay"
          hint="Keeps playing related songs when the queue runs out"
          on={Boolean(settings?.autoplay)}
          disabled={!inRoom || !settings}
          onClick={() => void change(`/autoplay ${settings?.autoplay ? "off" : "on"}`)}
        />
        {settings?.radio_stations && settings.radio_stations.length > 0 && (
          <div className="mp-chips" role="radiogroup" aria-label="Mood radio">
            <span className="mp-chips-label">Mood radio</span>
            {settings.radio_stations.map((station) => (
              <button
                key={station.id}
                type="button"
                role="radio"
                aria-checked={settings.radio === station.id}
                className={`mp-chip ${settings.radio === station.id ? "on" : ""}`}
                disabled={!inRoom}
                title={`${station.songs} songs`}
                onClick={() => void change(`/radio ${settings.radio === station.id ? "off" : station.id}`)}
              >
                {station.emoji} {station.label}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- Wrong lyrics? ---------- */

interface LyricsCandidate {
  id: number;
  track: string;
  artist: string;
  album: string | null;
  duration: number | null;
  synced: boolean;
  snippet: string[];
  url: string;
}

/** What Musixmatch would be asked from the picker, and its answer once it has one. */
interface MusixmatchOffer {
  track: string;
  artist: string | null;
  /** Musixmatch was asked about this song already (its answer, if any, is the candidate). */
  answered: boolean;
  candidate: {
    track: string;
    artist: string;
    duration: number | null;
    synced: boolean;
    snippet: string[];
    url: string;
  } | null;
  /** Requests that may still go out now. */
  left: number;
}

/**
 * Songs on lrclib with this song's name, a few lines of each, to pick the
 * right lyrics. lrclib is free. If none is right, Musixmatch can be asked
 * too: that is someone asking on purpose (like /lyricsnow), it spends one
 * request at most per song, and an answer it already gave shows for free.
 * The pick is saved for the song in this server, so /lyricsnow and the
 * player show it from then on.
 */
function LyricsPicker({
  roomId,
  trackId,
  duration,
  picked,
  onClose,
  onPicked,
  onCleared,
}: {
  roomId: string;
  trackId: string;
  duration: number | null;
  picked: boolean;
  onClose: () => void;
  onPicked: (body: LyricsResponse) => void;
  onCleared: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LyricsCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mxm, setMxm] = useState<MusixmatchOffer | null>(null);
  const [asking, setAsking] = useState(false);

  const search = useCallback(
    async (text?: string) => {
      setSearching(true);
      setError(null);
      try {
        const params = new URLSearchParams({ voiceChannelId: roomId });
        if (text) params.set("q", text);
        const data = await apiFetch<{ query?: string; candidates?: LyricsCandidate[]; musixmatch?: MusixmatchOffer | null }>(
          `/api/music/lyrics/pick?${params}`,
        );
        setResults(data.candidates || []);
        setMxm(data.musixmatch ?? null);
        if (!text && data.query) setQuery(data.query);
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "lrclib did not answer.");
      } finally {
        setSearching(false);
      }
    },
    [roomId],
  );

  // Opening the picker is asking: look up songs with this name right away.
  useEffect(() => {
    void search();
  }, [search, trackId]);

  // Musixmatch's answer is chosen with id -1 (lrclib ids are positive).
  const choose = async (lrclibId: number | null) => {
    setChoosing(lrclibId ?? 0);
    setError(null);
    try {
      const pick = lrclibId === -1 && mxm
        ? { musixmatch: { track: mxm.track, artist: mxm.artist } }
        : { lrclibId };
      const body = await apiFetch<LyricsResponse & { cleared?: boolean }>("/api/music/lyrics/pick", {
        method: "POST",
        body: JSON.stringify({ voiceChannelId: roomId, trackId, ...pick }),
      });
      if (body.cleared) onCleared();
      else onPicked(body);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That did not save.");
    } finally {
      setChoosing(null);
    }
  };

  const askMusixmatch = async () => {
    setAsking(true);
    setError(null);
    try {
      const data = await apiFetch<{ musixmatch?: MusixmatchOffer | null }>("/api/music/lyrics/pick", {
        method: "POST",
        body: JSON.stringify({ voiceChannelId: roomId, trackId, action: "ask-musixmatch", q: query.trim() }),
      });
      setMxm(data.musixmatch ? { ...data.musixmatch, answered: true } : null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Musixmatch did not answer.");
    } finally {
      setAsking(false);
    }
  };

  const asked = mxm ? `“${mxm.track}”${mxm.artist ? ` by ${mxm.artist}` : ""}` : "";

  return (
    <div className="mp-list-wrap mp-picker">
      <header className="mp-list-head">
        <strong>Pick the right lyrics</strong>
        <button type="button" className="mp-icon-btn small" onClick={onClose} aria-label="Back to the lyrics" title="Back to the lyrics">
          <X size={16} />
        </button>
      </header>
      <form
        className="mp-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim()) void search(query.trim());
        }}
      >
        <Search size={18} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Song and artist"
          aria-label="Search lyrics by song and artist"
          maxLength={200}
        />
        <button type="submit" className="mp-button" disabled={!query.trim() || searching}>
          {searching ? <LoaderCircle size={16} className="mp-spin" /> : "Search"}
        </button>
      </form>
      {error && <p className="mp-error">{error}</p>}
      {searching && !results && <Empty icon={<LoaderCircle size={28} className="mp-spin" />} title="Looking for songs with this name…" />}
      {results && !results.length && !searching && (
        <Empty icon={<MicVocal size={28} />} title="No lyrics with that name" text="Try other words: the song's name and the artist usually work best." />
      )}
      {results && results.length > 0 && (
        <ol className="mp-candidates">
          {results.map((item) => {
            const sameLength = Boolean(duration && item.duration && Math.abs(item.duration - duration) <= 5);
            return (
              <li key={item.id} className="mp-candidate">
                <div className="mp-candidate-head">
                  <span className="mp-row-text">
                    <strong>{item.track}</strong>
                    <small>{[item.artist, item.album, item.duration ? clock(item.duration) : null].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className={`mp-badge ${item.synced ? "" : "muted"}`}>{item.synced ? "Synced" : "Words only"}</span>
                  {sameLength && <span className="mp-badge good">Same length</span>}
                </div>
                <blockquote className="mp-snippet">
                  {item.snippet.map((line, index) => (
                    <span key={index}>{line}</span>
                  ))}
                </blockquote>
                <div className="mp-candidate-actions">
                  <button type="button" className="mp-button small" disabled={choosing !== null} onClick={() => void choose(item.id)}>
                    {choosing === item.id ? <LoaderCircle size={14} className="mp-spin" /> : null}
                    Use these
                  </button>
                  <a href={item.url} target="_blank" rel="noreferrer">See them on LRCLIB</a>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {mxm && results && !searching && (
        <section className="mp-mxm" aria-label="Musixmatch">
          {mxm.candidate ? (
            <div className="mp-candidate">
              <div className="mp-candidate-head">
                <span className="mp-row-text">
                  <strong>{mxm.candidate.track}</strong>
                  <small>{[mxm.candidate.artist, mxm.candidate.duration ? clock(mxm.candidate.duration) : null].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="mp-badge mxm">Musixmatch</span>
                <span className={`mp-badge ${mxm.candidate.synced ? "" : "muted"}`}>{mxm.candidate.synced ? "Synced" : "Words only"}</span>
                {Boolean(duration && mxm.candidate.duration && Math.abs(mxm.candidate.duration - duration) <= 5) && (
                  <span className="mp-badge good">Same length</span>
                )}
              </div>
              <blockquote className="mp-snippet">
                {mxm.candidate.snippet.map((line, index) => (
                  <span key={index}>{line}</span>
                ))}
              </blockquote>
              <div className="mp-candidate-actions">
                <button type="button" className="mp-button small" disabled={choosing !== null} onClick={() => void choose(-1)}>
                  {choosing === -1 ? <LoaderCircle size={14} className="mp-spin" /> : null}
                  Use these
                </button>
                <a href={mxm.candidate.url} target="_blank" rel="noreferrer">See them on Musixmatch</a>
              </div>
            </div>
          ) : mxm.answered ? (
            <p className="mp-lyrics-note">Musixmatch doesn&apos;t have {asked} either.</p>
          ) : mxm.left > 0 ? (
            <div className="mp-mxm-ask">
              <span>{results.length ? "None of these?" : "Not on lrclib?"}</span>
              <button type="button" className="mp-button ghost small" disabled={asking} onClick={() => void askMusixmatch()}>
                {asking ? <LoaderCircle size={14} className="mp-spin" /> : <Sparkles size={14} />}
                Ask Musixmatch for {asked}
              </button>
              <small>Type “Artist - Song” above to ask about something else.</small>
            </div>
          ) : (
            <p className="mp-lyrics-note">Musixmatch can&apos;t be asked right now: this month&apos;s lookups are used up.</p>
          )}
        </section>
      )}
      <footer className="mp-picker-foot">
        {picked && (
          <button type="button" className="mp-link" disabled={choosing !== null} onClick={() => void choose(null)}>
            Go back to the automatic match
          </button>
        )}
        <small>Your pick is saved for this song in this server: /lyricsnow and the player show it from now on.</small>
      </footer>
    </div>
  );
}
