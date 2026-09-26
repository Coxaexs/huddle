import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { checkAiQuota } from "./ai";

/** Just enough of D1 over a real in-memory SQLite, so the SQL itself is tested. */
function realDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE ai_usage (user_id TEXT NOT NULL, at INTEGER NOT NULL)");
  return {
    prepare(query: string) {
      return {
        bind(...args: unknown[]) {
          const statement = sqlite.prepare(query);
          const params = args as Array<string | number>;
          return {
            async first<T>() {
              return (statement.get(...params) ?? null) as T;
            },
            async run() {
              statement.run(...params);
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

const LIMITS = { perMinute: 3, perHour: 60, perDay: 200 };

describe("checkAiQuota", () => {
  it("allows 3 in any 60 seconds, even across a clock-minute boundary", async () => {
    const db = realDb();
    // Two asks at the end of one clock minute and more right after it rolls
    // over: a fixed-window limiter reset at :00 and let 6 through in seconds.
    const t = Date.UTC(2026, 8, 25, 22, 41, 55);
    for (const offset of [0, 3_000, 6_000]) {
      expect((await checkAiQuota(db, "u", { ...LIMITS, now: t + offset })).allowed).toBe(true);
    }
    const refused = await checkAiQuota(db, "u", { ...LIMITS, now: t + 9_000 });
    expect(refused.allowed).toBe(false);
    // The oldest ask (t) leaves the window at t + 60s.
    expect(refused.retryAfter).toBe(51);
    expect(refused.message).toContain("3 questions a minute");
    // A refusal is not counted, so the slot really opens at t + 60s.
    expect((await checkAiQuota(db, "u", { ...LIMITS, now: t + 59_000 })).allowed).toBe(false);
    expect((await checkAiQuota(db, "u", { ...LIMITS, now: t + 60_001 })).allowed).toBe(true);
  });

  it("keeps users separate", async () => {
    const db = realDb();
    const t = 1_000_000_000;
    for (let i = 0; i < 3; i++) await checkAiQuota(db, "a", { ...LIMITS, now: t + i });
    expect((await checkAiQuota(db, "a", { ...LIMITS, now: t + 10 })).allowed).toBe(false);
    expect((await checkAiQuota(db, "b", { ...LIMITS, now: t + 10 })).allowed).toBe(true);
  });

  it("caps an hour at 60 no matter how it is spread", async () => {
    const db = realDb();
    const t = 1_000_000_000;
    for (let i = 0; i < 60; i++) {
      expect((await checkAiQuota(db, "u", { ...LIMITS, now: t + i * 50_000 })).allowed).toBe(true);
    }
    const refused = await checkAiQuota(db, "u", { ...LIMITS, now: t + 60 * 50_000 });
    expect(refused.allowed).toBe(false);
    expect(refused.message).toContain("60 questions this hour");
  });

  it("stops everyone at the daily server budget", async () => {
    const db = realDb();
    const t = 1_000_000_000;
    for (let i = 0; i < 5; i++) await checkAiQuota(db, `user${i}`, { ...LIMITS, perDay: 5, now: t + i });
    const refused = await checkAiQuota(db, "someone-new", { ...LIMITS, perDay: 5, now: t + 10 });
    expect(refused.allowed).toBe(false);
    expect(refused.message).toContain("today's free limit");
  });

  it("refunds a question that got no answer", async () => {
    const db = realDb();
    const t = 1_000_000_000;
    await checkAiQuota(db, "u", { ...LIMITS, now: t });
    await checkAiQuota(db, "u", { ...LIMITS, now: t + 1 });
    const third = await checkAiQuota(db, "u", { ...LIMITS, now: t + 2 });
    await third.refund?.();
    expect((await checkAiQuota(db, "u", { ...LIMITS, now: t + 3 })).allowed).toBe(true);
  });
});
