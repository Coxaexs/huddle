/**
 * D1 persistence and message-posting helpers for the built-in Community Bot.
 */

import { publishMessage, publishMessageEvent, publishStructureChange } from "@/lib/hub-client";
import { channelAudience } from "@/lib/dms";
import {
  type CommunityBotConfig,
  defaultConfig,
  sanitizeHexColor,
  sanitizePlugins,
} from "./types";

interface ConfigRow {
  server_id: string;
  enabled: number;
  bot_name: string;
  bot_avatar: string;
  bot_color: string;
  plugins_json: string;
  updated_at: string;
}

export async function getCommunityBotConfig(
  db: D1Database,
  serverId: string,
): Promise<CommunityBotConfig> {
  const row = await db
    .prepare("SELECT * FROM community_bot_config WHERE server_id = ?")
    .bind(serverId)
    .first<ConfigRow>();
  if (!row) return defaultConfig(serverId);

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(row.plugins_json || "{}");
  } catch {
    parsed = {};
  }
  return {
    serverId: row.server_id,
    enabled: Boolean(row.enabled),
    botName: row.bot_name || "HoffBot",
    botAvatar: row.bot_avatar || "🤖",
    botColor: sanitizeHexColor(row.bot_color, "#6366f1"),
    plugins: sanitizePlugins(parsed),
    updatedAt: row.updated_at,
  };
}

export async function saveCommunityBotConfig(
  db: D1Database,
  serverId: string,
  input: {
    enabled?: boolean;
    botName?: string;
    botAvatar?: string;
    botColor?: string;
    plugins?: unknown;
  },
): Promise<CommunityBotConfig> {
  const current = await getCommunityBotConfig(db, serverId);
  const enabled = input.enabled === undefined ? current.enabled : Boolean(input.enabled);
  const botName =
    typeof input.botName === "string" && input.botName.trim()
      ? input.botName.trim().slice(0, 40)
      : current.botName;
  const botAvatar =
    typeof input.botAvatar === "string" && input.botAvatar.trim()
      ? input.botAvatar.trim().slice(0, 8)
      : current.botAvatar;
  const botColor =
    input.botColor !== undefined
      ? sanitizeHexColor(input.botColor, current.botColor)
      : current.botColor;
  const rawPlugins = (input.plugins as Record<string, unknown>) || {};
  const plugins =
    input.plugins !== undefined
      ? sanitizePlugins({
          levels: { ...current.plugins.levels, ...((rawPlugins.levels as object) || {}) },
          welcome: { ...current.plugins.welcome, ...((rawPlugins.welcome as object) || {}) },
          reactionRoles: { ...current.plugins.reactionRoles, ...((rawPlugins.reactionRoles as object) || {}) },
          moderation: { ...current.plugins.moderation, ...((rawPlugins.moderation as object) || {}) },
          customCommands: { ...current.plugins.customCommands, ...((rawPlugins.customCommands as object) || {}) },
          embeds: { ...current.plugins.embeds, ...((rawPlugins.embeds as object) || {}) },
          timers: { ...current.plugins.timers, ...((rawPlugins.timers as object) || {}) },
          giveaways: { ...current.plugins.giveaways, ...((rawPlugins.giveaways as object) || {}) },
          starboard: { ...current.plugins.starboard, ...((rawPlugins.starboard as object) || {}) },
          ticketing: { ...current.plugins.ticketing, ...((rawPlugins.ticketing as object) || {}) },
          logs: { ...current.plugins.logs, ...((rawPlugins.logs as object) || {}) },
          economy: { ...current.plugins.economy, ...((rawPlugins.economy as object) || {}) },
          birthdays: { ...current.plugins.birthdays, ...((rawPlugins.birthdays as object) || {}) },
          tempVoice: { ...current.plugins.tempVoice, ...((rawPlugins.tempVoice as object) || {}) },
          serverStats: { ...current.plugins.serverStats, ...((rawPlugins.serverStats as object) || {}) },
        })
      : current.plugins;
  const updatedAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO community_bot_config
         (server_id, enabled, bot_name, bot_avatar, bot_color, plugins_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(server_id) DO UPDATE SET
         enabled = excluded.enabled,
         bot_name = excluded.bot_name,
         bot_avatar = excluded.bot_avatar,
         bot_color = excluded.bot_color,
         plugins_json = excluded.plugins_json,
         updated_at = excluded.updated_at`,
    )
    .bind(
      serverId,
      enabled ? 1 : 0,
      botName,
      botAvatar,
      botColor,
      JSON.stringify(plugins),
      updatedAt,
    )
    .run();

  return { serverId, enabled, botName, botAvatar, botColor, plugins, updatedAt };
}

export interface BotMessagePost {
  content?: string;
  embeds?: Array<Record<string, unknown>>;
  components?: Array<Record<string, unknown>>;
  commandText?: string | null;
  commandBy?: string | null;
  threadId?: string | null;
}

/**
 * Posts a message as the server's configured Community Bot into a text channel
 * and broadcasts it live over the Durable Object hub.
 */
export async function postCommunityBotMessage(
  db: D1Database,
  serverId: string,
  channelId: string,
  post: BotMessagePost,
  configOverride?: CommunityBotConfig,
): Promise<{ id: string } | null> {
  const channel = await db
    .prepare("SELECT id, name, server_id FROM channels WHERE id = ? AND server_id = ?")
    .bind(channelId, serverId)
    .first<{ id: string; name: string; server_id: string }>();
  if (!channel) return null;

  const config = configOverride ?? (await getCommunityBotConfig(db, serverId));
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const content = (post.content ?? "").slice(0, 4000);
  const payloadObj: Record<string, unknown> = {
    communityBot: true,
    botId: `community:${serverId}`,
  };
  if (post.embeds?.length) payloadObj.embeds = post.embeds;
  if (post.components?.length) payloadObj.components = post.components;
  const payloadStr = JSON.stringify(payloadObj);

  await db
    .prepare(
      `INSERT INTO messages
         (id, channel, channel_id, user_id, author, avatar, color, content,
          attachment_key, is_bot, created_at, payload, reply_to, thread_id,
          command_text, command_by, sender_id)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, 1, ?, ?, NULL, ?, ?, ?, NULL)`,
    )
    .bind(
      id,
      channel.name,
      channel.id,
      config.botName,
      config.botAvatar,
      config.botColor,
      content,
      createdAt,
      payloadStr,
      post.threadId ?? null,
      post.commandText ?? null,
      post.commandBy ?? null,
    )
    .run();

  const wire = {
    id,
    channel: channel.name,
    channelId: channel.id,
    userId: null,
    author: config.botName,
    avatar: config.botAvatar,
    color: config.botColor,
    text: content,
    bot: true,
    createdAt,
    payload: payloadObj,
    threadId: post.threadId || undefined,
    commandText: post.commandText || undefined,
    commandBy: post.commandBy || undefined,
  };

  try {
    await publishMessage(channel.id, wire, await channelAudience(db, channel.id));
  } catch {
    // Non-fatal in tests or when hub is unreachable.
  }

  return { id };
}

/** Updates an existing Community Bot message (e.g. when a reaction role panel is edited). */
export async function updateCommunityBotMessage(
  db: D1Database,
  serverId: string,
  channelId: string,
  messageId: string,
  post: BotMessagePost,
): Promise<boolean> {
  const existing = await db
    .prepare("SELECT id FROM messages WHERE id = ? AND channel_id = ? AND deleted_at IS NULL")
    .bind(messageId, channelId)
    .first<{ id: string }>();
  if (!existing) return false;

  const content = (post.content ?? "").slice(0, 4000);
  const payloadObj: Record<string, unknown> = {
    communityBot: true,
    botId: `community:${serverId}`,
  };
  if (post.embeds?.length) payloadObj.embeds = post.embeds;
  if (post.components?.length) payloadObj.components = post.components;
  const editedAt = new Date().toISOString();

  await db
    .prepare("UPDATE messages SET content = ?, payload = ?, edited_at = ? WHERE id = ?")
    .bind(content, JSON.stringify(payloadObj), editedAt, messageId)
    .run();

  try {
    await publishMessageEvent(
      channelId,
      { t: "edit", messageId, text: content, editedAt, payload: payloadObj },
      await channelAudience(db, channelId),
    );
  } catch {
    // Non-fatal in tests.
  }
  return true;
}

/** Assigns a role to a server member (if the role still exists in the server). */
export async function assignRoleToMember(
  db: D1Database,
  serverId: string,
  userId: string,
  roleId: string,
): Promise<boolean> {
  const role = await db
    .prepare("SELECT id FROM roles WHERE id = ? AND server_id = ?")
    .bind(roleId, serverId)
    .first<{ id: string }>();
  if (!role) return false;

  await db
    .prepare(
      "INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)",
    )
    .bind(serverId, userId, roleId)
    .run();

  try {
    await publishStructureChange(serverId);
  } catch {
    // Non-fatal in tests.
  }
  return true;
}

/** Removes a role from a server member. */
export async function removeRoleFromMember(
  db: D1Database,
  serverId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM member_roles WHERE server_id = ? AND user_id = ? AND role_id = ?",
    )
    .bind(serverId, userId, roleId)
    .run();

  try {
    await publishStructureChange(serverId);
  } catch {
    // Non-fatal in tests.
  }
}

/** Returns all role IDs currently held by a member in a server. */
export async function getMemberRoleIds(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?")
    .bind(serverId, userId)
    .all<{ role_id: string }>();
  return (results || []).map((r) => r.role_id);
}
