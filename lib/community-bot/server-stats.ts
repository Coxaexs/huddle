/**
 * Server Stats Channels plugin: automatically renames designated counter
 * channels with live member, online, and channel counts.
 */

import { publishStructureChange } from "@/lib/hub-client";
import { getCommunityBotConfig } from "./store";

export async function syncServerStats(
  db: D1Database,
  serverId: string,
  onlineUserIds?: Set<string>,
): Promise<number> {
  const config = await getCommunityBotConfig(db, serverId);
  const ss = config.plugins.serverStats;
  if (!config.enabled || !ss.enabled) return 0;

  let updated = 0;

  async function renameIfChanged(channelId: string | null, template: string, count: number) {
    if (!channelId) return;
    const targetName = template.replace(/\{count\}/g, count.toLocaleString()).slice(0, 64);
    const current = await db
      .prepare("SELECT name FROM channels WHERE id = ? AND server_id = ?")
      .bind(channelId, serverId)
      .first<{ name: string }>();
    if (!current || current.name === targetName) return;

    await db
      .prepare("UPDATE channels SET name = ? WHERE id = ? AND server_id = ?")
      .bind(targetName, channelId, serverId)
      .run();
    updated++;
  }

  if (ss.memberCountChannelId || ss.onlineCountChannelId) {
    const { results } = await db
      .prepare("SELECT user_id FROM server_members WHERE server_id = ?")
      .bind(serverId)
      .all<{ user_id: string }>();
    const memberIds = (results || []).map((r) => r.user_id);

    if (ss.memberCountChannelId) {
      await renameIfChanged(ss.memberCountChannelId, ss.memberCountTemplate, memberIds.length);
    }
    if (ss.onlineCountChannelId) {
      const onlineCount = onlineUserIds
        ? memberIds.filter((id) => onlineUserIds.has(id)).length
        : 0;
      await renameIfChanged(ss.onlineCountChannelId, ss.onlineCountTemplate, onlineCount);
    }
  }

  if (ss.channelCountChannelId) {
    const row = await db
      .prepare("SELECT COUNT(*) as cnt FROM channels WHERE server_id = ?")
      .bind(serverId)
      .first<{ cnt: number }>();
    await renameIfChanged(ss.channelCountChannelId, ss.channelCountTemplate, row?.cnt ?? 0);
  }

  if (updated > 0) {
    try {
      await publishStructureChange(serverId);
    } catch {
      // Non-fatal in tests.
    }
  }
  return updated;
}

/** Called periodically from HuddleHub's alarm to keep all enabled servers' stat channels fresh. */
export async function syncAllServerStats(
  db: D1Database,
  onlineUserIds?: Set<string>,
): Promise<number> {
  const { results } = await db
    .prepare("SELECT server_id FROM community_bot_config WHERE enabled = 1")
    .all<{ server_id: string }>();
  let total = 0;
  for (const row of results || []) {
    total += await syncServerStats(db, row.server_id, onlineUserIds);
  }
  return total;
}
