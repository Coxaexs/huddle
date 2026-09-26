import { describe, expect, it } from "vitest";
import {
  attemptKey,
  checkRateLimit,
  clientIp,
  pruneRateLimits,
  RateLimitError,
} from "@/lib/rate-limit";

/**
 * Minimal stand-in for D1 that implements the two statements `lib/rate-limit.ts`
 * issues: the `ON CONFLICT … RETURNING` upsert and the retention DELETE.
 *
 * An in-memory fake is used rather than capturing SQL strings, because the
 * behaviour worth testing here is the counting and window logic on top of the
 * statement, not the statement's text.
 */
function fakeDb(options: { failPrune?: boolean } = {}) {
  const rows = new Map<string, { windowStart: number; count: number }>();
  let prunes = 0;

  const db = {
    prepare(query: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (!query.includes("INSERT INTO rate_limits")) {
                throw new Error(`unexpected query: ${query}`);
              }
              const [key, windowStart] = args as [string, number];
              const existing = rows.get(key);
              const count =
                existing && existing.windowStart === windowStart
                  ? existing.count + 1
                  : 1;
              rows.set(key, { windowStart, count });
              return { count } as T;
            },
            async run() {
              if (!query.includes("DELETE FROM rate_limits")) {
                throw new Error(`unexpected query: ${query}`);
              }
              prunes += 1;
              if (options.failPrune) throw new Error("prune failed");
              const cutoff = args[0] as number;
              for (const [key, row] of rows) {
                if (row.windowStart < cutoff) rows.delete(key);
              }
              return {};
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, rows, pruneCount: () => prunes };
}

/**
 * A fixed clock, aligned exactly to a window boundary. Aligning matters: an
 * unaligned `NOW` makes `NOW + WINDOW_MS` land in the following window, and the
 * rollover assertions then stop testing what they claim to.
 */
const NOW = 1_699_999_800_000;
const WINDOW_SECONDS = 300;
const WINDOW_MS = WINDOW_SECONDS * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("checkRateLimit", () => {
  it("allows exactly `limit` attempts and blocks the next one", async () => {
    const { db } = fakeDb();
    const common = {
      db,
      action: "login-ip",
      key: "203.0.113.7",
      limit: 3,
      windowSeconds: WINDOW_SECONDS,
      now: NOW,
    };

    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await checkRateLimit(common);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3 - attempt);
    }

    const blocked = await checkRateLimit(common);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(WINDOW_SECONDS);
  });

  it("shortens retryAfter as the window runs out", async () => {
    const { db } = fakeDb();
    const common = {
      db,
      action: "login-ip",
      key: "203.0.113.7",
      limit: 1,
      windowSeconds: WINDOW_SECONDS,
    };

    await checkRateLimit({ ...common, now: NOW });
    const early = await checkRateLimit({ ...common, now: NOW + 1000 });
    const late = await checkRateLimit({ ...common, now: NOW + WINDOW_MS - 1000 });

    expect(early.allowed).toBe(false);
    expect(late.allowed).toBe(false);
    expect(late.retryAfter).toBeLessThan(early.retryAfter);
  });

  it("forgets the count once the window rolls over", async () => {
    const { db } = fakeDb();
    const common = {
      db,
      action: "login-ip",
      key: "203.0.113.7",
      limit: 1,
      windowSeconds: WINDOW_SECONDS,
    };

    expect((await checkRateLimit({ ...common, now: NOW })).allowed).toBe(true);
    expect((await checkRateLimit({ ...common, now: NOW })).allowed).toBe(false);
    // Next window: a fresh budget, so a caller can never be locked out forever.
    const nextWindow = await checkRateLimit({ ...common, now: NOW + WINDOW_MS });
    expect(nextWindow.allowed).toBe(true);
    expect(nextWindow.remaining).toBe(0);
  });
});

describe("checkRateLimit budgets", () => {
  it("gives each key its own budget", async () => {
    const { db } = fakeDb();
    const common = {
      db,
      action: "login-ip",
      limit: 1,
      windowSeconds: WINDOW_SECONDS,
      now: NOW,
    };

    expect((await checkRateLimit({ ...common, key: "10.0.0.1" })).allowed).toBe(true);
    // One noisy IP must not consume anyone else's allowance.
    expect((await checkRateLimit({ ...common, key: "10.0.0.2" })).allowed).toBe(true);
    expect((await checkRateLimit({ ...common, key: "10.0.0.1" })).allowed).toBe(false);
  });

  it("gives each action its own budget for the same key", async () => {
    const { db } = fakeDb();
    const common = {
      db,
      key: "203.0.113.7",
      limit: 1,
      windowSeconds: WINDOW_SECONDS,
      now: NOW,
    };

    expect((await checkRateLimit({ ...common, action: "login-user" })).allowed).toBe(true);
    // A signup must not be blocked by failed logins from the same address.
    expect((await checkRateLimit({ ...common, action: "signup-ip" })).allowed).toBe(true);
  });

  it("prunes once per new window, and survives a failing prune", async () => {
    const { db, pruneCount } = fakeDb({ failPrune: true });
    const common = {
      db,
      action: "login-ip",
      key: "203.0.113.7",
      limit: 5,
      windowSeconds: WINDOW_SECONDS,
      now: NOW,
    };

    // A failed prune must not turn a valid request into an error.
    await expect(checkRateLimit(common)).resolves.toMatchObject({ allowed: true });
    expect(pruneCount()).toBe(1);
    // Later attempts in the same window must not sweep again.
    await checkRateLimit(common);
    expect(pruneCount()).toBe(1);
  });

  it("drops counters older than the retention window", async () => {
    const { db, rows } = fakeDb();

    await checkRateLimit({
      db,
      action: "login-ip",
      key: "stale",
      limit: 5,
      windowSeconds: WINDOW_SECONDS,
      now: NOW - 2 * DAY_MS,
    });
    expect(rows.has("login-ip:stale")).toBe(true);

    // A later request opens a new window and sweeps the two-day-old row out.
    await checkRateLimit({
      db,
      action: "login-ip",
      key: "fresh",
      limit: 5,
      windowSeconds: WINDOW_SECONDS,
      now: NOW,
    });
    expect(rows.has("login-ip:stale")).toBe(false);
    expect(rows.has("login-ip:fresh")).toBe(true);
  });
});

describe("pruneRateLimits", () => {
  it("deletes rows whose window closed before the cutoff", async () => {
    const { db, rows } = fakeDb();
    rows.set("stale", { windowStart: NOW - 2 * DAY_MS, count: 1 });
    rows.set("fresh", { windowStart: NOW, count: 1 });

    await pruneRateLimits(db, NOW);

    expect(rows.has("stale")).toBe(false);
    expect(rows.has("fresh")).toBe(true);
  });

  it("keeps a row whose window closed less than a day ago", async () => {
    const { db, rows } = fakeDb();
    rows.set("recent", { windowStart: NOW - DAY_MS / 2, count: 9 });

    await pruneRateLimits(db, NOW);

    expect(rows.has("recent")).toBe(true);
  });
});

describe("RateLimitError", () => {
  it("renders a 429 that tells the client when to come back", async () => {
    const response = new RateLimitError(42).response();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    await expect(response.json()).resolves.toMatchObject({ retryAfter: 42 });
  });

  it("carries the retry delay on the error itself", () => {
    const error = new RateLimitError(17);
    expect(error.retryAfter).toBe(17);
    expect(error.status).toBe(429);
  });
});

describe("clientIp", () => {
  const withHeaders = (headers: Record<string, string>) =>
    new Request("https://hoffle.example/hangout/api/auth/login", { headers });

  it("prefers CF-Connecting-IP, which a client cannot forge", () => {
    expect(
      clientIp(
        withHeaders({
          "cf-connecting-ip": "198.51.100.9",
          "x-forwarded-for": "1.2.3.4",
        }),
      ),
    ).toBe("198.51.100.9");
  });

  it("falls back to the first x-forwarded-for hop nginx appends", () => {
    expect(clientIp(withHeaders({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe(
      "1.2.3.4",
    );
  });

  it("uses x-real-ip when that is all the proxy sends", () => {
    expect(clientIp(withHeaders({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("fails closed to one shared bucket rather than no limit at all", () => {
    // A misconfigured proxy should over-limit, not under-limit.
    expect(clientIp(withHeaders({}))).toBe("unknown");
  });
});

describe("attemptKey", () => {
  it("folds case and joins the parts that identify one account", () => {
    expect(attemptKey("Alice")).toBe("alice");
    expect(attemptKey("10.0.0.1", "  Alice ")).toBe("10.0.0.1:alice");
  });

  it("skips empty parts so a missing username does not collapse the key", () => {
    expect(attemptKey("10.0.0.1", undefined, "")).toBe("10.0.0.1");
  });
});

