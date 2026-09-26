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
  /** Closed from the DM list; still reachable through the quick switcher. */
  hidden?: boolean;
  /**
   * Set on group DMs. `user` then describes the group itself (its id is the
   * channel id, its name the group name) so single-person UI keeps working.
   */
  group?: {
    name: string;
    ownerId: string | null;
    members: DmSummary["user"][];
  };
}

/** Most people a group DM can hold, like Discord. */
export const GROUP_DM_LIMIT = 10;

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
  if (a === b) {
    const existing = await db
      .prepare(
        `SELECT d1.channel_id AS id
           FROM dm_members d1
          WHERE d1.user_id = ?
            AND COALESCE((SELECT is_group FROM channels WHERE id = d1.channel_id), 0) = 0
            AND NOT EXISTS (
              SELECT 1 FROM dm_members d2
               WHERE d2.channel_id = d1.channel_id
                 AND d2.user_id != d1.user_id
            )`,
      )
      .bind(a)
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
    ]);
    return id;
  }

  const existing = await db
    .prepare(
      `SELECT mine.channel_id AS id
         FROM dm_members mine
         JOIN dm_members theirs ON theirs.channel_id = mine.channel_id
         JOIN channels c ON c.id = mine.channel_id
        WHERE mine.user_id = ? AND theirs.user_id = ? AND COALESCE(c.is_group, 0) = 0`,
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
                ORDER BY m.created_at DESC LIMIT 1) AS last_at,
              mine.hidden_at AS hidden_at
         FROM dm_members mine
         LEFT JOIN dm_members theirs
           ON theirs.channel_id = mine.channel_id AND theirs.user_id != mine.user_id
         JOIN users u ON u.id = COALESCE(theirs.user_id, mine.user_id)
         JOIN channels c ON c.id = mine.channel_id
        WHERE mine.user_id = ? AND COALESCE(c.is_group, 0) = 0
        GROUP BY mine.channel_id
        ORDER BY last_at DESC NULLS LAST`,
    )
    .bind(userId)
    .all();

  const direct = (
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
      hidden_at?: string | null;
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
    hidden: Boolean(row.hidden_at),
  }));

  const groups = await listGroupDms(db, userId);
  return [...direct, ...groups].sort((a, b) =>
    (b.lastAt || "").localeCompare(a.lastAt || ""),
  );
}

/** The group DMs this person is in, each with its full member list. */
async function listGroupDms(db: D1Database, userId: string): Promise<DmSummary[]> {
  const rows = await db
    .prepare(
      `SELECT c.id AS channel_id, c.name AS name, c.topic AS owner_id, c.created_at AS created_at,
              mine.hidden_at AS hidden_at,
              (SELECT content FROM messages m
                WHERE m.channel_id = c.id AND m.deleted_at IS NULL
                ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages m
                WHERE m.channel_id = c.id AND m.deleted_at IS NULL
                ORDER BY m.created_at DESC LIMIT 1) AS last_at
         FROM dm_members mine
         JOIN channels c ON c.id = mine.channel_id
        WHERE mine.user_id = ? AND c.is_group = 1`,
    )
    .bind(userId)
    .all();
  const groups = (rows.results || []) as Array<{
    channel_id: string;
    name: string;
    owner_id: string;
    created_at: string;
    hidden_at: string | null;
    last_message: string | null;
    last_at: string | null;
  }>;
  if (!groups.length) return [];

  const placeholders = groups.map(() => "?").join(",");
  const memberRows = await db
    .prepare(
      `SELECT dm.channel_id AS channel_id, u.id, u.username, u.display_name, u.avatar,
              u.avatar_url, u.color
         FROM dm_members dm
         JOIN users u ON u.id = dm.user_id
        WHERE dm.channel_id IN (${placeholders})`,
    )
    .bind(...groups.map((g) => g.channel_id))
    .all();
  const byChannel = new Map<string, DmSummary["user"][]>();
  for (const row of (memberRows.results || []) as Array<{
    channel_id: string;
    id: string;
    username: string;
    display_name: string;
    avatar: string;
    avatar_url: string | null;
    color: string;
  }>) {
    const list = byChannel.get(row.channel_id) || [];
    list.push({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      avatarUrl: row.avatar_url,
      color: row.color,
    });
    byChannel.set(row.channel_id, list);
  }

  return groups.map((group) => {
    const members = byChannel.get(group.channel_id) || [];
    const name = group.name.trim() || groupFallbackName(members, userId);
    return {
      channelId: group.channel_id,
      user: {
        id: group.channel_id,
        username: name,
        displayName: name,
        avatar: "👥",
        avatarUrl: null,
        color: "#5865f2",
      },
      lastMessage: group.last_message,
      // A brand-new group sorts by when it was made until someone talks.
      lastAt: group.last_at || group.created_at,
      hidden: Boolean(group.hidden_at),
      group: { name, ownerId: group.owner_id || null, members },
    };
  });
}

/** "Ana, Ben, Cy" — what an unnamed group is called, from your point of view. */
export function groupFallbackName(
  members: Array<{ id: string; displayName: string }>,
  viewerId: string,
): string {
  const others = members.filter((m) => m.id !== viewerId).map((m) => m.displayName);
  if (!others.length) return "Empty group";
  return others.slice(0, 4).join(", ") + (others.length > 4 ? ` +${others.length - 4}` : "");
}

/**
 * Starts a group DM. The creator owns it (stored in `topic`, which DM channels
 * never otherwise use); `name` may be empty to use the members' names.
 */
export async function createGroupDm(
  db: D1Database,
  ownerId: string,
  memberIds: string[],
  name: string,
): Promise<string> {
  const ids = [...new Set([ownerId, ...memberIds])];
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO channels (id, server_id, name, kind, topic, position, created_at, is_group)
         VALUES (?, ?, ?, 'dm', ?, 0, ?, 1)`,
      )
      .bind(id, DM_SERVER_ID, name, ownerId, now),
    ...ids.map((userId) =>
      db
        .prepare("INSERT INTO dm_members (channel_id, user_id) VALUES (?, ?)")
        .bind(id, userId),
    ),
  ]);
  return id;
}

export async function groupInfo(
  db: D1Database,
  channelId: string,
): Promise<{ ownerId: string; name: string; members: string[] } | null> {
  const channel = await db
    .prepare("SELECT topic, name FROM channels WHERE id = ? AND is_group = 1")
    .bind(channelId)
    .first<{ topic: string; name: string }>();
  if (!channel) return null;
  const members = await channelAudience(db, channelId);
  return { ownerId: channel.topic, name: channel.name, members: members || [] };
}

/**
 * Closes (hides) or reopens a DM in one person's list. Only the list entry
 * changes; the conversation and its messages are untouched.
 */
export async function setDmHidden(
  db: D1Database,
  channelId: string,
  userId: string,
  hidden: boolean,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE dm_members SET hidden_at = ? WHERE channel_id = ? AND user_id = ?")
    .bind(hidden ? new Date().toISOString() : null, channelId, userId)
    .run();
  return Boolean(result.meta.changes);
}

/** A new message brings a closed DM back for everyone in it. */
export function reopenDmForAll(db: D1Database, channelId: string): Promise<unknown> {
  return db
    .prepare("UPDATE dm_members SET hidden_at = NULL WHERE channel_id = ? AND hidden_at IS NOT NULL")
    .bind(channelId)
    .run();
}
