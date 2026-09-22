/**
 * Fan-out to connected Discord bots.
 *
 * Payloads are serialized by the caller, in the request that caused the event,
 * because building a Discord message object needs joins against users, mentions
 * and reactions. The gateway object only filters by intent and scope and writes
 * to sockets.
 *
 * Every function here is best-effort: a bot that is not listening must never be
 * able to fail a user's message send.
 */
import { bindings } from "../storage";
import { DM_SERVER_ID } from "../schema";
import type { StoredMessage } from "../storage";
import { channelWithGuild, loadMentionedUsers, loadReactions, loadUser } from "./guild-data";
import { serializeMessage } from "./serialize";
import { snowflakeFor } from "./snowflake";

const INTERNAL = "https://hoffle.gateway";

function gateway(): DurableObjectStub | null {
  const namespace = bindings().DISCORD_GATEWAY;
  if (!namespace) return null;
  return namespace.get(namespace.idFromName("discord-gateway"));
}

export interface DispatchOptions {
  serverId?: string | null;
  isDm?: boolean;
  targetBotId?: string | null;
  excludeBotId?: string | null;
}

/**
 * Sends one already-serialized event to every eligible bot session.
 *
 * Returns how many sockets received it, which is the only way a caller can
 * tell "no bot is listening" from "the bot got it and said nothing".
 */
export async function dispatchToBots(
  event: string,
  data: unknown,
  options: DispatchOptions = {},
): Promise<number> {
  const stub = gateway();
  if (!stub) return 0;
  try {
    const response = await stub.fetch(`${INTERNAL}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data, ...options }),
    });
    if (!response.ok) return 0;
    const body = (await response.json()) as { delivered?: number };
    return body.delivered ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Serializes a stored message and dispatches it. Used by every path that
 * creates or edits a message, so bots see user chat, bot chat and bridged
 * messages identically.
 */
export async function dispatchMessage(
  event: "MESSAGE_CREATE" | "MESSAGE_UPDATE",
  message: StoredMessage,
  options: { origin?: string; basePath?: string; excludeBotId?: string | null } = {},
): Promise<void> {
  const db = bindings().DB;
  if (!db || !bindings().DISCORD_GATEWAY) return;

  const channelId = message.channel_id;
  if (!channelId) return;

  try {
    const located = await channelWithGuild(db, channelId);
    if (!located) return;

    const [author, mentions, reactions, channelSnowflake] = await Promise.all([
      message.user_id ? loadUser(db, message.user_id) : Promise.resolve(null),
      loadMentionedUsers(db, message.id),
      loadReactions(db, message.id),
      snowflakeFor("channel", channelId, located.channel.created_at),
    ]);

    const guildSnowflake = located.server
      ? await snowflakeFor("guild", located.server.id, located.server.created_at)
      : null;

    const payload = await serializeMessage(message, {
      channelSnowflake,
      guildSnowflake,
      author,
      mentions,
      reactions,
      origin: options.origin,
      basePath: options.basePath,
    });

    await dispatchToBots(event, payload, {
      serverId: located.server?.id ?? DM_SERVER_ID,
      isDm: located.isDm,
      excludeBotId: options.excludeBotId ?? null,
    });
  } catch {
    // Never let bot fan-out break the request that produced the message.
  }
}

/** MESSAGE_DELETE carries only ids, so it needs no message row. */
export async function dispatchMessageDelete(
  messageId: string,
  channelId: string,
): Promise<void> {
  const db = bindings().DB;
  if (!db || !bindings().DISCORD_GATEWAY) return;
  try {
    const located = await channelWithGuild(db, channelId);
    if (!located) return;
    const [id, channelSnowflake] = await Promise.all([
      snowflakeFor("message", messageId),
      snowflakeFor("channel", channelId, located.channel.created_at),
    ]);
    const guildSnowflake = located.server
      ? await snowflakeFor("guild", located.server.id, located.server.created_at)
      : undefined;
    await dispatchToBots(
      "MESSAGE_DELETE",
      { id, channel_id: channelSnowflake, guild_id: guildSnowflake },
      { serverId: located.server?.id ?? DM_SERVER_ID, isDm: located.isDm },
    );
  } catch {
    // Best effort.
  }
}

/** MESSAGE_REACTION_ADD / _REMOVE for a single emoji by a single user. */
export async function dispatchReaction(
  event: "MESSAGE_REACTION_ADD" | "MESSAGE_REACTION_REMOVE",
  input: { messageId: string; channelId: string; userId: string; emoji: string },
): Promise<void> {
  const db = bindings().DB;
  if (!db || !bindings().DISCORD_GATEWAY) return;
  try {
    const located = await channelWithGuild(db, input.channelId);
    if (!located) return;
    const [messageId, channelSnowflake, userId] = await Promise.all([
      snowflakeFor("message", input.messageId),
      snowflakeFor("channel", input.channelId, located.channel.created_at),
      snowflakeFor("user", input.userId),
    ]);
    const guildSnowflake = located.server
      ? await snowflakeFor("guild", located.server.id, located.server.created_at)
      : undefined;
    await dispatchToBots(
      event,
      {
        user_id: userId,
        channel_id: channelSnowflake,
        message_id: messageId,
        guild_id: guildSnowflake,
        emoji: { id: null, name: input.emoji },
        burst: false,
        type: 0,
      },
      { serverId: located.server?.id ?? DM_SERVER_ID, isDm: located.isDm },
    );
  } catch {
    // Best effort.
  }
}

/** TYPING_START, which moderation and logging bots listen for. */
export async function dispatchTyping(
  channelId: string,
  userId: string,
): Promise<void> {
  const db = bindings().DB;
  if (!db || !bindings().DISCORD_GATEWAY) return;
  try {
    const located = await channelWithGuild(db, channelId);
    if (!located) return;
    const [channelSnowflake, user] = await Promise.all([
      snowflakeFor("channel", channelId, located.channel.created_at),
      snowflakeFor("user", userId),
    ]);
    await dispatchToBots(
      "TYPING_START",
      {
        channel_id: channelSnowflake,
        guild_id: located.server
          ? await snowflakeFor("guild", located.server.id, located.server.created_at)
          : undefined,
        user_id: user,
        timestamp: Math.floor(Date.now() / 1000),
      },
      { serverId: located.server?.id ?? DM_SERVER_ID, isDm: located.isDm },
    );
  } catch {
    // Best effort.
  }
}

/**
 * Loads a message by id and dispatches it. Used by callers that only hold a
 * partial row (an edit handler selecting the few columns it needed to
 * authorise the change) rather than the whole message.
 */
export async function dispatchMessageById(
  event: "MESSAGE_CREATE" | "MESSAGE_UPDATE",
  messageId: string,
  options: { origin?: string; basePath?: string } = {},
): Promise<void> {
  const db = bindings().DB;
  if (!db || !bindings().DISCORD_GATEWAY) return;
  const row = await db
    .prepare(
      `SELECT id, channel, channel_id, user_id, author, avatar, color, content,
              attachment_key, is_bot, created_at, link, action_label, audio_url,
              kind, payload, pinned_at, deleted_at, reply_to, edited_at,
              attachments, thread_id, command_text, command_by
       FROM messages WHERE id = ?`,
    )
    .bind(messageId)
    .first<StoredMessage>();
  if (!row) return;
  await dispatchMessage(event, row, options);
}
