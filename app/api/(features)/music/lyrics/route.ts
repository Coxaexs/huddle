import { playerState } from "@/lib/hub-client";
import { musicRoom } from "@/lib/music-room";
import { fetchLyrics } from "@/lib/musicbot";
import { heard } from "@/lib/protocol";

export const dynamic = "force-dynamic";

/**
 * Lyrics for whatever a voice room is playing, for the full-screen player.
 *
 * Opening a song shows only lyrics already saved (by /lyricsnow, an earlier
 * search): nothing is looked up. `find=1` is the player's "Search for lyrics"
 * button: someone asking on purpose, so it searches like /lyricsnow does
 * (lrclib, then Musixmatch, whose small monthly plan the bot guards).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const room = await musicRoom(request, url.searchParams.get("voiceChannelId"));
  if (room instanceof Response) return room;

  const track = heard(await playerState(room.channelId))?.track;
  if (!track) return Response.json({ trackId: null, lines: [], lyrics: null });

  try {
    const searched = url.searchParams.get("find") === "1";
    const lyrics = await fetchLyrics(
      track.title,
      track.artist,
      track.duration,
      searched ? { musixmatch: true } : { musixmatch: "cached", cachedOnly: true },
    );
    return Response.json({
      trackId: track.id,
      track: lyrics.track || track.title,
      artist: lyrics.artist || track.artist || "",
      lines: lyrics.lines,
      lyrics: lyrics.lyrics || null,
      synced: lyrics.lines.length > 0,
      loose: Boolean(lyrics.loose),
      source: lyrics.source || null,
      sourceUrl: lyrics.sourceUrl || null,
      versionLength: lyrics.versionLength || null,
      musixmatchChecked: Boolean(lyrics.musixmatchChecked),
      searched,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not reach the music bot." },
      { status: 502 },
    );
  }
}
