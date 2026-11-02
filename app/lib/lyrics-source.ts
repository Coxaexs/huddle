/**
 * Where a song's lyrics came from, for the "Lyrics from …" line under the
 * lyrics card and in the music player. The bot sends a page for them there
 * (lrclib's track page, or the song's Musixmatch page); older cards have no
 * source, and those were all lrclib.
 */
export function lyricsSource(
  source?: string | null,
  url?: string | null,
): { label: string; url: string } {
  const musixmatch = source === "musixmatch";
  const home = musixmatch ? "https://www.musixmatch.com/" : "https://lrclib.net/";
  const own = musixmatch ? /^https:\/\/www\.musixmatch\.com\// : /^https:\/\/lrclib\.net\//;
  return { label: musixmatch ? "Musixmatch" : "LRCLIB", url: url && own.test(url) ? url : home };
}
