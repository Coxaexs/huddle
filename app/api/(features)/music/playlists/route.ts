import { musicRoom } from "@/lib/music-room";
import { playRoomPlaylist, roomPlaylists } from "@/lib/musicbot";

export const dynamic = "force-dynamic";

function failed(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Could not reach the music bot." },
    { status: 502 },
  );
}

/** The voice room's saved playlists (its own, shared and everywhere ones), for the player. */
export async function GET(request: Request) {
  const room = await musicRoom(request, new URL(request.url).searchParams.get("voiceChannelId"));
  if (room instanceof Response) return room;
  try {
    return Response.json({ playlists: await roomPlaylists(room.channelId) });
  } catch (error) {
    return failed(error);
  }
}

/** Play a playlist (replacing what is on) or add it to the queue, optionally from one song. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    voiceChannelId?: string;
    name?: string;
    mode?: string;
    start?: number;
    startTitle?: string;
  };
  const room = await musicRoom(request, body.voiceChannelId);
  if (room instanceof Response) return room;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 50) : "";
  if (!name) return Response.json({ error: "Pick a playlist." }, { status: 400 });
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
