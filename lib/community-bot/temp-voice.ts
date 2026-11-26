/**
 * Temporary Voice Channels ("Join to Create") plugin:
 * - Joining the configured creator voice channel spawns a personal temporary
 *   voice room and returns its ID so the hub moves the user straight into it.
 * - When the last member leaves a temporary voice room, it is deleted.
 */

import { publishStructureChange } from "@/lib/hub-client";
import { getCommunityBotConfig } from "./store";
import { renderTemplate } from "./types";

/**
 * If `joinedChannelId` is the server's configured Join-to-Create channel,
 * creates a new temporary voice channel and returns its ID.
 */
export async function maybeCreateTempVoiceChannel(
  db: D1Database,
  joinedChannelId: string,
  userId: string,
  displayName: string,
): Promise<{ channelId: string; serverId: string } | null> {
  const ch = await db
    .prepare("SELECT id, server_id, category_id, position FROM channels WHERE id = ? AND kind = 'voice'")
    .bind(joinedChannelId)
    .first<{ id: string; server_id: string | null; category_id: string | null; position: number }>();
  if (!ch?.server_id) return null;

  const config = await getCommunityBotConfig(db, ch.server_id);
  const tv = config.plugins.tempVoice;
  if (!config.enabled || !tv.enabled || tv.creatorChannelId !== joinedChannelId) {
    return null;
  }

  const newId = `tv-${crypto.randomUUID().slice(0, 12)}`;
  const name = renderTemplate(tv.nameTemplate || "🎙️ {username}'s Room", {
    user: displayName,
    username: displayName,
  }).slice(0, 60);
  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        `INSERT INTO channels (id, server_id, name, kind, topic, position, category_id, created_at)
         VALUES (?, ?, ?, 'voice', 'Temporary voice channel', ?, ?, ?)`,
      )
      .bind(newId, ch.server_id, name, (ch.position ?? 0) + 1, ch.category_id ?? null, now),
    db
      .prepare(
        "INSERT INTO community_temp_voice (channel_id, server_id, owner_id, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(newId, ch.server_id, userId, now),
  ]);

  try {
    await publishStructureChange(ch.server_id);
  } catch {
    // Non-fatal in tests.
  }

  return { channelId: newId, serverId: ch.server_id };
}

/**
 * Deletes a temporary voice channel once its participant count reaches 0.
 */
export async function maybeDeleteEmptyTempVoiceChannel(
  db: D1Database,
  channelId: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT channel_id, server_id FROM community_temp_voice WHERE channel_id = ?")
    .bind(channelId)
    .first<{ channel_id: string; server_id: string }>();
  if (!row) return false;

  await db.batch([
    db.prepare("DELETE FROM community_temp_voice WHERE channel_id = ?").bind(channelId),
    db.prepare("DELETE FROM channels WHERE id = ? AND server_id = ?").bind(channelId, row.server_id),
  ]);

  try {
    await publishStructureChange(row.server_id);
  } catch {
    // Non-fatal in tests.
  }
  return true;
}
