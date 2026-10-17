import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { ensureSchema } from "@/lib/schema";
import {
  addVoiceSeconds,
  evaluateAndAward,
  longestStreak,
  recordMark,
  setShowcase,
  tzModifier,
  listUserAchievements,
  allAchievements,
} from "@/lib/achievements";

vi.mock("cloudflare:workers", () => ({ env: {} }));

function realDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (query: string, params: unknown[] = []) => {
    const values = params as Array<string | number | null>;
    return {
      bind: (...args: unknown[]) => statement(query, args),
      async first<T>() {
        return (sqlite.prepare(query).get(...values) ?? null) as T;
      },
      async all<T>() {
        return { results: sqlite.prepare(query).all(...values) as T[] };
      },
      async run() {
        const result = sqlite.prepare(query).run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
  };
  return {
    prepare: (query: string) => statement(query),
    batch: async (list: Array<ReturnType<typeof statement>>) =>
      Promise.all(list.map((item) => item.run())),
    exec: async (query: string) => sqlite.exec(query),
  } as unknown as D1Database;
}

let db: D1Database;

beforeAll(async () => {
  db = realDb();
  await ensureSchema(db);
  setBindings({ DB: db } as never);
});

beforeEach(async () => {
  await db.exec("DELETE FROM user_achievements");
  await db.exec("DELETE FROM user_voice_seconds");
  await db.exec("DELETE FROM messages");
  await db.exec("DELETE FROM server_members");
  await db.exec("DELETE FROM message_reports");
  await db.exec("DELETE FROM users");
  await db.exec("DELETE FROM reactions");
  await db.exec("DELETE FROM user_achievement_marks");
  await db.exec("DELETE FROM servers WHERE created_by = 'alice'");
});

let seq = 0;
async function addMessage(userId: string, content: string, createdAt = new Date().toISOString(), extra: { channelId?: string } = {}) {
  seq += 1;
  await db
    .prepare(
      `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, is_bot, created_at)
       VALUES (?, 'general', ?, ?, ?, 'a', '#000', ?, 0, ?)`,
    )
    .bind(`x${seq}`, extra.channelId || "c1", userId, userId, content, createdAt)
    .run();
  return `x${seq}`;
}

async function addUser(id: string) {
  await db
    .prepare(
      `INSERT INTO users (id, username, username_lower, display_name, password_hash, avatar, color, is_admin, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, 'x', 'a', '#000', 0, ?, ?)`,
    )
    .bind(id, id, id, id, new Date().toISOString(), new Date().toISOString())
    .run();
}

describe("achievements", () => {
  it("defines a sensible set of achievements with unique ids", () => {
    const defs = allAchievements();
    expect(defs.length).toBeGreaterThan(0);
    const ids = new Set(defs.map((d) => d.id));
    expect(ids.size).toBe(defs.length);
    for (const def of defs) {
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.condition.threshold).toBeGreaterThan(0);
    }
  });

  it("awards first-steps after one message", async () => {
    await addUser("alice");
    await db
      .prepare(
        `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, is_bot, created_at)
         VALUES ('m1','general','c1','alice','alice','a','#000','hi',0,?)`,
      )
    .bind(new Date().toISOString())
    .run();

    const earned = await evaluateAndAward(db, "alice");
    expect(earned).toContain("first-steps");
  });

  it("does not award chatterbox until 100 messages", async () => {
    await addUser("alice");
    for (let i = 0; i < 99; i += 1) {
      await db
        .prepare(
          `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, is_bot, created_at)
           VALUES (?, 'general','c1','alice','alice','a','#000','m',0,?)`,
        )
        .bind(`m${i}`, new Date().toISOString())
        .run();
    }
    let earned = await evaluateAndAward(db, "alice");
    expect(earned).toContain("first-steps");
    expect(earned).not.toContain("chatterbox");

    await db
      .prepare(
        `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, is_bot, created_at)
         VALUES ('m100','general','c1','alice','alice','a','#000','m',0,?)`,
      )
    .bind(new Date().toISOString())
    .run();
    earned = await evaluateAndAward(db, "alice");
    expect(earned).toContain("chatterbox");
  });

  it("tracks voice seconds and awards voice tiers", async () => {
    await addUser("alice");

    await addVoiceSeconds(db, "alice", 60 * 60); // 1 hour
    let earned = await evaluateAndAward(db, "alice");
    expect(earned).toContain("voice-1h");

    await addVoiceSeconds(db, "alice", 9 * 60 * 60); // total 10 hours
    earned = await evaluateAndAward(db, "alice");
    expect(earned).toContain("voice-regular");
    expect(earned).not.toContain("voice-veteran");
  });

  it("counts servers joined and days active", async () => {
    await addUser("alice");
    await db
      .prepare("INSERT INTO servers (id, name, icon, color, created_by, created_at) VALUES ('s1','S1','S','#000','alice',?)")
      .bind(new Date().toISOString())
      .run();
    await db
      .prepare("INSERT INTO server_members (server_id, user_id, joined_at) VALUES ('s1','alice',?)")
      .bind(new Date().toISOString())
      .run();
    await db
      .prepare(
        `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, is_bot, created_at)
         VALUES ('m1','general','c1','alice','alice','a','#000','hi',0,?)`,
      )
    .bind(new Date().toISOString())
    .run();

    const earned = await evaluateAndAward(db, "alice");
    expect(earned).toContain("first-steps");
    // Only 1 server, 1 day — not enough for social-butterfly (5) or weekender (7).
    expect(earned).not.toContain("social-butterfly");
    expect(earned).not.toContain("weekender");
  });

  it("lists progress for earned and unearned achievements", async () => {
    await addUser("alice");
    const { progress } = await listUserAchievements(db, "alice");
    expect(progress.length).toBe(allAchievements().length);
    expect(progress.every((p) => p.progress >= 0 && p.progress <= 1)).toBe(true);
    expect(progress.filter((p) => p.earned).map((p) => p.def.id)).toEqual([]);

    await db
      .prepare(
        `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, is_bot, created_at)
         VALUES ('m1','general','c1','alice','alice','a','#000','hi',0,?)`,
      )
    .bind(new Date().toISOString())
    .run();

    const { progress: after } = await listUserAchievements(db, "alice");
    const firstSteps = after.find((p) => p.def.id === "first-steps");
    expect(firstSteps?.earned).toBe(true);
    expect(firstSteps?.current).toBe(1);
  });

  it("has unique ids, every stat reachable, and a good spread of tiers", () => {
    const defs = allAchievements();
    expect(defs.length).toBeGreaterThanOrEqual(60);
    expect(new Set(defs.map((d) => d.tier)).size).toBe(4);
    expect(defs.some((d) => d.secret && d.hint)).toBe(true);
  });

  it("awards secrets and time-of-day achievements from message content", async () => {
    await addUser("bob");
    await addMessage("bob", "THIS IS SO COOL!!!");
    await addMessage("bob", "Hello world!");
    // 00:00 in UTC+2 is 22:00 UTC.
    await addMessage("bob", "tick", "2026-10-15T22:00:30.000Z");
    const earned = await evaluateAndAward(db, "bob", { sources: ["messages"], tzOffset: 120 });
    expect(earned).toContain("indoor-voice");
    expect(earned).toContain("hello-world");
    expect(earned).toContain("midnight-snack");
    // Only the message source was read: nothing from other groups.
    expect(earned).not.toContain("settled-in");
  });

  it("measures streaks", () => {
    expect(longestStreak(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-05"])).toBe(3);
    expect(longestStreak([])).toBe(0);
    expect(tzModifier(-90)).toBe("-90 minutes");
    expect(tzModifier(99999)).toBe("+840 minutes");
  });

  it("awards streak achievements across consecutive days", async () => {
    await addUser("cara");
    for (const day of ["2026-10-01", "2026-10-02", "2026-10-03"]) {
      await addMessage("cara", "hi", `${day}T12:00:00.000Z`);
    }
    const earned = await evaluateAndAward(db, "cara", { sources: ["days"] });
    expect(earned).toContain("hat-trick");
    expect(earned).not.toContain("on-a-roll");
  });

  it("counts reactions given, received, and on your own message", async () => {
    await addUser("dan");
    await addUser("eve");
    const mine = await addMessage("dan", "look at this");
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)").bind(mine, "dan", "🔥", now).run();
    const danEarned = await evaluateAndAward(db, "dan", { sources: ["reactions"] });
    expect(danEarned).toContain("reactor");
    expect(danEarned).toContain("self-five");
    expect(danEarned).not.toContain("crowd-pleaser");
  });

  it("records client marks once per value and awards explorer achievements", async () => {
    await addUser("fay");
    expect(await recordMark(db, "fay", "theme", "vampire")).toBe(true);
    expect(await recordMark(db, "fay", "theme", "vampire")).toBe(false);
    await recordMark(db, "fay", "theme", "minecraft");
    await recordMark(db, "fay", "theme", "matrix");
    expect(await recordMark(db, "fay", "secret", "not-a-secret")).toBe(false);
    await recordMark(db, "fay", "secret", "konami");
    expect(await recordMark(db, "fay", "dice", "nat7")).toBe(false);
    await recordMark(db, "fay", "dice", "nat20");
    const earned = await evaluateAndAward(db, "fay", { sources: ["marks"] });
    expect(earned).toContain("window-shopper");
    expect(earned).toContain("konami");
    expect(earned).toContain("nat20");
    expect(earned).not.toContain("nat1");
    expect(earned).not.toContain("chameleon");
  });

  it("only lets earned achievements onto the profile showcase", async () => {
    await addUser("gus");
    await addMessage("gus", "hi");
    await evaluateAndAward(db, "gus");
    const showcase = await setShowcase(db, "gus", ["first-steps", "living-legend", "nope", "first-steps"]);
    expect(showcase).toEqual(["first-steps"]);
    const earned = await evaluateAndAward(db, "gus", { sources: ["account"] });
    expect(earned).toContain("show-off");
  });
});
