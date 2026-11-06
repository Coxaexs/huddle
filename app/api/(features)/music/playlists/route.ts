import { musicRoom } from "@/lib/music-room";
import { BotError, changeRoomPlaylist, playRoomPlaylist, roomPlaylists } from "@/lib/musicbot";
import { isSongLink } from "@/lib/protocol";
import { limitUser } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CREATE_LIMIT = { action: "playlist-create", limit: 10, windowSeconds: 3600 };
const ADD_LIMIT = { action: "playlist-add", limit: 60, windowSeconds: 600 };

function failed(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Could not reach the music bot." },
    // The bot's refusals (not yours to change, already in it) are answers, not outages.
    { status: error instanceof BotError && error.status < 500 ? error.status : 502 },
  );
}

/** A song to look up: its name, or a YouTube or Spotify link. The bot treats anything starting with "http" as a link. */
function songQuery(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().slice(0, 500) : "";
  return !/^http/i.test(text) || isSongLink(text) ? text || null : null;
}

/** The voice room's saved playlists (its own, shared and everywhere ones), for the player. */
export async function GET(request: Request) {
  const room = await musicRoom(request, new URL(request.url).searchParams.get("voiceChannelId"));
  if (room instanceof Response) return room;
  try {
    return Response.json({
      playlists: await roomPlaylists(room.channelId, { id: room.userId, admin: room.admin }),
    });
  } catch (error) {
    return failed(error);
  }
}

/**
 * Play a playlist (replacing what is on) or add it to the queue, optionally
 * from one song. With an `action`, make a playlist or add a song to one: anyone
 * in the server may make one, and the bot lets only an admin or its creator add.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    voiceChannelId?: string;
    name?: string;
    mode?: string;
    start?: number;
    startTitle?: string;
    action?: string;
    query?: string;
  };
  const room = await musicRoom(request, body.voiceChannelId);
  if (room instanceof Response) return room;
  // By characters, as the bot counts them: a cut emoji would name a different list.
  const name = typeof body.name === "string" ? Array.from(body.name.trim()).slice(0, 50).join("") : "";
  if (!name) return Response.json({ error: "Pick a playlist." }, { status: 400 });
  const actor = { id: room.userId, admin: room.admin };

  if (body.action === "create") {
    const limited = await limitUser(undefined, CREATE_LIMIT, room.userId);
    if (limited) return limited;
    const clean = name.replace(/[\s\p{Cc}]+/gu, " ").trim();
    if (!clean) return Response.json({ error: "Give the playlist a name." }, { status: 400 });
    try {
      return Response.json({
        ...(await changeRoomPlaylist(room.channelId, actor, { action: "create", name: clean })),
        name: clean,
      });
    } catch (error) {
      return failed(error);
    }
  }
  if (body.action === "add_song") {
    const limited = await limitUser(undefined, ADD_LIMIT, room.userId);
    if (limited) return limited;
    const query = songQuery(body.query);
    if (!query) {
      return Response.json({ error: "Use the song's name, or a YouTube or Spotify link." }, { status: 400 });
    }
    try {
      return Response.json(await changeRoomPlaylist(room.channelId, actor, { action: "add_song", name, query }));
    } catch (error) {
      return failed(error);
    }
  }

  const start = Number.isInteger(body.start) && Number(body.start) > 0 ? Number(body.start) : 0;
  try {
    const message = await playRoomPlaylist(
      room.channelId,
      name,
      body.mode === "queue" ? "load" : "play",
      start,
      typeof body.startTitle === "string" ? body.startTitle.slice(0, 300) : undefined,
    );
    return Response.json({ message });
  } catch (error) {
    return failed(error);
  }
}
