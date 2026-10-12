import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { ensureSchema } from "@/lib/schema";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { GET as overview } from "@/app/api/admin/route";
import { POST as setFeatures } from "@/app/api/admin/features/route";
import { POST as signOut } from "@/app/api/admin/users/[id]/signout/route";
import { allDisabledFeatures, resetFeatureCache } from "@/lib/features";
import { currentUser, type User } from "@/lib/auth";
import {
  adminCreateInvite,
  adminDeleteServer,
  adminDeleteUser,
  adminDeleteMessage,
  adminInvites,
  deleteInvites,
  purgeUserMessages,
  searchMessages,
  setSuspended,
  setVoiceRegion,
} from "@/lib/admin-tools";

/** D1 over a real in-memory SQLite, so the schema and SQL run for real. */
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
      async raw() {
        return sqlite.prepare(query).all(...values).map((row) => Object.values(row as object));
      },
    };
  };
  return {
    prepare: (query: string) => statement(query),
    batch: async (list: Array<ReturnType<typeof statement>>) => Promise.all(list.map((item) => item.run())),
    exec: async (query: string) => sqlite.exec(query),
  } as unknown as D1Database;
}

const NOW = new Date().toISOString();
const URL_BASE = "https://hoffle.example/hangout/api/admin";
let db: D1Database;

async function addUser(id: string, isAdmin = 0) {
  await db
    .prepare(
      `INSERT INTO users (id, username, username_lower, display_name, password_hash, avatar, color, is_admin, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, 'x', '1', '#fff', ?, ?, ?)`,
    )
    .bind(id, id, id, id.toUpperCase(), isAdmin, NOW, NOW)
    .run();
}

async function session(userId: string, token = `token-${userId}`): Promise<string> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(hash, userId, NOW, "2099-01-01T00:00:00.000Z")
    .run();
  return `huddle_session=${token}`;
}

const post = (path: string, cookie: string, body?: unknown) =>
  new Request(`${URL_BASE}${path}`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  db = realDb();
  await ensureSchema(db);
});

beforeEach(async () => {
  for (const table of ["messages", "sessions", "users", "channels", "servers", "server_members", "audit_log", "meta", "invites", "dm_members", "friendships"]) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
  resetFeatureCache();
  await addUser("kiwi", 1);
  await addUser("flo");
  await addUser("rando");
  await db.prepare("INSERT INTO servers (id, name, icon, color, created_by, created_at) VALUES ('s1', 'Hoffle', 'H', '#000', 'kiwi', ?)").bind(NOW).run();
  await db.prepare("INSERT INTO channels (id, server_id, name, kind, created_at) VALUES ('c1', 's1', 'general', 'text', ?)").bind(NOW).run();
  await db.prepare("INSERT INTO server_members (server_id, user_id, joined_at) VALUES ('s1', 'rando', ?)").bind(NOW).run();
  for (const id of ["m1", "m2"]) {
    await db
      .prepare(
        `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, is_bot, created_at)
         VALUES (?, 'general', 'c1', 'rando', 'Rando', '1', '#fff', 'hi', 0, ?)`,
      )
      .bind(id, NOW)
      .run();
  }
  setBindings({ DB: db, ADMIN_IDS: "flo", FEATURES_DISABLED: "msn" });
});

describe("/admin", () => {
  it("only lets instance admins in", async () => {
    const asRando = await overview(new Request(URL_BASE, { headers: { cookie: await session("rando") } }));
    expect(asRando.status).toBe(403);
    const asFlo = await overview(new Request(URL_BASE, { headers: { cookie: await session("flo") } }));
    expect(asFlo.status).toBe(200);
  });

  it("counts members, messages and servers", async () => {
    const response = await overview(new Request(URL_BASE, { headers: { cookie: await session("kiwi") } }));
    const data = (await response.json()) as {
      overview: { users: number; messages: number; messages24h: number; servers: number; messagesPerDay: Array<{ count: number }> };
      users: Array<{ id: string; messages: number; servers: number }>;
      servers: Array<{ id: string; members: number; messages: number }>;
    };
    expect(data.overview).toMatchObject({ users: 3, messages: 2, messages24h: 2, servers: 1 });
    expect(data.overview.messagesPerDay).toHaveLength(14);
    expect(data.overview.messagesPerDay.at(-1)?.count).toBe(2);
    expect(data.users.find((user) => user.id === "rando")).toMatchObject({ messages: 2, servers: 1 });
    expect(data.servers).toEqual([expect.objectContaining({ id: "s1", members: 1, messages: 2 })]);
  });

  it("switches side features off and on at runtime, keeping config ones off", async () => {
    const cookie = await session("kiwi");
    const off = await setFeatures(post("/features", cookie, { disabled: ["games", "messages", "bogus"] }));
    const { features } = (await off.json()) as { features: Array<{ id: string; offHere: boolean; offInConfig: boolean }> };
    expect(features.find((f) => f.id === "games")).toMatchObject({ offHere: true });
    expect(features.find((f) => f.id === "msn")).toMatchObject({ offInConfig: true, offHere: false });
    expect(await allDisabledFeatures({ FEATURES_DISABLED: "msn", DB: db })).toEqual(["msn", "games"]);

    // Another worker reads it from the database once its cache expires.
    resetFeatureCache();
    expect(await allDisabledFeatures({ DB: db })).toEqual(["games"]);

    await setFeatures(post("/features", cookie, { disabled: [] }));
    expect(await allDisabledFeatures({ DB: db })).toEqual([]);
    const audit = await db.prepare("SELECT action, target_id FROM audit_log ORDER BY created_at").all<{ action: string; target_id: string }>();
    expect(audit.results).toEqual([
      { action: "feature.off", target_id: "games" },
      { action: "feature.on", target_id: "games" },
    ]);
  });

  it("signs someone out everywhere", async () => {
    await session("rando", "phone");
    await session("rando", "laptop");
    const response = await signOut(post("/users/rando/signout", await session("kiwi")), {
      params: Promise.resolve({ id: "rando" }),
    });
    expect(await response.json()).toEqual({ ended: 2 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'rando'").first()).toEqual({ n: 0 });
  });
});

const kiwi = { id: "kiwi", display_name: "KIWI", is_admin: 1 } as User;

describe("admin tools", () => {
  it("creates and deletes invite codes", async () => {
    const made = await adminCreateInvite(db, { serverId: "s1", maxUses: 5, note: "for ana" }, kiwi);
    expect(made).toHaveProperty("code");
    const code = (made as { code: string }).code;
    expect(await adminInvites(db)).toEqual([expect.objectContaining({ code, server: "Hoffle", maxUses: 5, createdBy: "KIWI" })]);
    expect(await adminCreateInvite(db, { serverId: "nope", maxUses: 1, note: null }, kiwi)).toEqual({ error: "No such server." });
    expect(await deleteInvites(db, [code], kiwi)).toBe(1);
    expect(await adminInvites(db)).toEqual([]);
  });

  it("moves a voice room to another voice server", async () => {
    await db.prepare("INSERT INTO channels (id, server_id, name, kind, created_at) VALUES ('v1', 's1', 'Lounge', 'voice', ?)").bind(NOW).run();
    expect(await setVoiceRegion(db, "v1", "de", kiwi)).toBe(true);
    expect(await db.prepare("SELECT rtc_region FROM channels WHERE id = 'v1'").first()).toEqual({ rtc_region: "de" });
    expect(await setVoiceRegion(db, "c1", "de", kiwi)).toBe(false); // a text channel
  });

  it("deletes a server only with its exact name, never the home server", async () => {
    expect(await adminDeleteServer(db, "hangout", "The Hangout", kiwi)).toMatchObject({ ok: false, status: 400 });
    expect(await adminDeleteServer(db, "s1", "hoffle", kiwi)).toMatchObject({ ok: false, status: 400 });
    expect(await adminDeleteServer(db, "s1", "Hoffle", kiwi)).toEqual({ ok: true, name: "Hoffle" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE channel_id = 'c1'").first()).toEqual({ n: 0 });
    const audit = await db.prepare("SELECT server_id, action FROM audit_log WHERE action = 'server.delete'").first();
    expect(audit).toEqual({ server_id: "instance", action: "server.delete" });
  });

  it("searches by words or regex, leaving DMs out unless asked", async () => {
    await db.prepare("UPDATE messages SET content = 'FREE nitro at discord.gg/abc' WHERE id = 'm1'").run();
    await db.prepare("INSERT INTO channels (id, server_id, name, kind, created_at) VALUES ('d1', 'dm', 'dm', 'dm', ?)").bind(NOW).run();
    await db
      .prepare(
        `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, is_bot, created_at)
         VALUES ('m3', 'dm', 'd1', 'flo', 'FLO', '1', '#fff', 'free nitro secretly', 0, ?)`,
      )
      .bind(NOW)
      .run();
    const words = await searchMessages(db, { query: "nitro free", mode: "words" });
    expect("hits" in words && words.hits.map((hit) => hit.id)).toEqual(["m1"]);
    const withDms = await searchMessages(db, { query: "nitro free", mode: "words", includeDms: true });
    expect("hits" in withDms && withDms.hits.map((hit) => hit.id).sort()).toEqual(["m1", "m3"]);
    const regex = await searchMessages(db, { query: "disc(o|0)rd\\.gg/\\w+", mode: "regex" });
    expect("hits" in regex && regex.hits.map((hit) => hit.id)).toEqual(["m1"]);
    expect(await searchMessages(db, { query: "(", mode: "regex" })).toHaveProperty("error");
    // LIKE wildcards in the words are literal.
    const literal = await searchMessages(db, { query: "100%", mode: "words" });
    expect("hits" in literal && literal.hits).toEqual([]);
  });

  it("deletes one message, or every message from one person", async () => {
    expect(await adminDeleteMessage(db, "m1", kiwi)).toBe(true);
    expect(await adminDeleteMessage(db, "m1", kiwi)).toBe(false);
    expect(await purgeUserMessages(db, "rando", kiwi)).toBe(1);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE deleted_at IS NULL").first()).toEqual({ n: 0 });
  });

  it("suspends an account so its sessions stop working", async () => {
    const cookie = await session("rando");
    const request = () => new Request(URL_BASE, { headers: { cookie } });
    expect((await currentUser(request()))?.id).toBe("rando");
    expect(await setSuspended(db, "rando", true, kiwi)).toEqual({ ok: true });
    expect(await currentUser(request())).toBeNull();
    expect(await setSuspended(db, "kiwi", true, kiwi)).toMatchObject({ status: 400 });
    expect(await setSuspended(db, "rando", false, kiwi)).toEqual({ ok: true });
    expect(await db.prepare("SELECT suspended_at FROM users WHERE id = 'rando'").first()).toEqual({ suspended_at: null });
  });

  it("deletes an account only with its exact username, keeping messages unless asked", async () => {
    await session("rando");
    await db.prepare("INSERT INTO friendships (user_id, friend_id, status, created_at) VALUES ('flo', 'rando', 'accepted', ?)").bind(NOW).run().catch(() => undefined);
    expect(await adminDeleteUser(db, "rando", { confirmUsername: "Rando", deleteMessages: false }, kiwi)).toMatchObject({ status: 400 });
    expect(await adminDeleteUser(db, "kiwi", { confirmUsername: "kiwi", deleteMessages: false }, kiwi)).toMatchObject({ status: 400 });
    expect(await adminDeleteUser(db, "rando", { confirmUsername: "rando", deleteMessages: false }, kiwi)).toEqual({ ok: true, messages: 0 });
    expect(await db.prepare("SELECT 1 FROM users WHERE id = 'rando'").first()).toBeNull();
    for (const table of ["sessions", "server_members"]) {
      expect(await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = 'rando'`).first()).toEqual({ n: 0 });
    }
    expect(await db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE friend_id = 'rando'").first()).toEqual({ n: 0 });
    // Their messages stay, under their name.
    expect(await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = 'rando' AND deleted_at IS NULL").first()).toEqual({ n: 2 });
  });
});
