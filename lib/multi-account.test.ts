import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  ACCOUNTS_COOKIE,
  MAX_VAULT_ACCOUNTS,
  accountsCookieForSignIn,
  dedupeVaultEntries,
  listValidAccounts,
  openVault,
  sealVault,
} from "./multi-account";
import { createSession, signedInResponse, type User } from "./auth";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { DELETE as deleteAccountRoute, POST as switchAccountRoute } from "@/app/api/auth/accounts/route";
import { ensureSchema } from "./schema";

function realDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (query: string, params: unknown[] = []) => {
    const values = params as Array<string | number | null>;
    const self = {
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
      async raw() {
        return sqlite.prepare(query).all(...values).map((row) => Object.values(row as object));
      },
    };
    return self;
  };
  return {
    prepare: (query: string) => statement(query),
    async batch(statements: ReturnType<typeof statement>[]) {
      const results = [];
      for (const s of statements) results.push(await s.run());
      return results;
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  } as unknown as D1Database;
}

function makeUser(id: string, username: string): User {
  const now = new Date().toISOString();
  return {
    id,
    username,
    display_name: username.toUpperCase(),
    avatar: username[0].toUpperCase(),
    color: "#5865f2",
    is_admin: 0,
    created_at: now,
    last_seen_at: now,
  };
}

function extractCookieValue(headers: Headers, cookieName: string): string | null {
  const setCookies = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : (headers.get("set-cookie") || "").split(", ");
  for (const header of setCookies) {
    const first = header.split(";")[0];
    const eq = first.indexOf("=");
    if (eq > 0 && first.slice(0, eq).trim() === cookieName) {
      return decodeURIComponent(first.slice(eq + 1));
    }
  }
  return null;
}

describe("multi-account session vault", () => {
  const db = realDb();

  beforeAll(async () => {
    setBindings({ DB: db, IP_HASH_SALT: "test-secret-salt-for-vault" });
    await ensureSchema(db);
  });

  beforeEach(async () => {
    for (const table of ["sessions", "users"]) {
      await db.prepare(`DELETE FROM ${table}`).run();
    }
  });

  it("seals, opens, deduplicates, and caps at 5 accounts while rejecting tampered cookies", async () => {
    const secret = "test-vault-secret";
    const entries = [
      { userId: "u1", token: "t1" },
      { userId: "u2", token: "t2" },
      { userId: "u1", token: "t1-dup" },
      { userId: "u3", token: "t3" },
      { userId: "u4", token: "t4" },
      { userId: "u5", token: "t5" },
      { userId: "u6", token: "t6" },
    ];
    expect(dedupeVaultEntries(entries)).toHaveLength(MAX_VAULT_ACCOUNTS);

    const sealed = await sealVault(entries, secret);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(await openVault(sealed, secret)).toEqual([
      { userId: "u1", token: "t1" },
      { userId: "u2", token: "t2" },
      { userId: "u3", token: "t3" },
      { userId: "u4", token: "t4" },
      { userId: "u5", token: "t5" },
    ]);

    // Wrong key or tampered payload fails closed to empty array.
    expect(await openVault(sealed, "wrong-secret")).toEqual([]);
    expect(await openVault(`${sealed.slice(0, -3)}xxx`, secret)).toEqual([]);
  });

  it("preserves previous account on second sign-in, switches active cookie, and logs out current vs all", async () => {
    const alice = makeUser("u-alice", "alice");
    const bob = makeUser("u-bob", "bob");
    for (const u of [alice, bob]) {
      await db
        .prepare(
          `INSERT INTO users (id, username, username_lower, display_name, password_hash, avatar, color, is_admin, can_invite, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, 'hash', ?, ?, 0, 0, ?, ?)`,
        )
        .bind(u.id, u.username, u.username, u.display_name, u.avatar, u.color, u.created_at, u.last_seen_at)
        .run();
    }

    const r1 = await signedInResponse(db, new Request("https://hoffle.example/hangout/api/auth/login"), alice);
    const aliceToken = extractCookieValue(r1.headers, "hoffle_session")!;
    const v1 = extractCookieValue(r1.headers, ACCOUNTS_COOKIE)!;
    expect(aliceToken).toBeTruthy();
    expect(v1).toBeTruthy();

    // Bob signs in while Alice's session & vault cookies are sent -> rescues/keeps both.
    const r2 = await signedInResponse(
      db,
      new Request("https://hoffle.example/hangout/api/auth/login", {
        headers: { cookie: `hoffle_session=${aliceToken}; ${ACCOUNTS_COOKIE}=${encodeURIComponent(v1)}` },
      }),
      bob,
    );
    const bobToken = extractCookieValue(r2.headers, "hoffle_session")!;
    const v2 = extractCookieValue(r2.headers, ACCOUNTS_COOKIE)!;

    const listed = await listValidAccounts(
      db,
      new Request("https://hoffle.example/hangout/api/auth/accounts", {
        headers: { cookie: `hoffle_session=${bobToken}; ${ACCOUNTS_COOKIE}=${encodeURIComponent(v2)}` },
      }),
    );
    expect(listed.accounts.map((a) => [a.userId, a.isActive])).toEqual([
      ["u-bob", true],
      ["u-alice", false],
    ]);

    // Switch back to Alice via API.
    const switched = await switchAccountRoute(
      new Request("https://hoffle.example/hangout/api/auth/accounts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `hoffle_session=${bobToken}; ${ACCOUNTS_COOKIE}=${encodeURIComponent(v2)}`,
        },
        body: JSON.stringify({ userId: "u-alice" }),
      }),
    );
    expect(switched.status).toBe(200);
    expect(extractCookieValue(switched.headers, "hoffle_session")).toBe(aliceToken);

    // Log out current account only -> removes Alice, leaves Bob valid in vault.
    const logoutCurrent = await logoutRoute(
      new Request("https://hoffle.example/hangout/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: `hoffle_session=${aliceToken}; ${ACCOUNTS_COOKIE}=${encodeURIComponent(v2)}`,
        },
      }),
    );
    expect(extractCookieValue(logoutCurrent.headers, "hoffle_session")).toBe("");
    const v3 = extractCookieValue(logoutCurrent.headers, ACCOUNTS_COOKIE)!;
    const afterLogout = await listValidAccounts(
      db,
      new Request("https://hoffle.example/hangout/api/auth/accounts", {
        headers: { cookie: `${ACCOUNTS_COOKIE}=${encodeURIComponent(v3)}` },
      }),
    );
    expect(afterLogout.accounts.map((a) => a.userId)).toEqual(["u-bob"]);

    // Add a fresh Charlie session and verify DELETE + logout scope=all both clean up properly.
    const charlieToken = await createSession(db, "u-alice");
    const v4Cookie = await accountsCookieForSignIn(
      db,
      new Request("https://hoffle.example/hangout/api/auth/login", {
        headers: { cookie: `hoffle_session=${bobToken}; ${ACCOUNTS_COOKIE}=${encodeURIComponent(v3)}` },
      }),
      "u-alice",
      charlieToken,
    );
    const v4 = v4Cookie.split(";")[0].split("=").slice(1).join("=");
    const deletedRes = await deleteAccountRoute(
      new Request("https://hoffle.example/hangout/api/auth/accounts?userId=u-bob", {
        method: "DELETE",
        headers: { cookie: `hoffle_session=${charlieToken}; ${ACCOUNTS_COOKIE}=${v4}` },
      }),
    );
    expect(deletedRes.status).toBe(200);
    const v5 = extractCookieValue(deletedRes.headers, ACCOUNTS_COOKIE)!;
    const logoutAll = await logoutRoute(
      new Request("https://hoffle.example/hangout/api/auth/logout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `hoffle_session=${charlieToken}; ${ACCOUNTS_COOKIE}=${encodeURIComponent(v5)}`,
        },
        body: JSON.stringify({ scope: "all" }),
      }),
    );
    expect(extractCookieValue(logoutAll.headers, ACCOUNTS_COOKIE)).toBe("");
  });
});
