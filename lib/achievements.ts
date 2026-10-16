/**
 * Earned achievements: badges a member unlocks through activity (messages sent,
 * time in voice, servers joined, reports resolved, …).
 *
 * Unlike `pride_badges` (chosen cosmetics), achievements are granted by the
 * server when a condition is met and cannot be removed by the member.
 */

import { bindings } from "./storage";

export interface AchievementDef {
  id: string;
  label: string;
  description: string;
  /** Small lucide icon name rendered beside the badge. */
  icon: string;
  condition: {
    type: "messages_sent" | "voice_seconds" | "servers_joined" | "days_active" | "reports_resolved";
    threshold: number;
  };
}

export interface UserAchievement {
  achievementId: string;
  earnedAt: string;
}

export interface AchievementProgress {
  def: AchievementDef;
  earned: boolean;
  earnedAt: string | null;
  current: number;
  /** 0..1 progress toward the next unearned achievement. */
  progress: number;
}

/** Every achievement Hoffle can award. Thresholds are cumulative lifetime totals. */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-steps",
    label: "First Steps",
    description: "Send your first message.",
    icon: "MessageSquare",
    condition: { type: "messages_sent", threshold: 1 },
  },
  {
    id: "chatterbox",
    label: "Chatterbox",
    description: "Send 100 messages.",
    icon: "MessageSquare",
    condition: { type: "messages_sent", threshold: 100 },
  },
  {
    id: "big-talker",
    label: "Big Talker",
    description: "Send 1,000 messages.",
    icon: "MessageSquare",
    condition: { type: "messages_sent", threshold: 1000 },
  },
  {
    id: "voice-newcomer",
    label: "Voice Newcomer",
    description: "Spend 1 hour in voice chat.",
    icon: "Mic",
    condition: { type: "voice_seconds", threshold: 60 * 60 },
  },
  {
    id: "voice-regular",
    label: "Voice Regular",
    description: "Spend 10 hours in voice chat.",
    icon: "Mic",
    condition: { type: "voice_seconds", threshold: 10 * 60 * 60 },
  },
  {
    id: "voice-veteran",
    label: "Voice Veteran",
    description: "Spend 100 hours in voice chat.",
    icon: "Mic",
    condition: { type: "voice_seconds", threshold: 100 * 60 * 60 },
  },
  {
    id: "social-butterfly",
    label: "Social Butterfly",
    description: "Join 5 servers.",
    icon: "Users",
    condition: { type: "servers_joined", threshold: 5 },
  },
  {
    id: "weekender",
    label: "Weekender",
    description: "Be active on 7 distinct days.",
    icon: "Calendar",
    condition: { type: "days_active", threshold: 7 },
  },
  {
    id: "helpful-hand",
    label: "Helpful Hand",
    description: "Resolve 5 member reports as a moderator.",
    icon: "CheckCircle2",
    condition: { type: "reports_resolved", threshold: 5 },
  },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((d) => [d.id, d]));

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_BY_ID.get(id);
}

export function allAchievements(): AchievementDef[] {
  return [...ACHIEVEMENTS];
}

/** Add `seconds` of voice time to a user's lifetime total. */
export async function addVoiceSeconds(
  db: D1Database,
  userId: string,
  seconds: number,
): Promise<void> {
  if (!seconds || seconds <= 0) return;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO user_voice_seconds (user_id, seconds, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET seconds = seconds + excluded.seconds, updated_at = excluded.updated_at`,
    )
    .bind(userId, seconds, now)
    .run();
}

/**
 * Recompute a user's progress and grant any newly earned achievements.
 * Returns the ids of achievements earned in this call.
 */
export async function evaluateAndAward(
  db: D1Database,
  userId: string,
): Promise<string[]> {
  const now = new Date().toISOString();

  const messageCount = await db
    .prepare("SELECT COUNT(*) AS count FROM messages WHERE user_id = ? AND deleted_at IS NULL")
    .bind(userId)
    .first<{ count: number }>();

  const voiceRow = await db
    .prepare("SELECT seconds FROM user_voice_seconds WHERE user_id = ?")
    .bind(userId)
    .first<{ seconds: number }>();

  const serverCount = await db
    .prepare("SELECT COUNT(*) AS count FROM server_members WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();

  const daysActive = await db
    .prepare(
      `SELECT COUNT(DISTINCT date(created_at)) AS count FROM messages
         WHERE user_id = ? AND deleted_at IS NULL`,
    )
    .bind(userId)
    .first<{ count: number }>();

  const reportsResolved = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM message_reports
         WHERE resolved_by = ? AND status = 'resolved'`,
    )
    .bind(userId)
    .first<{ count: number }>();

  const stats: Record<string, number> = {
    messages_sent: messageCount?.count ?? 0,
    voice_seconds: voiceRow?.seconds ?? 0,
    servers_joined: serverCount?.count ?? 0,
    days_active: daysActive?.count ?? 0,
    reports_resolved: reportsResolved?.count ?? 0,
  };

  const earned = await db
    .prepare("SELECT achievement_id FROM user_achievements WHERE user_id = ?")
    .bind(userId)
    .all<{ achievement_id: string }>();
  const alreadyEarned = new Set((earned.results || []).map((r) => r.achievement_id));

  const newlyEarned: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (alreadyEarned.has(def.id)) continue;
    if (stats[def.condition.type] >= def.condition.threshold) {
      await db
        .prepare(
          "INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, earned_at) VALUES (?, ?, ?)",
        )
        .bind(userId, def.id, now)
        .run();
      newlyEarned.push(def.id);
    }
  }
  return newlyEarned;
}

/** Everything the client needs to render a user's achievement board. */
export async function listUserAchievements(
  db: D1Database,
  userId: string,
): Promise<AchievementProgress[]> {
  await evaluateAndAward(db, userId);

  const messageCount = await db
    .prepare("SELECT COUNT(*) AS count FROM messages WHERE user_id = ? AND deleted_at IS NULL")
    .bind(userId)
    .first<{ count: number }>();

  const voiceRow = await db
    .prepare("SELECT seconds FROM user_voice_seconds WHERE user_id = ?")
    .bind(userId)
    .first<{ seconds: number }>();

  const serverCount = await db
    .prepare("SELECT COUNT(*) AS count FROM server_members WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();

  const daysActive = await db
    .prepare(
      `SELECT COUNT(DISTINCT date(created_at)) AS count FROM messages
         WHERE user_id = ? AND deleted_at IS NULL`,
    )
    .bind(userId)
    .first<{ count: number }>();

  const reportsResolved = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM message_reports
         WHERE resolved_by = ? AND status = 'resolved'`,
    )
    .bind(userId)
    .first<{ count: number }>();

  const stats: Record<string, number> = {
    messages_sent: messageCount?.count ?? 0,
    voice_seconds: voiceRow?.seconds ?? 0,
    servers_joined: serverCount?.count ?? 0,
    days_active: daysActive?.count ?? 0,
    reports_resolved: reportsResolved?.count ?? 0,
  };

  const earned = await db
    .prepare("SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = ?")
    .bind(userId)
    .all<{ achievement_id: string; earned_at: string }>();
  const earnedById = new Map(
    (earned.results || []).map((r) => [r.achievement_id, r.earned_at]),
  );

  return ACHIEVEMENTS.map((def) => {
    const earnedAt = earnedById.get(def.id) ?? null;
    const current = stats[def.condition.type];
    const earned = Boolean(earnedAt);
    const progress = earned
      ? 1
      : Math.min(1, current / def.condition.threshold);
    return { def, earned, earnedAt, current, progress };
  });
}
