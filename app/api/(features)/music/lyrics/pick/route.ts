import { playerState } from "@/lib/hub-client";
import { musicRoom } from "@/lib/music-room";
import { lyricsCandidates, pickLyrics } from "@/lib/musicbot";
import { heard } from "@/lib/protocol";
import { lyricsAnswer } from "../route";

export const dynamic = "force-dynamic";

function failed(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Could not reach the music bot." },
    { status: 502 },
  );
}

/**
 * "Wrong lyrics?" in the music player: lrclib entries that could be the song
 * the room is playing, with a few lines of each (`q` searches other words).
 * lrclib is free; the Musixmatch plan is never touched here.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const room = await musicRoom(request, url.searchParams.get("voiceChannelId"));
  if (room instanceof Response) return room;
  const track = heard(await playerState(room.channelId))?.track;
  if (!track) return Response.json({ trackId: null, query: "", candidates: [] });
  try {
    const query = url.searchParams.get("q")?.trim().slice(0, 200) || undefined;
    const found = await lyricsCandidates(track.title, track.artist, track.duration, query);
    return Response.json({ trackId: track.id, ...found });
  } catch (error) {
    return failed(error);
  }
}

/**
 * Save the picked lyrics for the playing song in this server (so /lyricsnow
 * and the player show them from then on), or with `lrclibId: null` go back
 * to the automatic match. Only for the song still playing: `trackId` must match.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    voiceChannelId?: string;
    trackId?: string;
    lrclibId?: number | null;
  };
  const room = await musicRoom(request, body.voiceChannelId);
  if (room instanceof Response) return room;
  const track = heard(await playerState(room.channelId))?.track;
  if (!track || track.id !== body.trackId) {
    return Response.json({ error: "The song changed. Pick again for this one." }, { status: 409 });
  }
  const lrclibId = Number.isInteger(body.lrclibId) && Number(body.lrclibId) > 0 ? Number(body.lrclibId) : null;
  try {
    const lyrics = await pickLyrics({
      title: track.title,
      artist: track.artist,
      scope: room.serverId,
      lrclibId,
      by: room.userName,
    });
    return Response.json(lyrics ? lyricsAnswer(track, lyrics, true) : { trackId: track.id, cleared: true });
  } catch (error) {
    return failed(error);
  }
}
