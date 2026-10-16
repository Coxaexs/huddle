import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { ensureSchema } from "@/lib/schema";
import {
  addVoiceSeconds,
  evaluateAndAward,
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
});

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
    expect(earned).toContain("voice-newcomer");

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
    const progress = await listUserAchievements(db, "alice");
    expect(progress.length).toBe(allAchievements().length);
    expect(progress.every((p) => p.progress >= 0 && p.progress <= 1)).toBe(true);
    expect(progress.every((p) => !p.earned)).toBe(true);

    await db
      .prepare(
        `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, is_bot, created_at)
         VALUES ('m1','general','c1','alice','alice','a','#000','hi',0,?)`,
      )
    .bind(new Date().toISOString())
    .run();

    const after = await listUserAchievements(db, "alice");
    const firstSteps = after.find((p) => p.def.id === "first-steps");
    expect(firstSteps?.earned).toBe(true);
    expect(firstSteps?.current).toBe(1);
  });
});
