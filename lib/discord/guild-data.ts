/**
 * Loads whole guilds in the shape GUILD_CREATE and GET /guilds/{id} need.
 *
 * Discord sends a guild's channels, roles, members and presences inline with
 * GUILD_CREATE, and clients build their entire cache from that one payload —
 * discord.js will not dispatch a single message event until it has arrived. So
 * this assembles the whole thing in a handful of queries rather than letting
 * the serializers fan out into per-row lookups.
 */
import { DM_SERVER_ID } from "../schema";
import type { BotIdentity } from "../bot-auth";
import {
  serializeChannel,
  serializeEmoji,
  serializeGuild,
  serializeMember,
  serializePresence,
  serializeRole,
  everyoneRole,
  type HoffleChannelRow,
  type HoffleRoleRow,
  type HoffleServerRow,
  type HoffleUserRow,
} from "./serialize";
import { snowflakeFor } from "./snowflake";

export interface GuildLoadOptions {
  /** Members and presences are heavy; skip them when the bot lacks intents. */
  includeMembers?: boolean;
  includePresences?: boolean;
  /** User ids the hub reports as connected right now. */
  online?: Set<string>;
}

/** Every server this bot may see: its own, or all of them when it is master. */
export async function botServers(
  db: D1Database,
  bot: BotIdentity,
): Promise<HoffleServerRow[]> {
  if (bot.serverId) {
    const row = await db
      .prepare(
        "SELECT id, name, icon, color, created_by, created_at, banner_url FROM servers WHERE id = ?",
      )
      .bind(bot.serverId)
      .first<HoffleServerRow>();
    return row ? [row] : [];
  }
  const rows = await db
    .prepare(
      `SELECT id, name, icon, color, created_by, created_at, banner_url
       FROM servers WHERE id != ? ORDER BY position, created_at`,
    )
    .bind(DM_SERVER_ID)
    .all<HoffleServerRow>();
  return rows.results || [];
}

/** True when the bot is allowed to act on this native server id. */
export function botCanSeeServer(bot: BotIdentity, serverId: string): boolean {
  if (serverId === DM_SERVER_ID) return bot.isMaster;
  return bot.isMaster || bot.serverId === serverId;
}

export async function loadGuild(
  db: D1Database,
  server: HoffleServerRow,
  options: GuildLoadOptions = {},
): Promise<Record<string, unknown>> {
  const guildSnowflake = await snowflakeFor("guild", server.id, server.created_at);

  const [channelRows, roleRows, categoryRows, emojiRows] = await Promise.all([
    db
      .prepare(
        `SELECT id, server_id, name, kind, topic, position, category_id, created_at
         FROM channels WHERE server_id = ? ORDER BY position, created_at`,
      )
      .bind(server.id)
      .all<HoffleChannelRow>(),
    db
      .prepare(
        `SELECT id, server_id, name, color, permissions, position, created_at
         FROM roles WHERE server_id = ? ORDER BY position`,
      )
      .bind(server.id)
      .all<HoffleRoleRow>(),
    db
      .prepare(
        "SELECT id, server_id, name, position FROM categories WHERE server_id = ? ORDER BY position",
      )
      .bind(server.id)
      .all<{ id: string; server_id: string; name: string; position: number }>(),
    db
      .prepare(
        "SELECT id, name, created_at FROM emojis WHERE server_id = ? ORDER BY name",
      )
      .bind(server.id)
      .all<{ id: string; name: string; created_at: string }>(),
  ]);

  // Categories are channels on Discord, and a channel's parent_id has to
  // resolve to one or clients drop it from the sidebar entirely.
  const categoryChannels: HoffleChannelRow[] = (categoryRows.results || []).map(
    (category) => ({
      id: category.id,
      server_id: category.server_id,
      name: category.name,
      kind: "category",
      topic: null,
      position: category.position,
      category_id: null,
    }),
  );

  const channels = await Promise.all(
    [...categoryChannels, ...(channelRows.results || [])].map((channel) =>
      serializeChannel(channel, guildSnowflake),
    ),
  );

  const roles = [
    everyoneRole(guildSnowflake),
    ...(await Promise.all((roleRows.results || []).map((role) => serializeRole(role)))),
  ];

  const emojis = await Promise.all(
    (emojiRows.results || []).map((emoji) => serializeEmoji(emoji)),
  );

  const memberCountRow = await db
    .prepare("SELECT COUNT(*) AS count FROM server_members WHERE server_id = ?")
    .bind(server.id)
    .first<{ count: number }>();

  let members: Record<string, unknown>[] = [];
  let presences: Record<string, unknown>[] = [];

  if (options.includeMembers || options.includePresences) {
    const memberRows = await db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.avatar, u.avatar_url, u.banner_url,
                u.color, u.is_admin, u.created_at, u.status, u.custom_status,
                m.joined_at
         FROM server_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.server_id = ?`,
      )
      .bind(server.id)
      .all<HoffleUserRow & { joined_at: string }>();

    const roleAssignments = await db
      .prepare(
        "SELECT user_id, role_id FROM member_roles WHERE server_id = ?",
      )
      .bind(server.id)
      .all<{ user_id: string; role_id: string }>();

    const rolesByUser = new Map<string, string[]>();
    for (const row of roleAssignments.results || []) {
      const list = rolesByUser.get(row.user_id) || [];
      list.push(row.role_id);
      rolesByUser.set(row.user_id, list);
    }

    const rows = memberRows.results || [];
    if (options.includeMembers) {
      members = await Promise.all(
        rows.map((row) =>
          serializeMember(row, {
            joined_at: row.joined_at,
            roles: rolesByUser.get(row.id) || [],
          }),
        ),
      );
    }
    if (options.includePresences) {
      presences = await Promise.all(
        rows.map((row) =>
          serializePresence(row, guildSnowflake, options.online?.has(row.id) ?? false),
        ),
      );
    }
  }

  const ownerId = server.created_by
    ? await snowflakeFor("user", server.created_by)
    : guildSnowflake;

  return serializeGuild(server, {
    channels,
    roles,
    emojis,
    members,
    presences,
    memberCount: memberCountRow?.count ?? members.length,
    ownerId,
  });
}

/** Resolves a channel plus the guild it belongs to, for message routing. */
export async function channelWithGuild(
  db: D1Database,
  channelId: string,
): Promise<{
  channel: HoffleChannelRow;
  server: HoffleServerRow | null;
  isDm: boolean;
} | null> {
  const channel = await db
    .prepare(
      `SELECT id, server_id, name, kind, topic, position, category_id, created_at
       FROM channels WHERE id = ?`,
    )
    .bind(channelId)
    .first<HoffleChannelRow>();
  if (!channel) return null;

  if (channel.server_id === DM_SERVER_ID) {
    return { channel, server: null, isDm: true };
  }

  const server = await db
    .prepare(
      "SELECT id, name, icon, color, created_by, created_at, banner_url FROM servers WHERE id = ?",
    )
    .bind(channel.server_id)
    .first<HoffleServerRow>();
  return { channel, server, isDm: false };
}

/** Loads the users a message mentions, so `message.mentions` is populated. */
export async function loadMentionedUsers(
  db: D1Database,
  messageId: string,
): Promise<HoffleUserRow[]> {
  const rows = await db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar, u.avatar_url, u.color,
              u.created_at, u.status, u.custom_status
       FROM mentions m JOIN users u ON u.id = m.user_id
       WHERE m.message_id = ?`,
    )
    .bind(messageId)
    .all<HoffleUserRow>();
  return rows.results || [];
}

/** Reaction tallies for a message, in the shape the message payload wants. */
export async function loadReactions(
  db: D1Database,
  messageId: string,
  viewerId?: string | null,
): Promise<Array<{ emoji: string; count: number; me: boolean }>> {
  const rows = await db
    .prepare(
      "SELECT emoji, user_id FROM reactions WHERE message_id = ?",
    )
    .bind(messageId)
    .all<{ emoji: string; user_id: string }>();

  const tally = new Map<string, { count: number; me: boolean }>();
  for (const row of rows.results || []) {
    const entry = tally.get(row.emoji) || { count: 0, me: false };
    entry.count += 1;
    if (viewerId && row.user_id === viewerId) entry.me = true;
    tally.set(row.emoji, entry);
  }
  return [...tally.entries()].map(([emoji, entry]) => ({ emoji, ...entry }));
}

export async function loadUser(
  db: D1Database,
  userId: string,
): Promise<HoffleUserRow | null> {
  return db
    .prepare(
      `SELECT id, username, display_name, avatar, avatar_url, banner_url, color,
              is_admin, created_at, status, custom_status, bio
       FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<HoffleUserRow>();
}
