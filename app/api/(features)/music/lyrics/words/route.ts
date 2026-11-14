import { playerState } from "@/lib/hub-client";
import { musicRoom } from "@/lib/music-room";
import { fetchLyrics, wordsAction } from "@/lib/musicbot";
import { heard } from "@/lib/protocol";

export const dynamic = "force-dynamic";

/**
 * Word-by-word timing borrowed from another version of the song the room is playing (the bot's words.py):
 * `action: "donors"` lists timed versions whose words fit the lyrics shown, `"borrow"` uses one (`from`),
 * `"shift"` saves a timing someone lined up by ear (`delta` seconds, for everyone), `"clear"` stops it.
 * Only for the song still playing (`trackId` must match), and on the lyrics the player shows for it.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    voiceChannelId?: string;
    trackId?: string;
    action?: string;
    from?: string;
    delta?: number;
  };
  const room = await musicRoom(request, body.voiceChannelId);
  if (room instanceof Response) return room;
  const track = heard(await playerState(room.channelId))?.track;
  if (!track || track.id !== body.trackId) {
    return Response.json({ error: "The song changed. Try again on this one." }, { status: 409 });
  }
  const action = body.action;
  if (action !== "donors" && action !== "borrow" && action !== "shift" && action !== "clear") {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  const keys = [track.pageUrl, track.query];
  try {
    const lyrics = await fetchLyrics(track.title, track.artist, track.duration, {
      musixmatch: "cached",
      cachedOnly: true,
      pickScope: room.serverId,
      keys,
    });
    if ((action === "donors" || action === "borrow") && !lyrics.lines.length) {
      return Response.json({ error: "This song has no synced lyrics to time." }, { status: 400 });
    }
    const delta = Number(body.delta);
    const answer = await wordsAction({
      action,
      keys,
      lines: lyrics.lines,
      from: typeof body.from === "string" ? body.from.slice(0, 64) : undefined,
      delta: Number.isFinite(delta) ? Math.max(-60, Math.min(60, delta)) : undefined,
      by: room.userName,
    });
    return Response.json({ trackId: track.id, ...answer });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not reach the music bot." },
      { status: 502 },
    );
  }
}
