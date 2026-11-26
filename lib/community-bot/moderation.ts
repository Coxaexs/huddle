/**
 * Moderation & Warnings plugin:
 * - Issue / list / delete / clear warnings
 * - Automatic escalation rules (e.g., 3 warnings → 30m timeout, 5 → kick, 7 → ban)
 * - Mod-log channel posting
 * - Bulk message clear (`/clear <count>`)
 */

import { recordAudit } from "@/lib/audit";
import { channelAudience } from "@/lib/dms";
import { publishMessageEvent, publishStructureChange } from "@/lib/hub-client";
import { removeServerMember } from "@/lib/servers";
import { getCommunityBotConfig, postCommunityBotMessage } from "./store";
import type { CommunityWarning, WarnEscalationRule } from "./types";

export interface WarnResult {
  warning: CommunityWarning;
  totalWarnings: number;
  escalated?: {
    action: WarnEscalationRule["action"];
    durationMin?: number;
  };
}

/** Issues a warning, applies any matching escalation rule, and logs to mod-log. */
export async function issueWarning(
  db: D1Database,
  input: {
    serverId: string;
    userId: string;
    moderatorId: string;
    reason: string;
  },
): Promise<WarnResult> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const reason = input.reason.trim().slice(0, 500) || "No reason provided";

  await db
    .prepare(
      `INSERT INTO community_warnings (id, server_id, user_id, moderator_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.serverId, input.userId, input.moderatorId, reason, createdAt)
    .run();

  const [countRow, targetUser, modUser, config] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) as cnt FROM community_warnings WHERE server_id = ? AND user_id = ?")
      .bind(input.serverId, input.userId)
      .first<{ cnt: number }>(),
    db
      .prepare("SELECT username, display_name FROM users WHERE id = ?")
      .bind(input.userId)
      .first<{ username: string; display_name: string }>(),
    db
      .prepare("SELECT username, display_name FROM users WHERE id = ?")
      .bind(input.moderatorId)
      .first<{ username: string; display_name: string }>(),
    getCommunityBotConfig(db, input.serverId),
  ]);

  const totalWarnings = countRow?.cnt ?? 1;
  const warning: CommunityWarning = {
    id,
    serverId: input.serverId,
    userId: input.userId,
    username: targetUser?.username,
    displayName: targetUser?.display_name || targetUser?.username,
    moderatorId: input.moderatorId,
    moderatorName: modUser?.display_name || modUser?.username,
    reason,
    createdAt,
  };

  await recordAudit(db, {
    serverId: input.serverId,
    actor: { id: input.moderatorId, display_name: warning.moderatorName || input.moderatorId },
    action: "member.warn",
    targetId: input.userId,
    targetName: warning.displayName || input.userId,
    detail: `Warning #${totalWarnings}: ${reason}`,
  });

  // Check auto-escalation rules (never escalate on the server owner).
  let escalated: WarnResult["escalated"];
  const server = await db
    .prepare("SELECT created_by FROM servers WHERE id = ?")
    .bind(input.serverId)
    .first<{ created_by: string | null }>();

  if (
    config.enabled &&
    config.plugins.moderation.enabled &&
    server?.created_by !== input.userId
  ) {
    const rule = config.plugins.moderation.escalations.find(
      (r) => r.warns === totalWarnings,
    );
    if (rule) {
      if (rule.action === "timeout") {
        const mins = rule.durationMin ?? 30;
        const until = new Date(Date.now() + mins * 60_000).toISOString();
        await db
          .prepare(
            "UPDATE server_members SET timeout_until = ? WHERE server_id = ? AND user_id = ?",
          )
          .bind(until, input.serverId, input.userId)
          .run();
        escalated = { action: "timeout", durationMin: mins };
      } else if (rule.action === "kick") {
        await removeServerMember(db, input.serverId, input.userId);
        escalated = { action: "kick" };
      } else if (rule.action === "ban") {
        await db
          .prepare(
            "INSERT OR IGNORE INTO bans (server_id, user_id, banned_by, created_at) VALUES (?, ?, ?, ?)",
          )
          .bind(input.serverId, input.userId, input.moderatorId, createdAt)
          .run();
        await removeServerMember(db, input.serverId, input.userId);
        escalated = { action: "ban" };
      }
      try {
        await publishStructureChange(input.serverId);
      } catch {
        // Non-fatal in tests.
      }
    }
  }

  // Post to mod-log channel if configured.
  if (config.enabled && config.plugins.moderation.enabled && config.plugins.moderation.modLogChannelId) {
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: "Member", value: `${warning.displayName || input.userId} (@${warning.username || input.userId})`, inline: true },
      { name: "Moderator", value: warning.moderatorName || input.moderatorId, inline: true },
      { name: "Total Warnings", value: String(totalWarnings), inline: true },
      { name: "Reason", value: reason, inline: false },
    ];
    if (escalated) {
      fields.push({
        name: "Auto-Escalation",
        value:
          escalated.action === "timeout"
            ? `Timed out for ${escalated.durationMin} minutes`
            : escalated.action === "kick"
              ? "Kicked from server"
              : "Banned from server",
        inline: false,
      });
    }
    await postCommunityBotMessage(
      db,
      input.serverId,
      config.plugins.moderation.modLogChannelId,
      {
        content: "",
        embeds: [
          {
            title: "⚠️ Member Warned",
            color: escalated ? "#ef4444" : "#f59e0b",
            fields,
            timestamp: createdAt,
          },
        ],
      },
      config,
    );
  }

  return { warning, totalWarnings, escalated };
}

export async function listWarnings(
  db: D1Database,
  serverId: string,
  userId?: string,
  limit = 100,
): Promise<CommunityWarning[]> {
  const clamped = Math.max(1, Math.min(200, limit));
  const sql = userId
    ? `SELECT w.*, u.username, u.display_name, m.display_name AS mod_name, m.username AS mod_username
         FROM community_warnings w
         LEFT JOIN users u ON u.id = w.user_id
         LEFT JOIN users m ON m.id = w.moderator_id
        WHERE w.server_id = ? AND w.user_id = ?
        ORDER BY w.created_at DESC LIMIT ?`
    : `SELECT w.*, u.username, u.display_name, m.display_name AS mod_name, m.username AS mod_username
         FROM community_warnings w
         LEFT JOIN users u ON u.id = w.user_id
         LEFT JOIN users m ON m.id = w.moderator_id
        WHERE w.server_id = ?
        ORDER BY w.created_at DESC LIMIT ?`;

  const stmt = userId
    ? db.prepare(sql).bind(serverId, userId, clamped)
    : db.prepare(sql).bind(serverId, clamped);

  const { results } = await stmt.all<{
    id: string;
    server_id: string;
    user_id: string;
    moderator_id: string;
    reason: string;
    created_at: string;
    username: string | null;
    display_name: string | null;
    mod_name: string | null;
    mod_username: string | null;
  }>();

  return (results || []).map((r) => ({
    id: r.id,
    serverId: r.server_id,
    userId: r.user_id,
    username: r.username ?? undefined,
    displayName: r.display_name || r.username || r.user_id,
    moderatorId: r.moderator_id,
    moderatorName: r.mod_name || r.mod_username || r.moderator_id,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

export async function deleteWarning(
  db: D1Database,
  serverId: string,
  warningId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM community_warnings WHERE id = ? AND server_id = ?")
    .bind(warningId, serverId)
    .run();
}

export async function clearUserWarnings(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<number> {
  const res = await db
    .prepare("DELETE FROM community_warnings WHERE server_id = ? AND user_id = ?")
    .bind(serverId, userId)
    .run();
  return res.meta.changes ?? 0;
}

/** Soft-deletes the latest `count` messages in a channel (`/clear <count>`). */
export async function clearChannelMessages(
  db: D1Database,
  channelId: string,
  count: number,
): Promise<number> {
  const clamped = Math.max(1, Math.min(100, Math.floor(count)));
  const { results } = await db
    .prepare(
      `SELECT id FROM messages
        WHERE channel_id = ? AND deleted_at IS NULL AND thread_id IS NULL
        ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(channelId, clamped)
    .all<{ id: string }>();

  const ids = (results || []).map((r) => r.id);
  if (!ids.length) return 0;

  const now = new Date().toISOString();
  await db.batch(
    ids.map((id) =>
      db.prepare("UPDATE messages SET deleted_at = ? WHERE id = ?").bind(now, id),
    ),
  );

  try {
    const audience = await channelAudience(db, channelId);
    for (const id of ids) {
      await publishMessageEvent(channelId, { t: "delete", messageId: id }, audience);
    }
  } catch {
    // Non-fatal in tests.
  }

  return ids.length;
}
