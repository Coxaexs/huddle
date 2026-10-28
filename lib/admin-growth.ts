/**
 * The admin Growth tab: who signs up, who comes back, and where new people
 * stall. Everything is counts and shares, never a list of who did what.
 *
 * Days are UTC days from `user_active_days` (lib/active-days.ts). The weeks
 * before that table existed were filled in from messages and sign-ins, so they
 * miss the days someone only read.
 */

import { utcDay } from "./active-days";

const DAY_MS = 86_400_000;
/** How far back the daily chart, cohorts and funnel look. */
const DAILY_DAYS = 30;
const COHORT_WEEKS = 8;
const FUNNEL_DAYS = 90;

/** `count` of `of` people; `of` is 0 when nobody in the cohort is old enough yet. */
export interface Share {
  count: number;
  of: number;
}

export interface GrowthCohort {
  /** Monday of the signup week (UTC), YYYY-MM-DD. */
  week: string;
  signups: number;
  /** Used Hoffle again the day after signing up. */
  day1: Share;
  /** Came back on any of days 1–7 after signing up. */
  week1: Share;
  /** Came back on any of days 8–28: still around after the first week. */
  weeks2to4: Share;
}

export interface GrowthFunnelStep {
  id: "signup" | "message" | "returned" | "voice" | "friend" | "invited";
  label: string;
  count: number;
}

export interface AdminGrowth {
  generatedAt: string;
  accounts: number;
  /** People active today, in the last 7 days, and in the last 30 days. */
  active: { day: number; week: number; month: number };
  /** Average daily actives over the last 7 days divided by monthly actives. */
  stickiness: number;
  daily: Array<{ day: string; active: number; posting: number; signups: number }>;
  cohorts: GrowthCohort[];
  funnel: { days: number; steps: GrowthFunnelStep[] };
  sources: Array<{ source: string; count: number }>;
}

export interface GrowthInput {
  users: Array<{ id: string; created_at: string; signup_source: string | null }>;
  activeDays: Array<{ user_id: string; day: string }>;
  /** Days on which each person posted (people, not bots). */
  postingDays: Array<{ user_id: string; day: string }>;
  voiceUsers: string[];
  friendUsers: string[];
  /** People whose invite links someone used. */
  inviters: string[];
}

const FUNNEL_LABELS: Record<GrowthFunnelStep["id"], string> = {
  signup: "Signed up",
  message: "Sent a message",
  returned: "Came back another day",
  voice: "Joined voice",
  friend: "Has a friend",
  invited: "Brought someone in",
};

const SOURCE_LABELS: Record<string, string> = {
  open: "Open sign-up",
  invite: "Invite link",
  guest: "Guest",
  admin: "Made by an admin",
};

function addDays(day: string, days: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS));
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** Pure: turns the raw rows into the tab's numbers. */
export function computeGrowth(input: GrowthInput, now = new Date()): AdminGrowth {
  const today = utcDay(now);
  const daysOf = new Map<string, Set<string>>();
  for (const row of input.activeDays) {
    let days = daysOf.get(row.user_id);
    if (!days) daysOf.set(row.user_id, (days = new Set()));
    days.add(row.day);
  }
  const posters = new Set(input.postingDays.map((row) => row.user_id));
  const voice = new Set(input.voiceUsers);
  const friends = new Set(input.friendUsers);
  const inviters = new Set(input.inviters);
  const signupDay = new Map(input.users.map((user) => [user.id, utcDay(user.created_at)]));

  const activeSince = (since: string) => {
    let count = 0;
    for (const days of daysOf.values()) {
      for (const day of days) {
        if (day >= since && day <= today) {
          count += 1;
          break;
        }
      }
    }
    return count;
  };

  const daily: AdminGrowth["daily"] = [];
  for (let back = DAILY_DAYS - 1; back >= 0; back -= 1) {
    daily.push({ day: addDays(today, -back), active: 0, posting: 0, signups: 0 });
  }
  const dailyIndex = new Map(daily.map((entry, index) => [entry.day, index]));
  for (const row of input.activeDays) {
    const index = dailyIndex.get(row.day);
    if (index !== undefined) daily[index].active += 1;
  }
  const posted = new Set<string>();
  for (const row of input.postingDays) {
    const key = `${row.user_id}|${row.day}`;
    const index = dailyIndex.get(row.day);
    if (index === undefined || posted.has(key)) continue;
    posted.add(key);
    daily[index].posting += 1;
  }
  for (const day of signupDay.values()) {
    const index = dailyIndex.get(day);
    if (index !== undefined) daily[index].signups += 1;
  }

  /** Whether a person was active on any day in [from, to] days after signing up. */
  const cameBack = (userId: string, from: number, to: number) => {
    const start = signupDay.get(userId);
    const days = daysOf.get(userId);
    if (!start || !days) return false;
    for (const day of days) {
      const offset = daysBetween(start, day);
      if (offset >= from && offset <= to) return true;
    }
    return false;
  };
  /** Of the people old enough for a window, how many came back inside it. */
  const share = (ids: string[], from: number, to: number): Share => {
    const eligible = ids.filter((id) => daysBetween(signupDay.get(id)!, today) > to);
    return { count: eligible.filter((id) => cameBack(id, from, to)).length, of: eligible.length };
  };

  const thisWeek = mondayOf(today);
  const cohorts: GrowthCohort[] = [];
  for (let back = 0; back < COHORT_WEEKS; back += 1) {
    const week = addDays(thisWeek, -7 * back);
    const ids = input.users.filter((user) => mondayOf(signupDay.get(user.id)!) === week).map((user) => user.id);
    cohorts.push({
      week,
      signups: ids.length,
      day1: share(ids, 1, 1),
      week1: share(ids, 1, 7),
      weeks2to4: share(ids, 8, 28),
    });
  }

  const funnelSince = addDays(today, -(FUNNEL_DAYS - 1));
  const recent = input.users.filter((user) => signupDay.get(user.id)! >= funnelSince).map((user) => user.id);
  const counts: Record<GrowthFunnelStep["id"], number> = {
    signup: recent.length,
    message: recent.filter((id) => posters.has(id)).length,
    returned: recent.filter((id) => cameBack(id, 1, Number.MAX_SAFE_INTEGER)).length,
    voice: recent.filter((id) => voice.has(id)).length,
    friend: recent.filter((id) => friends.has(id)).length,
    invited: recent.filter((id) => inviters.has(id)).length,
  };
  const steps = (Object.keys(FUNNEL_LABELS) as Array<GrowthFunnelStep["id"]>).map((id) => ({
    id,
    label: FUNNEL_LABELS[id],
    count: counts[id],
  }));

  const sourceCounts = new Map<string, number>();
  for (const user of input.users) {
    if (signupDay.get(user.id)! < funnelSince) continue;
    const label = SOURCE_LABELS[user.signup_source ?? ""] ?? (user.signup_source || "Not recorded");
    sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + 1);
  }

  const month = activeSince(addDays(today, -29));
  const lastWeek = daily.slice(-7);
  const averageDaily = lastWeek.reduce((sum, entry) => sum + entry.active, 0) / lastWeek.length;

  return {
    generatedAt: now.toISOString(),
    accounts: input.users.length,
    active: { day: activeSince(today), week: activeSince(addDays(today, -6)), month },
    stickiness: month ? averageDaily / month : 0,
    daily,
    cohorts,
    funnel: { days: FUNNEL_DAYS, steps },
    sources: [...sourceCounts].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
  };
}

/** Reads the rows and computes the Growth tab. */
export async function adminGrowth(db: D1Database, now = new Date()): Promise<AdminGrowth> {
  // Cohorts need about 12 weeks of history (8 cohorts + 4 weeks to come back).
  const since = utcDay(new Date(now.getTime() - Math.max(FUNNEL_DAYS, COHORT_WEEKS * 7 + 35) * DAY_MS));
  const [users, activeDays, postingDays, voiceUsers, friendUsers, inviters] = await Promise.all([
    db.prepare("SELECT id, created_at, signup_source FROM users").all<GrowthInput["users"][number]>(),
    db
      .prepare("SELECT user_id, day FROM user_active_days WHERE day >= ?")
      .bind(since)
      .all<{ user_id: string; day: string }>(),
    db
      .prepare(
        `SELECT DISTINCT user_id, substr(created_at, 1, 10) AS day FROM messages
          WHERE user_id IS NOT NULL AND is_bot = 0 AND deleted_at IS NULL AND created_at >= ?`,
      )
      .bind(since)
      .all<{ user_id: string; day: string }>(),
    db.prepare("SELECT user_id FROM user_voice_seconds WHERE seconds > 0").all<{ user_id: string }>(),
    db
      .prepare(
        `SELECT user_id FROM friendships WHERE status = 'accepted'
         UNION SELECT friend_id FROM friendships WHERE status = 'accepted'`,
      )
      .all<{ user_id: string }>(),
    db
      .prepare("SELECT DISTINCT created_by AS user_id FROM invites WHERE uses > 0 AND created_by IS NOT NULL")
      .all<{ user_id: string }>(),
  ]);
  return computeGrowth(
    {
      users: users.results,
      activeDays: activeDays.results,
      postingDays: postingDays.results,
      voiceUsers: voiceUsers.results.map((row) => row.user_id),
      friendUsers: friendUsers.results.map((row) => row.user_id),
      inviters: inviters.results.map((row) => row.user_id),
    },
    now,
  );
}
