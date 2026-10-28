import { beforeEach, describe, expect, it } from "vitest";
import { computeGrowth, adminGrowth, type GrowthInput } from "@/lib/admin-growth";
import { markActiveDay, resetActiveDayCache } from "@/lib/active-days";
import { backfillActiveDays, ensureSchema } from "@/lib/schema";
import { sqliteAvailable, sqliteD1 } from "./stubs/sqlite-d1";

// A Wednesday, so the current cohort week starts on Monday Oct 19.
const NOW = new Date("2026-10-21T15:00:00Z");

function input(partial: Partial<GrowthInput>): GrowthInput {
  return { users: [], activeDays: [], postingDays: [], voiceUsers: [], friendUsers: [], inviters: [], ...partial };
}

describe("computeGrowth", () => {
  it("counts active people per window and per day", () => {
    const growth = computeGrowth(
      input({
        users: [
          { id: "a", created_at: "2026-08-01T10:00:00Z", signup_source: "open" },
          { id: "b", created_at: "2026-08-01T10:00:00Z", signup_source: "open" },
          { id: "c", created_at: "2026-08-01T10:00:00Z", signup_source: "open" },
        ],
        activeDays: [
          { user_id: "a", day: "2026-10-21" },
          { user_id: "a", day: "2026-10-20" },
          { user_id: "b", day: "2026-10-16" },
          { user_id: "c", day: "2026-09-25" },
          { user_id: "c", day: "2026-09-01" },
        ],
        postingDays: [
          { user_id: "a", day: "2026-10-21" },
          { user_id: "a", day: "2026-10-21" },
        ],
      }),
      NOW,
    );
    expect(growth.active).toEqual({ day: 1, week: 2, month: 3 });
    expect(growth.daily).toHaveLength(30);
    expect(growth.daily.at(-1)).toEqual({ day: "2026-10-21", active: 1, posting: 1, signups: 0 });
    expect(growth.daily[0].day).toBe("2026-09-22");
    // 3 active-days in the last 7 (a twice, b once) / 7 days / 3 monthly actives.
    expect(growth.stickiness).toBeCloseTo(3 / 7 / 3);
  });

  it("groups signups into Monday weeks and only rates people old enough", () => {
    const growth = computeGrowth(
      input({
        users: [
          // Week of Sep 21: one came back the next day and in week 3, one never did.
          { id: "back", created_at: "2026-09-21T09:00:00Z", signup_source: "invite" },
          { id: "gone", created_at: "2026-09-26T09:00:00Z", signup_source: "open" },
          // This week: too new for any column except "next day" for Monday's.
          { id: "new", created_at: "2026-10-19T09:00:00Z", signup_source: "guest" },
        ],
        activeDays: [
          { user_id: "back", day: "2026-09-21" },
          { user_id: "back", day: "2026-09-22" },
          { user_id: "back", day: "2026-10-05" },
          { user_id: "gone", day: "2026-09-26" },
          { user_id: "new", day: "2026-10-19" },
          { user_id: "new", day: "2026-10-20" },
        ],
      }),
      NOW,
    );
    expect(growth.cohorts).toHaveLength(8);
    const [current, , , , sep21] = growth.cohorts;
    expect(current.week).toBe("2026-10-19");
    expect(current.signups).toBe(1);
    expect(current.day1).toEqual({ count: 1, of: 1 });
    expect(current.week1).toEqual({ count: 0, of: 0 });
    expect(sep21.week).toBe("2026-09-21");
    expect(sep21.signups).toBe(2);
    expect(sep21.day1).toEqual({ count: 1, of: 2 });
    expect(sep21.week1).toEqual({ count: 1, of: 2 });
    // Sep 26 + 28 = Oct 24 is still ahead, so only "back" is old enough.
    expect(sep21.weeks2to4).toEqual({ count: 1, of: 1 });
  });

  it("builds the funnel and sources from the last 90 days of signups", () => {
    const growth = computeGrowth(
      input({
        users: [
          { id: "old", created_at: "2026-01-01T09:00:00Z", signup_source: "open" },
          { id: "x", created_at: "2026-10-01T09:00:00Z", signup_source: "invite" },
          { id: "y", created_at: "2026-10-02T09:00:00Z", signup_source: "invite" },
          { id: "z", created_at: "2026-10-03T09:00:00Z", signup_source: null },
        ],
        activeDays: [
          { user_id: "x", day: "2026-10-01" },
          { user_id: "x", day: "2026-10-09" },
          { user_id: "y", day: "2026-10-02" },
        ],
        postingDays: [
          { user_id: "x", day: "2026-10-01" },
          { user_id: "y", day: "2026-10-02" },
          { user_id: "old", day: "2026-10-02" },
        ],
        voiceUsers: ["x", "old"],
        friendUsers: ["x", "y"],
        inviters: ["x"],
      }),
      NOW,
    );
    expect(Object.fromEntries(growth.funnel.steps.map((step) => [step.id, step.count]))).toEqual({
      signup: 3,
      message: 2,
      returned: 1,
      voice: 1,
      friend: 2,
      invited: 1,
    });
    expect(growth.sources).toEqual([
      { source: "Invite link", count: 2 },
      { source: "Not recorded", count: 1 },
    ]);
  });
});

describe.skipIf(!sqliteAvailable)("active days in the database", () => {
  let db: D1Database;

  beforeEach(() => {
    resetActiveDayCache();
    db = sqliteD1();
  });

  it("backfills from messages and sign-ins, then records new days once", async () => {
    await ensureSchema(db);
    await db.exec(`INSERT INTO users (id, username, username_lower, display_name, password_hash, avatar, color, created_at, last_seen_at)
      VALUES ('u1', 'u1', 'u1', 'U1', 'x', 'a', '#000', '2026-10-01T10:00:00Z', '2026-10-20T08:00:00Z')`);
    await db.exec(`INSERT INTO messages (id, channel, author, avatar, color, content, is_bot, created_at, user_id)
      VALUES ('m1', 'general', 'U1', 'a', '#000', 'hi', 0, '2026-10-05T10:00:00Z', 'u1'),
             ('m2', 'general', 'Bot', 'a', '#000', 'beep', 1, '2026-10-06T10:00:00Z', 'u1')`);
    // The migration already ran on the empty database and set its flag.
    await backfillActiveDays(db);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM user_active_days").first<{ n: number }>())?.n).toBe(0);
    await db.exec("DELETE FROM meta WHERE key = 'active_days_backfilled'");
    await backfillActiveDays(db);
    const days = async () =>
      (await db.prepare("SELECT day FROM user_active_days WHERE user_id = 'u1' ORDER BY day").all<{ day: string }>()).results.map(
        (row) => row.day,
      );
    expect(await days()).toEqual(["2026-10-01", "2026-10-05", "2026-10-20"]);

    await markActiveDay(db, "u1", NOW);
    await markActiveDay(db, "u1", NOW);
    expect(await days()).toEqual(["2026-10-01", "2026-10-05", "2026-10-20", "2026-10-21"]);

    const growth = await adminGrowth(db, NOW);
    expect(growth.accounts).toBe(1);
    expect(growth.active).toEqual({ day: 1, week: 1, month: 1 });
    expect(growth.daily.filter((day) => day.active).map((day) => day.day)).toEqual(["2026-10-01", "2026-10-05", "2026-10-20", "2026-10-21"]);
    expect(growth.funnel.steps.find((step) => step.id === "message")?.count).toBe(1);
  });
});
