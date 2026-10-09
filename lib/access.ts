/**
 * Who may read or act in a channel.
 *
 * One rule for every route that takes a channel id: a DM (or group DM) is open
 * to its participants only, and a server channel to that server's members who
 * are not banned from it. Global admins can see everything, as they always
 * could. An unknown channel answers 404 rather than 403 so ids cannot be
 * probed for existence.
 */
import { DEFAULT_SERVER_ID, DM_SERVER_ID } from "./schema";

export interface AccessibleChannel {
  id: string;
  serverId: string;
  kind: string;
  name: string;
  isDm: boolean;
}

export type ChannelAccess =
  | { ok: true; channel: AccessibleChannel }
  | { ok: false; response: Response };

interface Viewer {
  id: string;
  is_admin?: number | boolean | null;
}

function denied(status: 403 | 404, error: string): { ok: false; response: Response } {
  return { ok: false, response: Response.json({ error }, { status }) };
}

/** Whether `user` may see the server `serverId` (member and not banned). */
export async function canSeeServer(
  db: D1Database,
  serverId: string,
  user: Viewer,
): Promise<boolean> {
  if (user.is_admin) return true;
  const [member, banned] = await Promise.all([
    db
      .prepare("SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?")
      .bind(serverId, user.id)
      .first(),
    db
      .prepare("SELECT 1 FROM bans WHERE server_id = ? AND user_id = ?")
      .bind(serverId, user.id)
      .first(),
  ]);
  return Boolean(member) && !banned;
}

/** Looks up a channel and checks the viewer may use it. */
export async function channelAccess(
  db: D1Database,
  channelId: string,
  user: Viewer,
): Promise<ChannelAccess> {
  const row = await db
    .prepare("SELECT id, server_id, kind, name FROM channels WHERE id = ?")
    .bind(channelId)
    .first<{ id: string; server_id: string; kind: string; name: string }>();
  if (!row) return denied(404, "That channel is gone.");
  const channel: AccessibleChannel = {
    id: row.id,
    serverId: row.server_id,
    kind: row.kind,
    name: row.name,
    isDm: row.server_id === DM_SERVER_ID || row.kind === "dm",
  };
  if (channel.isDm) {
    // Membership is the only key to a DM. A conversation everyone has left has
    // no members, and so no readers: it fails closed.
    const member = await db
      .prepare("SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?")
      .bind(channelId, user.id)
      .first();
    return member ? { ok: true, channel } : denied(403, "You are not in this conversation.");
  }
  if (!(await canSeeServer(db, channel.serverId || DEFAULT_SERVER_ID, user))) {
    return denied(403, "You are not a member of this server.");
  }
  return { ok: true, channel };
}

/** Access to the channel a message lives in, by message id. */
export async function messageAccess(
  db: D1Database,
  messageId: string,
  user: Viewer,
  options: { includeDeleted?: boolean } = {},
): Promise<ChannelAccess> {
  const row = await db
    .prepare(
      `SELECT channel_id FROM messages WHERE id = ?${options.includeDeleted ? "" : " AND deleted_at IS NULL"}`,
    )
    .bind(messageId)
    .first<{ channel_id: string | null }>();
  if (!row) return denied(404, "That message is gone.");
  if (!row.channel_id) {
    // Legacy rows addressed by channel name live on the home server.
    return (await canSeeServer(db, DEFAULT_SERVER_ID, user))
      ? {
          ok: true,
          channel: { id: "", serverId: DEFAULT_SERVER_ID, kind: "text", name: "", isDm: false },
        }
      : denied(403, "You are not a member of this server.");
  }
  return channelAccess(db, row.channel_id, user);
}
