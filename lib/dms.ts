import { DM_SERVER_ID } from "./schema";

export interface DmSummary {
  channelId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    avatarUrl: string | null;
    color: string;
  };
  lastMessage: string | null;
  lastAt: string | null;
}

/**
 * Who a channel's messages may reach. Server channels are open to everyone in
 * this Huddle (`null` means "no filter"); a DM reaches exactly two people.
 */
export async function channelAudience(
  db: D1Database,
  channelId: string,
): Promise<string[] | null> {
  const members = await db
    .prepare("SELECT user_id FROM dm_members WHERE channel_id = ?")
    .bind(channelId)
    .all();
  const ids = ((members.results || []) as Array<{ user_id: string }>).map(
    (row) => row.user_id,
  );
  return ids.length ? ids : null;
}

export async function isDmMember(
  db: D1Database,
  channelId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS ok FROM dm_members WHERE channel_id = ? AND user_id = ?",
    )
    .bind(channelId, userId)
    .first();
  return Boolean(row);
}

/** Finds the conversation between two people, creating it on first message. */
export async function findOrCreateDm(
  db: D1Database,
  a: string,
  b: string,
): Promise<string> {
  const existing = await db
    .prepare(
      `SELECT mine.channel_id AS id
         FROM dm_members mine
         JOIN dm_members theirs ON theirs.channel_id = mine.channel_id
        WHERE mine.user_id = ? AND theirs.user_id = ?`,
    )
    .bind(a, b)
    .first<{ id: string }>();
  if (existing?.id) return existing.id;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO channels (id, server_id, name, kind, topic, position, created_at)
         VALUES (?, ?, 'direct message', 'dm', '', 0, ?)`,
      )
      .bind(id, DM_SERVER_ID, now),
    db
      .prepare("INSERT INTO dm_members (channel_id, user_id) VALUES (?, ?)")
      .bind(id, a),
    db
      .prepare("INSERT INTO dm_members (channel_id, user_id) VALUES (?, ?)")
      .bind(id, b),
  ]);
  return id;
}

/** Every conversation this person is part of, most recently used first. */
export async function listDms(
  db: D1Database,
  userId: string,
): Promise<DmSummary[]> {
  const rows = await db
    .prepare(
      `SELECT mine.channel_id AS channel_id,
              u.id AS id, u.username, u.display_name, u.avatar, u.avatar_url, u.color,
              (SELECT content FROM messages m
                WHERE m.channel_id = mine.channel_id AND m.deleted_at IS NULL
                ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages m
                WHERE m.channel_id = mine.channel_id AND m.deleted_at IS NULL
                ORDER BY m.created_at DESC LIMIT 1) AS last_at
         FROM dm_members mine
         JOIN dm_members theirs
           ON theirs.channel_id = mine.channel_id AND theirs.user_id != mine.user_id
         JOIN users u ON u.id = theirs.user_id
        WHERE mine.user_id = ?
        ORDER BY last_at DESC NULLS LAST`,
    )
    .bind(userId)
    .all();

  return (
    (rows.results || []) as Array<{
      channel_id: string;
      id: string;
      username: string;
      display_name: string;
      avatar: string;
      avatar_url: string | null;
      color: string;
      last_message: string | null;
      last_at: string | null;
    }>
  ).map((row) => ({
    channelId: row.channel_id,
    user: {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      avatarUrl: row.avatar_url,
      color: row.color,
    },
    lastMessage: row.last_message,
    lastAt: row.last_at,
  }));
}
