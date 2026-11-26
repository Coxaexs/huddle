/**
 * Levels & XP plugin: message/voice XP accrual with cooldowns, multipliers,
 * ignored channels/roles, level-up announcements, automatic role rewards,
 * rank lookup, and leaderboard queries.
 */

import {
  assignRoleToMember,
  getCommunityBotConfig,
  getMemberRoleIds,
  postCommunityBotMessage,
  removeRoleFromMember,
} from "./store";
import {
  type LeaderboardEntry,
  levelFromXp,
  renderProgressBar,
  renderTemplate,
} from "./types";

export interface XpAwardResult {
  awarded: boolean;
  xpGained: number;
  totalXp: number;
  oldLevel: number;
  newLevel: number;
  leveledUp: boolean;
}

/**
 * Awards XP for a human message in a server text channel if the bot & Levels
 * plugin are enabled and the user is off cooldown.
 */
export async function awardMessageXp(
  db: D1Database,
  input: {
    serverId: string;
    channelId: string;
    userId: string;
    displayName: string;
    username: string;
    now?: number;
    random?: () => number;
  },
): Promise<XpAwardResult> {
  const noOp: XpAwardResult = {
    awarded: false,
    xpGained: 0,
    totalXp: 0,
    oldLevel: 0,
    newLevel: 0,
    leveledUp: false,
  };

  const config = await getCommunityBotConfig(db, input.serverId);
  if (!config.enabled || !config.plugins.levels.enabled) return noOp;

  const lv = config.plugins.levels;
  if (lv.ignoredChannelIds.includes(input.channelId)) return noOp;

  if (lv.ignoredRoleIds.length > 0) {
    const memberRoles = await getMemberRoleIds(db, input.serverId, input.userId);
    if (memberRoles.some((rid) => lv.ignoredRoleIds.includes(rid))) {
      return noOp;
    }
  }

  const now = input.now ?? Date.now();
  const existing = await db
    .prepare(
      "SELECT xp, level, messages, last_xp_at FROM community_xp WHERE server_id = ? AND user_id = ?",
    )
    .bind(input.serverId, input.userId)
    .first<{ xp: number; level: number; messages: number; last_xp_at: number }>();

  const cooldownMs = lv.cooldownSec * 1000;
  if (existing && now - existing.last_xp_at < cooldownMs) {
    // Still increment message count even while on XP cooldown.
    await db
      .prepare(
        "UPDATE community_xp SET messages = messages + 1 WHERE server_id = ? AND user_id = ?",
      )
      .bind(input.serverId, input.userId)
      .run();
    return {
      awarded: false,
      xpGained: 0,
      totalXp: existing.xp,
      oldLevel: existing.level,
      newLevel: existing.level,
      leveledUp: false,
    };
  }

  const rand = input.random ?? Math.random;
  const baseXp = lv.minXp + Math.floor(rand() * (lv.maxXp - lv.minXp + 1));
  const xpGained = Math.max(1, Math.round(baseXp * lv.multiplier));
  const oldXp = existing?.xp ?? 0;
  const oldLevel = existing?.level ?? levelFromXp(oldXp).level;
  const totalXp = oldXp + xpGained;
  const { level: newLevel } = levelFromXp(totalXp);

  await db
    .prepare(
      `INSERT INTO community_xp (server_id, user_id, xp, level, messages, voice_minutes, last_xp_at)
       VALUES (?, ?, ?, ?, 1, 0, ?)
       ON CONFLICT(server_id, user_id) DO UPDATE SET
         xp = excluded.xp,
         level = excluded.level,
         messages = community_xp.messages + 1,
         last_xp_at = excluded.last_xp_at`,
    )
    .bind(input.serverId, input.userId, totalXp, newLevel, now)
    .run();

  const leveledUp = newLevel > oldLevel;
  if (leveledUp) {
    await applyRoleRewards(db, input.serverId, input.userId, newLevel, lv.roleRewards, lv.stackRoleRewards);
    await announceLevelUp(db, {
      config,
      serverId: input.serverId,
      channelId: input.channelId,
      displayName: input.displayName,
      username: input.username,
      newLevel,
      totalXp,
    });
  }

  return { awarded: true, xpGained, totalXp, oldLevel, newLevel, leveledUp };
}

/** Syncs level role rewards for a member at `level`. */
export async function applyRoleRewards(
  db: D1Database,
  serverId: string,
  userId: string,
  level: number,
  roleRewards: Array<{ level: number; roleId: string }>,
  stack: boolean,
): Promise<void> {
  if (!roleRewards.length) return;
  const earned = roleRewards.filter((r) => r.level <= level);
  if (!earned.length) return;

  if (stack) {
    for (const reward of earned) {
      await assignRoleToMember(db, serverId, userId, reward.roleId);
    }
  } else {
    // Only keep the highest earned reward role; remove lower reward roles.
    const highest = earned[earned.length - 1];
    for (const reward of roleRewards) {
      if (reward.roleId !== highest.roleId) {
        await removeRoleFromMember(db, serverId, userId, reward.roleId);
      }
    }
    await assignRoleToMember(db, serverId, userId, highest.roleId);
  }
}

async function announceLevelUp(
  db: D1Database,
  input: {
    config: Awaited<ReturnType<typeof getCommunityBotConfig>>;
    serverId: string;
    channelId: string;
    displayName: string;
    username: string;
    newLevel: number;
    totalXp: number;
  },
): Promise<void> {
  const lv = input.config.plugins.levels;
  if (lv.announceMode === "off" || lv.announceMode === "dm") return;

  const targetChannelId =
    lv.announceMode === "channel" && lv.announceChannelId
      ? lv.announceChannelId
      : input.channelId;

  const server = await db
    .prepare("SELECT name FROM servers WHERE id = ?")
    .bind(input.serverId)
    .first<{ name: string }>();

  const text = renderTemplate(lv.levelUpMessage, {
    user: `@${input.username}`,
    username: input.displayName,
    server: server?.name ?? "this server",
    level: input.newLevel,
    xp: input.totalXp,
  });

  await postCommunityBotMessage(
    db,
    input.serverId,
    targetChannelId,
    {
      content: text,
      embeds: [
        {
          title: `🎉 Level Up! — Level ${input.newLevel}`,
          description: text,
          color: lv.rankCardColor,
          footer: { text: `${input.displayName} · ${input.totalXp.toLocaleString()} total XP` },
        },
      ],
    },
    input.config,
  );
}

/** Fetches ranked leaderboard entries for a server. */
export async function getServerLeaderboard(
  db: D1Database,
  serverId: string,
  limit = 100,
  offset = 0,
): Promise<LeaderboardEntry[]> {
  const clampedLimit = Math.max(1, Math.min(200, limit));
  const clampedOffset = Math.max(0, offset);
  const { results } = await db
    .prepare(
      `SELECT x.user_id, x.xp, x.level, x.messages, x.voice_minutes,
              u.username, u.display_name, u.avatar, u.avatar_url, u.color
         FROM community_xp x
         JOIN users u ON u.id = x.user_id
        WHERE x.server_id = ?
        ORDER BY x.xp DESC, x.messages DESC, u.username ASC
        LIMIT ? OFFSET ?`,
    )
    .bind(serverId, clampedLimit, clampedOffset)
    .all<{
      user_id: string;
      xp: number;
      level: number;
      messages: number;
      voice_minutes: number;
      username: string;
      display_name: string;
      avatar: string;
      avatar_url: string | null;
      color: string;
    }>();

  return (results || []).map((row, idx) => {
    const calc = levelFromXp(row.xp);
    return {
      rank: clampedOffset + idx + 1,
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatar: row.avatar || "🙂",
      avatarUrl: row.avatar_url || null,
      color: row.color || "#6366f1",
      xp: row.xp,
      level: calc.level,
      messages: row.messages,
      voiceMinutes: row.voice_minutes,
      currentLevelXp: calc.currentLevelXp,
      nextLevelXp: calc.nextLevelXp,
      progressPct: calc.progressPct,
    };
  });
}

/** Fetches a single user's rank & XP stats in a server. */
export async function getUserRank(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<LeaderboardEntry | null> {
  const user = await db
    .prepare("SELECT id, username, display_name, avatar, avatar_url, color FROM users WHERE id = ?")
    .bind(userId)
    .first<{
      id: string;
      username: string;
      display_name: string;
      avatar: string;
      avatar_url: string | null;
      color: string;
    }>();
  if (!user) return null;

  const row = await db
    .prepare(
      "SELECT xp, level, messages, voice_minutes FROM community_xp WHERE server_id = ? AND user_id = ?",
    )
    .bind(serverId, userId)
    .first<{ xp: number; level: number; messages: number; voice_minutes: number }>();

  const xp = row?.xp ?? 0;
  const calc = levelFromXp(xp);
  const higher = await db
    .prepare("SELECT COUNT(*) as cnt FROM community_xp WHERE server_id = ? AND xp > ?")
    .bind(serverId, xp)
    .first<{ cnt: number }>();

  return {
    rank: (higher?.cnt ?? 0) + 1,
    userId: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
    avatar: user.avatar || "🙂",
    avatarUrl: user.avatar_url || null,
    color: user.color || "#6366f1",
    xp,
    level: calc.level,
    messages: row?.messages ?? 0,
    voiceMinutes: row?.voice_minutes ?? 0,
    currentLevelXp: calc.currentLevelXp,
    nextLevelXp: calc.nextLevelXp,
    progressPct: calc.progressPct,
  };
}

/** Admin action: set or add XP for a member. */
export async function setMemberXp(
  db: D1Database,
  serverId: string,
  userId: string,
  xp: number,
): Promise<{ xp: number; level: number }> {
  const safeXp = Math.max(0, Math.min(100_000_000, Math.round(xp)));
  const { level } = levelFromXp(safeXp);
  await db
    .prepare(
      `INSERT INTO community_xp (server_id, user_id, xp, level, messages, voice_minutes, last_xp_at)
       VALUES (?, ?, ?, ?, 0, 0, 0)
       ON CONFLICT(server_id, user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level`,
    )
    .bind(serverId, userId, safeXp, level)
    .run();

  const config = await getCommunityBotConfig(db, serverId);
  if (config.enabled && config.plugins.levels.enabled) {
    await applyRoleRewards(
      db,
      serverId,
      userId,
      level,
      config.plugins.levels.roleRewards,
      config.plugins.levels.stackRoleRewards,
    );
  }
  return { xp: safeXp, level };
}

/** Admin action: reset XP for one user or the entire server. */
export async function resetXp(
  db: D1Database,
  serverId: string,
  userId?: string,
): Promise<void> {
  if (userId) {
    await db
      .prepare("DELETE FROM community_xp WHERE server_id = ? AND user_id = ?")
      .bind(serverId, userId)
      .run();
  } else {
    await db
      .prepare("DELETE FROM community_xp WHERE server_id = ?")
      .bind(serverId)
      .run();
  }
}

/** Builds the rich `/rank` embed for chat. */
export function buildRankEmbed(entry: LeaderboardEntry, accentColor: string): Record<string, unknown> {
  return {
    title: `${entry.displayName} — Rank #${entry.rank}`,
    description: `**Level ${entry.level}**\n\`${renderProgressBar(entry.progressPct)}\`\n${entry.currentLevelXp.toLocaleString()} / ${entry.nextLevelXp.toLocaleString()} XP to Level ${entry.level + 1}`,
    color: accentColor,
    fields: [
      { name: "Total XP", value: entry.xp.toLocaleString(), inline: true },
      { name: "Messages", value: entry.messages.toLocaleString(), inline: true },
      { name: "Server Rank", value: `#${entry.rank}`, inline: true },
    ],
    footer: { text: `@${entry.username}` },
  };
}
