import { currentUser, unauthorized } from "./auth";
import { MUSIC_BOT_MISSING, musicBotInServer } from "./music-bot";
import { findChannel, isServerMember } from "./servers";
import { bindings } from "./storage";

/**
 * The voice room a music player request is about, after the checks the music
 * commands make (/api/music/command): a voice room in a server the caller is
 * in, with the music bot added. Anything else comes back as the Response.
 */
export async function musicRoom(
  request: Request,
  voiceChannelId: string | null | undefined,
): Promise<{ userId: string; userName: string; channelId: string; serverId: string } | Response> {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const channel = voiceChannelId ? await findChannel(db, voiceChannelId) : null;
  if (
    !channel ||
    channel.kind !== "voice" ||
    !(await isServerMember(db, channel.server_id, user.id))
  ) {
    return Response.json({ error: "You can't open that voice room." }, { status: 403 });
  }
  if (!(await musicBotInServer(db, channel.server_id))) {
    return Response.json({ error: MUSIC_BOT_MISSING }, { status: 409 });
  }
  return { userId: user.id, userName: user.display_name, channelId: channel.id, serverId: channel.server_id };
}
