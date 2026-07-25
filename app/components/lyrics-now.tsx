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
}: LyricsNowProps) {
  let visible = lines;
  if (live && positionMs !== undefined && lines.length) {
    const seconds = positionMs / 1000;
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
        <span className="lyrics-now-icon" aria-hidden="true">♫</span>
        <div>
          <strong>Lyrics now</strong>
          {(track || artist) && (
            <small>{[track, artist].filter(Boolean).join(" — ")}</small>
          )}
        </div>
      </header>
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
    </section>
  );
}
