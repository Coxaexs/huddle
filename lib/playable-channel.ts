import { unauthorized } from "./auth";
import { channelKindInfo, textChannelKindsSql } from "./channel-kinds";
import { isDmMember } from "./dms";
import { can, Permission } from "./permissions";
import { isServerMember } from "./servers";
import { blockIfTimedOut } from "./timeouts";

export interface PlayableChannel {
  id: string;
  name: string;
  kind: string;
  server_id: string;
}

/**
 * The same gates as sending a message there: DM membership, server
 * membership, bans, timeouts and read-only announcement channels. Returns the
 * channel, or the response refusing it.
 */
export async function playableChannel(
  db: D1Database,
  channelId: string,
  userId: string,
): Promise<PlayableChannel | Response> {
  const channel = await db
    .prepare(`SELECT id, name, kind, server_id FROM channels WHERE id = ? AND kind IN (${textChannelKindsSql()})`)
    .bind(channelId)
    .first<PlayableChannel>();
  if (!channel) return Response.json({ error: "That conversation is gone." }, { status: 404 });
  if (channel.kind === "dm") {
    return (await isDmMember(db, channelId, userId)) ? channel : unauthorized();
  }
  if (!(await isServerMember(db, channel.server_id, userId))) return unauthorized();
  const banned = await db
    .prepare("SELECT user_id FROM bans WHERE server_id = ? AND user_id = ?")
    .bind(channel.server_id, userId)
    .first();
  if (banned) return Response.json({ error: "You are banned from this server." }, { status: 403 });
  const timedOut = await blockIfTimedOut(db, channelId, userId);
  if (timedOut) return timedOut;
  if (
    channelKindInfo(channel.kind).moderatorOnlyPosting &&
    !(await can(db, userId, channel.server_id, Permission.MANAGE_MESSAGES))
  ) {
    return Response.json({ error: "Only moderators can post here." }, { status: 403 });
  }
  return channel;
}

