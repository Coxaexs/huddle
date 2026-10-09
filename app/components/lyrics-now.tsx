import { useEffect, useState } from "react";
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
}: LyricsNowProps) {
  const storeKey = `lyricsOffset:${trackKey || `${artist || ""}|${track || ""}`}`;
  // Seconds the lyrics run ahead (+) or behind (-); only this song's card has it.
  const [offset, setOffset] = useState(0);
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

  let visible = lines;
  if (live && positionMs !== undefined && lines.length) {
    const seconds = positionMs / 1000 + offset;
    let currentIndex = 0;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].at <= seconds) currentIndex = index;
      else break;
    }
    const start = Math.max(0, currentIndex - 2);
    visible = lines.slice(start, currentIndex + 3).map((item, offset) => ({
      ...item,
      active: start + offset === currentIndex,
    }));
  }

  return (
    <section className="lyrics-now" aria-label="Lyrics playing now">
      <header>
        <span className="lyrics-now-icon" aria-hidden="true"><Music2 size={16} /></span>
        <div>
          <strong>Lyrics now</strong>
          {(track || artist) && (
            <small>{[track, artist].filter(Boolean).join(" — ")}</small>
          )}
        </div>
      </header>
      {loose && (
        <p className="lyrics-now-loose">
          Matched by song name only. Is this the right song?
          {lines.slice(0, 2).map((item) => ` “${item.line}”`).join(" /")}
        </p>
      )}
      <div className="lyrics-now-lines">
        {visible.map((item, index) => (
          <div
            className={`lyrics-now-line ${item.active ? "active" : ""}`}
            key={`${item.at}-${index}`}
          >
            <time>{timestamp(item.at)}</time>
            <span>{item.line}</span>
          </div>
        ))}
      </div>
      {live && lines.length > 0 && (
        <div className="lyrics-now-sync" aria-label="Lyrics timing">
          <button type="button" onClick={() => nudge(-1)} title="Show lyrics 1 second later">−1s</button>
          <span>{offset ? `${offset > 0 ? "+" : ""}${offset}s` : "in sync"}</span>
          <button type="button" onClick={() => nudge(1)} title="Show lyrics 1 second earlier">+1s</button>
          {offset !== 0 && (
            <button type="button" onClick={() => nudge(0)} title="Reset timing">reset</button>
          )}
        </div>
      )}
    </section>
  );
}
