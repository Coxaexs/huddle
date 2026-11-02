import { useEffect, useRef, useState } from "react";
import { Music2 } from "lucide-react";

interface LyricsNowLine {
  at: number;
  line: string;
  active: boolean;
}

interface LyricsNowProps {
  track?: string;
  artist?: string;
  lines?: LyricsNowLine[];
  positionMs?: number;
  live?: boolean;
  /** Found by song name only: show some lines so the listener can confirm it. */
  loose?: boolean;
  /** Remembers the timing correction for this song. */
  trackKey?: string;
  /** "musixmatch" when the bot had to ask Musixmatch; lrclib otherwise. */
  source?: string;
  /** Musixmatch only had a cut this many seconds long, so timing may drift. */
  versionLength?: number;
  /** Jumps the room's player to this point (ms). Lines are buttons while live. */
  onSeek?: (positionMs: number) => void;
}

function timestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** A compact karaoke-style window around the currently playing lyric. */
export function LyricsNow({
  track,
  artist,
  lines = [],
  positionMs,
  live = false,
  loose = false,
  trackKey,
  source,
  versionLength,
  onSeek,
}: LyricsNowProps) {
  const storeKey = `lyricsOffset:${trackKey || `${artist || ""}|${track || ""}`}`;
  // Seconds the lyrics run ahead (+) or behind (-); only this song's card has it.
  const [offset, setOffset] = useState(0);
  // While the song plays the card shows five lines; this opens all of them.
  const [showAll, setShowAll] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(storeKey));
      setOffset(Number.isFinite(saved) ? saved : 0);
    } catch {
      /* private mode */
    }
  }, [storeKey]);
  const nudge = (delta: number) => {
    const next = delta === 0 ? 0 : Math.round((offset + delta) * 10) / 10;
    setOffset(next);
    try {
      if (next) localStorage.setItem(storeKey, String(next));
      else localStorage.removeItem(storeKey);
    } catch {
      /* private mode */
    }
  };

  const playing = live && positionMs !== undefined && lines.length > 0;
  let visible = lines;
  if (playing) {
    const seconds = (positionMs ?? 0) / 1000 + offset;
    let currentIndex = 0;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].at <= seconds) currentIndex = index;
      else break;
    }
    const start = showAll ? 0 : Math.max(0, currentIndex - 2);
    const end = showAll ? lines.length : currentIndex + 3;
    visible = lines.slice(start, end).map((item, step) => ({
      ...item,
      active: start + step === currentIndex,
    }));
  }

  // Opening the whole song brings the line being sung into view.
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>(".lyrics-now-line.active");
    if (showAll && list && active) {
      list.scrollTop = Math.max(0, active.offsetTop - list.clientHeight / 3);
    }
  }, [showAll]);

  // A line's own time is when it shows; the timing correction moves that.
  const seekable = playing && Boolean(onSeek);
  const seekTo = (at: number) =>
    onSeek?.(Math.max(0, Math.round((at - offset) * 1000)));

  return (
    <section className="lyrics-now" aria-label="Lyrics playing now">
      <header>
        <span className="lyrics-now-icon" aria-hidden="true"><Music2 size={16} /></span>
        <div>
          <strong>Lyrics now</strong>
          {(track || artist) && (
            <small>
              {[track, artist].filter(Boolean).join(" — ")}
              {source === "musixmatch" ? " · Musixmatch" : ""}
            </small>
          )}
        </div>
      </header>
      {loose && (
        <p className="lyrics-now-loose">
          Matched by song name only. Is this the right song?
          {lines.slice(0, 2).map((item) => ` “${item.line}”`).join(" /")}
        </p>
      )}
      {!loose && versionLength ? (
        <p className="lyrics-now-loose">
          These lyrics follow a {timestamp(versionLength)} version of the song, so the
          timing may drift. Nudge it with −1s / +1s.
        </p>
      ) : null}
      <div className="lyrics-now-lines" ref={listRef}>
        {visible.map((item, index) =>
          seekable ? (
            <button
              type="button"
              className={`lyrics-now-line seekable ${item.active ? "active" : ""}`}
              key={`${item.at}-${index}`}
              onClick={() => seekTo(item.at)}
              title={`Play from ${timestamp(item.at)}`}
              aria-current={item.active ? "true" : undefined}
            >
              <time>{timestamp(item.at)}</time>
              <span>{item.line}</span>
            </button>
          ) : (
            <div
              className={`lyrics-now-line ${item.active ? "active" : ""}`}
              key={`${item.at}-${index}`}
            >
              <time>{timestamp(item.at)}</time>
              <span>{item.line}</span>
            </div>
          ),
        )}
      </div>
      {live && lines.length > 0 && (
        <div className="lyrics-now-sync" aria-label="Lyrics timing">
          <button type="button" onClick={() => nudge(-1)} title="Show lyrics 1 second later">−1s</button>
          <span>{offset ? `${offset > 0 ? "+" : ""}${offset}s` : "in sync"}</span>
          <button type="button" onClick={() => nudge(1)} title="Show lyrics 1 second earlier">+1s</button>
          {offset !== 0 && (
            <button type="button" onClick={() => nudge(0)} title="Reset timing">reset</button>
          )}
          {playing && lines.length > 5 && (
            <button
              type="button"
              className="lyrics-now-more"
              onClick={() => setShowAll((open) => !open)}
              aria-expanded={showAll}
            >
              {showAll ? "Fewer lines" : "Whole song"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
