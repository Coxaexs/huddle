/**
 * Starboard plugin: highlights popular messages in a dedicated starboard
 * channel once they reach `threshold` reactions of the configured emoji.
 */

import {
  getCommunityBotConfig,
  postCommunityBotMessage,
  updateCommunityBotMessage,
} from "./store";

/**
 * Evaluates starboard status whenever a reaction is added or removed.
 */
export async function handleStarboardReaction(
  db: D1Database,
  input: {
    messageId: string;
    channelId: string;
    reactorUserId: string;
    emoji: string;
  },
): Promise<void> {
  const channel = await db
    .prepare("SELECT id, name, server_id FROM channels WHERE id = ?")
    .bind(input.channelId)
    .first<{ id: string; name: string; server_id: string | null }>();
  if (!channel?.server_id) return;

  const config = await getCommunityBotConfig(db, channel.server_id);
  const sb = config.plugins.starboard;
  if (!config.enabled || !sb.enabled || !sb.channelId) return;
  if (input.emoji !== sb.emoji) return;
  if (input.channelId === sb.channelId) return;
  if (sb.ignoredChannelIds.includes(input.channelId)) return;

  const msg = await db
    .prepare(
      "SELECT id, user_id, author, content, created_at FROM messages WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(input.messageId)
    .first<{
      id: string;
      user_id: string | null;
      author: string;
      content: string;
      created_at: string;
    }>();
  if (!msg) return;

  const countRow = sb.allowSelfStar || !msg.user_id
    ? await db
        .prepare("SELECT COUNT(*) as cnt FROM reactions WHERE message_id = ? AND emoji = ?")
        .bind(input.messageId, sb.emoji)
        .first<{ cnt: number }>()
    : await db
        .prepare(
          "SELECT COUNT(*) as cnt FROM reactions WHERE message_id = ? AND emoji = ? AND user_id != ?",
        )
        .bind(input.messageId, sb.emoji, msg.user_id)
        .first<{ cnt: number }>();

  const starCount = countRow?.cnt ?? 0;

  const existing = await db
    .prepare(
      "SELECT starboard_message_id, star_count FROM community_starboard_posts WHERE server_id = ? AND source_message_id = ?",
    )
    .bind(channel.server_id, input.messageId)
    .first<{ starboard_message_id: string; star_count: number }>();

  const embed = {
    author: { name: msg.author },
    description: msg.content || "*[Attachment / Embed]*",
    color: "#facc15",
    footer: { text: `${sb.emoji} ${starCount} · #${channel.name}` },
    timestamp: msg.created_at,
  };
  const header = `${sb.emoji} **${starCount}** in #${channel.name}`;

  if (existing) {
    if (existing.star_count !== starCount) {
      await updateCommunityBotMessage(
        db,
        channel.server_id,
        sb.channelId,
        existing.starboard_message_id,
        { content: header, embeds: [embed] },
      );
      await db
        .prepare(
          "UPDATE community_starboard_posts SET star_count = ? WHERE server_id = ? AND source_message_id = ?",
        )
        .bind(starCount, channel.server_id, input.messageId)
        .run();
    }
    return;
  }

  if (starCount < sb.threshold) return;

  const posted = await postCommunityBotMessage(
    db,
    channel.server_id,
    sb.channelId,
    { content: header, embeds: [embed] },
    config,
  );
  if (!posted) return;

  await db
    .prepare(
      `INSERT OR REPLACE INTO community_starboard_posts
         (server_id, source_message_id, starboard_message_id, star_count, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(channel.server_id, input.messageId, posted.id, starCount, new Date().toISOString())
    .run();
}
