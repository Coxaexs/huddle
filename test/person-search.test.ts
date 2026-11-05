import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { ensureSchema } from "@/lib/schema";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  currentUser: vi.fn(),
}));

import { currentUser } from "@/lib/auth";
import { GET as listMembers } from "@/app/api/members/route";
import { GET as searchUsers } from "@/app/api/users/search/route";

function realDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (query: string, params: unknown[] = []) => {
    const values = params as Array<string | number | null>;
    return {
      bind: (...args: unknown[]) => {
        // D1 refuses these and SQLite here does not, so hold this copy to D1's limit.
        const tooLong = args.some((arg) => typeof arg === "string" && Buffer.byteLength(arg) > 50);
        if (/\b(LIKE|GLOB)\b/i.test(query) && tooLong) throw new Error("D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR");
        return statement(query, args);
      },
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
    batch: async (list: Array<ReturnType<typeof statement>>) => Promise.all(list.map((item) => item.run())),
    exec: async (query: string) => sqlite.exec(query),
  } as unknown as D1Database;
}

const LONG = ["this is a long search phrase that goes well past fifty bytes total", "ğ".repeat(30)];
const NOW = new Date().toISOString();
let db: D1Database;

async function person(id: string, username: string, displayName: string) {
  await db
    .prepare(
      `INSERT INTO users (id, username, username_lower, display_name, password_hash, avatar, color, is_admin, created_at, last_seen_at)
       VALUES (?,?,?,?,'x','a','#000',0,?,?)`,
    )
    .bind(id, username, username.toLowerCase(), displayName, NOW, NOW)
    .run();
}
async function friend(id: string) {
  await db
    .prepare("INSERT INTO friendships (id, user_id, friend_id, status, created_at, updated_at) VALUES (?,'me',?,'accepted',?,?)")
    .bind(`f-${id}`, id, NOW, NOW)
    .run();
}
async function member(id: string, nickname: string | null = null) {
  await db.prepare("INSERT INTO server_members (server_id, user_id, joined_at, nickname) VALUES ('s1',?,?,?)").bind(id, NOW, nickname).run();
}

async function users(q: string) {
  const res = await searchUsers(new Request(`http://x/?${new URLSearchParams({ q })}`));
  expect(res.status).toBe(200);
  return ((await res.json()) as { users: Array<{ username: string }> }).users.map((user) => user.username);
}
async function members(q: string) {
  const res = await listMembers(new Request(`http://x/?${new URLSearchParams({ serverId: "s1", q })}`));
  expect(res.status).toBe(200);
  return ((await res.json()) as { members: Array<{ username: string }> }).members.map((one) => one.username).sort();
}

beforeAll(async () => {
  db = realDb();
  await ensureSchema(db);
});

beforeEach(async () => {
  setBindings({ DB: db } as never);
  for (const table of ["friendships", "server_members", "users"]) await db.exec(`DELETE FROM ${table}`);
  await person("me", "me", "Me");
  await person("a", "alex_stone", "Alexandra");
  await person("b", "malexa", "Mal");
  await person("c", "alex", "Zed");
  await person("d", "stranger", "Sam Stranger");
  await person("e", "alexxstone", "Other");
  for (const id of ["a", "b", "c", "e"]) await friend(id);
  for (const id of ["me", "a", "b", "e"]) await member(id);
  await db.prepare("UPDATE server_members SET nickname = 'Captain' WHERE user_id = 'b'").run();
  vi.mocked(currentUser).mockResolvedValue({ id: "me", username: "me", is_admin: 0 } as never);
});

describe("searching for a person", () => {
  it.each(LONG)("answers a long search with nobody rather than an error: %s", async (q) => {
    expect(await users(q)).toEqual([]);
  });

  it("finds a friend by any part of their name", async () => {
    expect(await users("stone")).toEqual(expect.arrayContaining(["alex_stone", "alexxstone"]));
    expect(await users("ALEXANDRA")).toEqual(["alex_stone"]);
  });

  it("finds a stranger only by their whole name", async () => {
    expect(await users("strang")).toEqual([]);
    expect(await users("stranger")).toEqual(["stranger"]);
    expect(await users("Sam Stranger")).toEqual(["stranger"]);
  });

  it("puts the exact name first, then names that start with it", async () => {
    const found = await users("alex");
    expect(found[0]).toBe("alex");
    expect(found.indexOf("malexa")).toBe(found.length - 1);
  });

  it("reads _ and % as plain characters", async () => {
    expect(await users("alex_")).toEqual(["alex_stone"]);
    expect(await users("%")).toEqual([]);
  });
});

describe("searching a server's members", () => {
  it.each(LONG)("answers a long search with nobody rather than an error: %s", async (q) => {
    expect(await members(q)).toEqual([]);
  });

  it("matches a username, a display name or a nickname", async () => {
    expect(await members("stone")).toEqual(["alex_stone", "alexxstone"]);
    expect(await members("alexandra")).toEqual(["alex_stone"]);
    expect(await members("captain")).toEqual(["malexa"]);
  });

  it("only looks inside this server", async () => {
    expect(await members("stranger")).toEqual([]);
  });

  it("reads _ and % as plain characters", async () => {
    expect(await members("alex_")).toEqual(["alex_stone"]);
    expect(await members("%")).toEqual([]);
  });

  it("lists everyone with no search", async () => {
    expect(await members("")).toHaveLength(4);
  });
});
