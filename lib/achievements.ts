/**
 * Earned achievements: badges a member unlocks through activity (messages sent,
 * time in voice, servers joined, reports resolved, …).
 *
 * Unlike `pride_badges` (chosen cosmetics), achievements are granted by the
 * server when a condition is met and cannot be removed by the member. The
 * catalogue itself is in `achievement-defs.ts` so client code can import it.
 */

import {
  ACHIEVEMENTS,
  MARK_KINDS,
  getAchievement,
  normalizeShowcase,
  type AchievementDef,
  type AchievementStat,
  type MarkKind,
} from "./achievement-defs";
import { publishAchievements } from "./hub-client";

export {
  ACHIEVEMENTS,
  allAchievements,
  getAchievement,
  normalizeShowcase,
  SHOWCASE_LIMIT,
  type AchievementDef,
} from "./achievement-defs";

export interface UserAchievement {
  achievementId: string;
  earnedAt: string;
}

export interface AchievementProgress {
  def: AchievementDef;
  earned: boolean;
  earnedAt: string | null;
  current: number;
  /** 0..1 progress toward this achievement. */
  progress: number;
}

/**
 * Stats are loaded in groups, so a message send only re-reads the member's
 * messages instead of every table the catalogue touches.
 */
export type StatSource =
  | "messages"
  | "days"
  | "voice"
  | "reactions"
  | "people"
  | "community"
  | "creator"
  | "account"
  | "marks";

type Stats = Partial<Record<AchievementStat, number>>;

interface Context {
  db: D1Database;
  userId: string;
  /** SQLite date modifier that shifts UTC to the member's local time. */
  local: string;
}

/** Minutes east of UTC (from the client's X-Hoffle-Tz header) → a date modifier. */
export function tzModifier(offsetMinutes: number | null | undefined): string {
  const minutes = Number.isFinite(offsetMinutes) ? Math.max(-840, Math.min(840, Math.round(offsetMinutes!))) : 0;
  return `${minutes >= 0 ? "+" : "-"}${Math.abs(minutes)} minutes`;
}

/** Reads the client's timezone offset header, if any. */
export function tzFromRequest(request: Request): number {
  const raw = Number(request.headers.get("x-hoffle-tz"));
  return Number.isFinite(raw) ? raw : 0;
}

async function count(db: D1Database, sql: string, ...params: unknown[]): Promise<number> {
  try {
    const row = await db.prepare(sql).bind(...params).first<{ count: number | null }>();
    return Number(row?.count ?? 0);
  } catch {
    // A table that does not exist yet (or a failed read) just counts as zero.
    return 0;
  }
}

/** Longest run of consecutive YYYY-MM-DD dates in a sorted list. */
export function longestStreak(days: string[]): number {
  let best = 0;
  let run = 0;
  let previous = 0;
  for (const day of days) {
    const time = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(time)) continue;
    run = previous && time - previous === 86_400_000 ? run + 1 : 1;
    previous = time;
    best = Math.max(best, run);
  }
  return best;
}

const SOURCES: Record<StatSource, (ctx: Context) => Promise<Stats>> = {
  async messages({ db, userId, local }) {
    try {
      const row = await db
        .prepare(
          `SELECT
             COUNT(*) AS messages_sent,
             SUM(CASE WHEN reply_to IS NOT NULL AND reply_to <> '' THEN 1 ELSE 0 END) AS replies,
             SUM(CASE WHEN (attachment_key IS NOT NULL AND attachment_key <> '') OR (attachments IS NOT NULL AND attachments NOT IN ('', '[]')) THEN 1 ELSE 0 END) AS attachments,
             SUM(CASE WHEN content LIKE '%tenor.com%' OR content LIKE '%giphy.com%' OR content LIKE '%.gif%' THEN 1 ELSE 0 END) AS gifs,
             SUM(CASE WHEN content LIKE '%http://%' OR content LIKE '%https://%' THEN 1 ELSE 0 END) AS links,
             SUM(CASE WHEN length(content) >= 500 THEN 1 ELSE 0 END) AS long_messages,
             SUM(CASE WHEN edited_at IS NOT NULL THEN 1 ELSE 0 END) AS edits,
             SUM(CASE WHEN rtrim(content) LIKE '%?' THEN 1 ELSE 0 END) AS questions,
             SUM(CASE WHEN thread_id IS NOT NULL AND thread_id <> '' THEN 1 ELSE 0 END) AS threads,
             SUM(CASE WHEN pinned_at IS NOT NULL THEN 1 ELSE 0 END) AS pinned_messages,
             COUNT(DISTINCT channel_id) AS channels_posted,
             SUM(CASE WHEN CAST(strftime('%H', created_at, ?1) AS INTEGER) BETWEEN 1 AND 4 THEN 1 ELSE 0 END) AS night_owl,
             SUM(CASE WHEN CAST(strftime('%H', created_at, ?1) AS INTEGER) BETWEEN 5 AND 7 THEN 1 ELSE 0 END) AS early_bird,
             SUM(CASE WHEN strftime('%w', created_at, ?1) IN ('0', '6') THEN 1 ELSE 0 END) AS weekend_messages,
             SUM(CASE WHEN length(content) >= 12 AND content = upper(content) AND content <> lower(content) AND content NOT LIKE '%http%' THEN 1 ELSE 0 END) AS caps_messages,
             SUM(CASE WHEN lower(trim(content, ' !.')) IN ('hello world', 'hello, world') THEN 1 ELSE 0 END) AS hello_world,
             SUM(CASE WHEN strftime('%H:%M', created_at, ?1) = '00:00' THEN 1 ELSE 0 END) AS midnight
           FROM messages
           WHERE user_id = ?2 AND deleted_at IS NULL AND is_bot = 0`,
        )
        .bind(local, userId)
        .first<Record<string, number | null>>();
      const stats: Stats = {};
      for (const [key, value] of Object.entries(row || {})) {
        stats[key as AchievementStat] = Number(value ?? 0);
      }
      return stats;
    } catch {
      return {};
    }
  },

  async days({ db, userId, local }) {
    try {
      const rows = await db
        .prepare(
          `SELECT date(created_at, ?) AS day, COUNT(*) AS count FROM messages
             WHERE user_id = ? AND deleted_at IS NULL AND is_bot = 0
             GROUP BY day ORDER BY day`,
        )
        .bind(local, userId)
        .all<{ day: string; count: number }>();
      const list = rows.results || [];
      return {
        days_active: list.length,
        streak_days: longestStreak(list.map((r) => r.day)),
        max_per_day: list.reduce((best, r) => Math.max(best, Number(r.count)), 0),
      };
    } catch {
      return {};
    }
  },

  async voice({ db, userId }) {
    return {
      voice_seconds: await count(db, "SELECT seconds AS count FROM user_voice_seconds WHERE user_id = ?", userId),
    };
  },

  async reactions({ db, userId }) {
    let given = 0;
    let unique = 0;
    try {
      const row = await db
        .prepare("SELECT COUNT(*) AS given, COUNT(DISTINCT emoji) AS uniq FROM reactions WHERE user_id = ?")
        .bind(userId)
        .first<{ given: number; uniq: number }>();
      given = Number(row?.given ?? 0);
      unique = Number(row?.uniq ?? 0);
    } catch {
      // Zero.
    }
    const [received, self, mentions] = await Promise.all([
      count(
        db,
        `SELECT COUNT(*) AS count FROM reactions r JOIN messages m ON m.id = r.message_id
           WHERE m.user_id = ? AND r.user_id <> ? AND m.deleted_at IS NULL`,
        userId,
        userId,
      ),
      count(
        db,
        `SELECT COUNT(*) AS count FROM reactions r JOIN messages m ON m.id = r.message_id
           WHERE m.user_id = ? AND r.user_id = ?`,
        userId,
        userId,
      ),
      count(db, "SELECT COUNT(*) AS count FROM mentions WHERE user_id = ?", userId),
    ]);
    return {
      reactions_given: given,
      unique_emojis: unique,
      reactions_received: received,
      self_reactions: self,
      mentions_received: mentions,
    };
  },

  async people({ db, userId }) {
    const [friends, dms, joined, created] = await Promise.all([
      count(
        db,
        `SELECT COUNT(DISTINCT CASE WHEN user_id = ?1 THEN friend_id ELSE user_id END) AS count
           FROM friendships WHERE (user_id = ?1 OR friend_id = ?1) AND status = 'accepted'`,
        userId,
      ),
      count(db, "SELECT COUNT(*) AS count FROM dm_members WHERE user_id = ?", userId),
      count(db, "SELECT COUNT(*) AS count FROM server_members WHERE user_id = ?", userId),
      count(db, "SELECT COUNT(*) AS count FROM servers WHERE created_by = ?", userId),
    ]);
    return { friends, dm_conversations: dms, servers_joined: joined, servers_created: created };
  },

  async community({ db, userId }) {
    const [polls, votes, events, rsvps, questions, reports, saved, reminders, scheduled] = await Promise.all([
      count(db, "SELECT COUNT(*) AS count FROM polls WHERE created_by = ?", userId),
      count(db, "SELECT COUNT(DISTINCT poll_id) AS count FROM poll_votes WHERE user_id = ?", userId),
      count(db, "SELECT COUNT(*) AS count FROM server_events WHERE created_by = ?", userId),
      count(db, "SELECT COUNT(*) AS count FROM event_rsvps WHERE user_id = ?", userId),
      count(db, "SELECT COUNT(*) AS count FROM qa_questions WHERE user_id = ?", userId),
      count(db, "SELECT COUNT(*) AS count FROM message_reports WHERE resolved_by = ? AND status = 'resolved'", userId),
      count(db, "SELECT COUNT(*) AS count FROM saved_messages WHERE user_id = ?", userId),
      count(db, "SELECT COUNT(*) AS count FROM reminders WHERE user_id = ?", userId),
      count(db, "SELECT COUNT(*) AS count FROM scheduled_messages WHERE user_id = ?", userId),
    ]);
    return {
      polls_created: polls,
      poll_votes: votes,
      events_created: events,
      rsvps,
      qa_questions: questions,
      reports_resolved: reports,
      saved,
      reminders: reminders + scheduled,
    };
  },

  async creator({ db, userId }) {
    const [emojis, stickers, themes, stars, webhooks] = await Promise.all([
      count(db, "SELECT COUNT(*) AS count FROM emojis WHERE created_by = ?", userId),
      count(db, "SELECT COUNT(*) AS count FROM stickers WHERE created_by = ?", userId),
      count(db, "SELECT COUNT(*) AS count FROM custom_themes WHERE created_by = ? AND is_public = 1", userId),
      count(db, "SELECT COALESCE(SUM(stars), 0) AS count FROM custom_themes WHERE created_by = ?", userId),
      count(db, "SELECT COUNT(*) AS count FROM channel_webhooks WHERE created_by = ?", userId),
    ]);
    return { uploads: emojis + stickers, themes_published: themes, theme_stars: stars, webhooks };
  },

  async account({ db, userId }) {
    try {
      const row = await db
        .prepare(
          `SELECT
             CAST(julianday('now') - julianday(created_at) AS INTEGER) AS age,
             (CASE WHEN COALESCE(bio, '') <> '' THEN 1 ELSE 0 END)
               + (CASE WHEN COALESCE(pronouns, '') <> '' THEN 1 ELSE 0 END)
               + (CASE WHEN COALESCE(tagline, '') <> '' THEN 1 ELSE 0 END)
               + (CASE WHEN COALESCE(avatar_url, '') <> '' THEN 1 ELSE 0 END)
               + (CASE WHEN COALESCE(banner_url, '') <> '' THEN 1 ELSE 0 END) AS profile,
             (CASE WHEN COALESCE(avatar_frame, 'none') <> 'none' THEN 1 ELSE 0 END)
               + (CASE WHEN COALESCE(profile_effect, 'none') <> 'none' THEN 1 ELSE 0 END)
               + (CASE WHEN COALESCE(nameplate, 'none') <> 'none' THEN 1 ELSE 0 END)
               + (CASE WHEN COALESCE(profile_frame, 'none') <> 'none' THEN 1 ELSE 0 END) AS cosmetics,
             achievement_showcase AS showcase
           FROM users WHERE id = ?`,
        )
        .bind(userId)
        .first<{ age: number; profile: number; cosmetics: number; showcase: string | null }>();
      if (!row) return {};
      let showcase: unknown = [];
      try {
        showcase = JSON.parse(row.showcase || "[]");
      } catch {
        // Empty.
      }
      return {
        account_age_days: Math.max(0, Number(row.age ?? 0)),
        profile_complete: Number(row.profile ?? 0),
        cosmetics: Number(row.cosmetics ?? 0),
        showcase_count: normalizeShowcase(showcase).length,
      };
    } catch {
      return {};
    }
  },

  async marks({ db, userId }) {
    const stats: Stats = {
      themes_tried: 0,
      venues_visited: 0,
      fish_species: 0,
      fish_rare: 0,
      fish_junk: 0,
      konami: 0,
      dice_nat20: 0,
      dice_nat1: 0,
    };
    try {
      const rows = await db
        .prepare(
          "SELECT kind, value FROM user_achievement_marks WHERE user_id = ?",
        )
        .bind(userId)
        .all<{ kind: string; value: string }>();
      for (const row of rows.results || []) {
        if (row.kind === "theme") stats.themes_tried! += 1;
        else if (row.kind === "venue") stats.venues_visited! += 1;
        else if (row.kind === "fish") stats.fish_species! += 1;
        else if (row.kind === "fish_rare") stats.fish_rare! += 1;
        else if (row.kind === "fish_junk") stats.fish_junk! += 1;
        else if (row.kind === "secret" && row.value === "konami") stats.konami = 1;
        else if (row.kind === "dice" && row.value === "nat20") stats.dice_nat20 = 1;
        else if (row.kind === "dice" && row.value === "nat1") stats.dice_nat1 = 1;
      }
    } catch {
      // Zero.
    }
    return stats;
  },
};

const ALL_SOURCES = Object.keys(SOURCES) as StatSource[];

/** Which source measures each stat. */
const STAT_SOURCE: Record<AchievementStat, StatSource | null> = {
  messages_sent: "messages",
  replies: "messages",
  attachments: "messages",
  gifs: "messages",
  links: "messages",
  long_messages: "messages",
  edits: "messages",
  questions: "messages",
  threads: "messages",
  pinned_messages: "messages",
  channels_posted: "messages",
  night_owl: "messages",
  early_bird: "messages",
  weekend_messages: "messages",
  caps_messages: "messages",
  hello_world: "messages",
  midnight: "messages",
  days_active: "days",
  streak_days: "days",
  max_per_day: "days",
  voice_seconds: "voice",
  reactions_given: "reactions",
  unique_emojis: "reactions",
  reactions_received: "reactions",
  self_reactions: "reactions",
  mentions_received: "reactions",
  friends: "people",
  dm_conversations: "people",
  servers_joined: "people",
  servers_created: "people",
  polls_created: "community",
  poll_votes: "community",
  events_created: "community",
  rsvps: "community",
  qa_questions: "community",
  reports_resolved: "community",
  saved: "community",
  reminders: "community",
  uploads: "creator",
  themes_published: "creator",
  theme_stars: "creator",
  webhooks: "creator",
  account_age_days: "account",
  profile_complete: "account",
  cosmetics: "account",
  showcase_count: "account",
  themes_tried: "marks",
  venues_visited: "marks",
  fish_species: "marks",
  fish_rare: "marks",
  fish_junk: "marks",
  konami: "marks",
  dice_nat20: "marks",
  dice_nat1: "marks",
  // Counted from user_achievements after the rest are awarded.
  achievements_earned: null,
};

export interface EvaluateOptions {
  /** Only re-measure these groups; omit for everything. */
  sources?: StatSource[];
  /** Minutes east of UTC, for the time-of-day achievements. */
  tzOffset?: number;
}

async function loadStats(db: D1Database, userId: string, options: EvaluateOptions = {}): Promise<Stats> {
  const ctx: Context = { db, userId, local: tzModifier(options.tzOffset) };
  const wanted = options.sources?.length ? options.sources : ALL_SOURCES;
  const parts = await Promise.all(wanted.map((source) => SOURCES[source](ctx)));
  return Object.assign({}, ...parts) as Stats;
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

/** Per member, at most this many distinct values are kept for one mark kind. */
const MARK_CAP = 100;

export function isMarkKind(value: unknown): value is MarkKind {
  return typeof value === "string" && (MARK_KINDS as readonly string[]).includes(value);
}

/** Records one client-reported milestone (a theme tried, a fish caught, …). */
export async function recordMark(
  db: D1Database,
  userId: string,
  kind: MarkKind,
  rawValue: string,
): Promise<boolean> {
  const value = rawValue.toLowerCase().replace(/[^a-z0-9 _-]/g, "").trim().slice(0, 48);
  if (!value) return false;
  if (kind === "secret" && value !== "konami") return false;
  if (kind === "dice" && value !== "nat20" && value !== "nat1") return false;
  const existing = await count(
    db,
    "SELECT COUNT(*) AS count FROM user_achievement_marks WHERE user_id = ? AND kind = ?",
    userId,
    kind,
  );
  if (existing >= MARK_CAP) return false;
  const result = await db
    .prepare(
      "INSERT OR IGNORE INTO user_achievement_marks (user_id, kind, value, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(userId, kind, value, new Date().toISOString())
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

async function earnedIds(db: D1Database, userId: string): Promise<Map<string, string>> {
  const earned = await db
    .prepare("SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = ?")
    .bind(userId)
    .all<{ achievement_id: string; earned_at: string }>();
  // Rows for ids no longer in the catalogue are ignored (and never counted).
  return new Map(
    (earned.results || [])
      .filter((r) => getAchievement(r.achievement_id))
      .map((r) => [r.achievement_id, r.earned_at]),
  );
}

async function grant(db: D1Database, userId: string, ids: string[], now: string): Promise<void> {
  if (!ids.length) return;
  await db.batch(
    ids.map((id) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, earned_at) VALUES (?, ?, ?)",
        )
        .bind(userId, id, now),
    ),
  );
}

async function evaluate(
  db: D1Database,
  userId: string,
  options: EvaluateOptions,
): Promise<{ stats: Stats; earned: Map<string, string>; newlyEarned: string[] }> {
  const now = new Date().toISOString();
  const [stats, earned] = await Promise.all([loadStats(db, userId, options), earnedIds(db, userId)]);

  const newlyEarned: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (earned.has(def.id)) continue;
    const value = stats[def.condition.type];
    if (value !== undefined && value >= def.condition.threshold) newlyEarned.push(def.id);
  }

  // Meta achievements count everything earned so far, including this round.
  const total = earned.size + newlyEarned.length;
  for (const def of ACHIEVEMENTS) {
    if (def.condition.type !== "achievements_earned") continue;
    if (earned.has(def.id) || newlyEarned.includes(def.id)) continue;
    if (total >= def.condition.threshold) newlyEarned.push(def.id);
  }

  await grant(db, userId, newlyEarned, now);
  for (const id of newlyEarned) earned.set(id, now);
  stats.achievements_earned = earned.size;
  return { stats, earned, newlyEarned };
}

/**
 * Recompute a user's progress and grant any newly earned achievements.
 * Returns the ids of achievements earned in this call.
 */
export async function evaluateAndAward(
  db: D1Database,
  userId: string,
  options: EvaluateOptions = {},
): Promise<string[]> {
  return (await evaluate(db, userId, options)).newlyEarned;
}

/**
 * Evaluates and, when something new unlocked, tells the member's open tabs so
 * they can show the unlock popup wherever it happened (a reaction, a call…).
 * Never throws.
 */
export async function awardAndNotify(
  db: D1Database,
  userId: string,
  options: EvaluateOptions = {},
): Promise<string[]> {
  try {
    const ids = await evaluateAndAward(db, userId, options);
    if (ids.length) await publishAchievements(userId, ids);
    return ids;
  } catch {
    return [];
  }
}

/** Everything the client needs to render a user's achievement board. */
export async function listUserAchievements(
  db: D1Database,
  userId: string,
  options: EvaluateOptions = {},
): Promise<{ progress: AchievementProgress[]; newlyEarned: string[] }> {
  // Always measure everything here: this is the full board.
  const { stats, earned: earnedById, newlyEarned } = await evaluate(db, userId, { tzOffset: options.tzOffset });

  const progress = ACHIEVEMENTS.map((def) => {
    const earnedAt = earnedById.get(def.id) ?? null;
    const current = stats[def.condition.type] ?? 0;
    const earned = Boolean(earnedAt);
    return {
      def,
      earned,
      earnedAt,
      current,
      progress: earned ? 1 : Math.min(1, current / def.condition.threshold),
    };
  });
  return { progress, newlyEarned };
}

/** Share of members holding each achievement (0..1), for rarity labels. */
export async function achievementRarity(db: D1Database): Promise<Record<string, number>> {
  try {
    const [members, rows] = await Promise.all([
      count(db, "SELECT COUNT(*) AS count FROM users WHERE suspended_at IS NULL"),
      db
        .prepare("SELECT achievement_id, COUNT(*) AS count FROM user_achievements GROUP BY achievement_id")
        .all<{ achievement_id: string; count: number }>(),
    ]);
    const total = Math.max(1, members);
    return Object.fromEntries(
      (rows.results || []).map((r) => [r.achievement_id, Math.min(1, Number(r.count) / total)]),
    );
  } catch {
    return {};
  }
}

/** Public, earned-only view of another member's achievements. */
export async function earnedAchievementsFor(
  db: D1Database,
  userId: string,
): Promise<Array<{ id: string; earnedAt: string }>> {
  const earned = await earnedIds(db, userId);
  return [...earned.entries()].map(([id, earnedAt]) => ({ id, earnedAt }));
}

/** Saves which earned achievements the member pins to their profile. */
export async function setShowcase(
  db: D1Database,
  userId: string,
  requested: unknown,
): Promise<string[]> {
  const earned = await earnedIds(db, userId);
  const showcase = normalizeShowcase(requested).filter((id) => earned.has(id));
  await db
    .prepare("UPDATE users SET achievement_showcase = ? WHERE id = ?")
    .bind(JSON.stringify(showcase), userId)
    .run();
  return showcase;
}
