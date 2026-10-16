import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { ensureSchema } from "@/lib/schema";
import { reportNotifierIds } from "@/lib/permissions";

vi.mock("cloudflare:workers", () => ({ env: {} }));

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

const NOW = new Date().toISOString();

async function addUser(id: string, isAdmin = 0) {
  await db
    .prepare(
      `INSERT INTO users (id, username, username_lower, display_name, password_hash, avatar, color, is_admin, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, 'x', 'a', '#000', ?, ?, ?)`,
    )
    .bind(id, id, id, id, isAdmin, NOW, NOW)
    .run();
}

async function addServer(id: string, createdBy: string) {
  await db
    .prepare("INSERT INTO servers (id, name, icon, color, created_by, created_at) VALUES (?, ?, 'S', '#000', ?, ?)")
    .bind(id, id, createdBy, NOW)
    .run();
}

async function addRole(serverId: string, roleId: string, permissions: number) {
  await db
    .prepare(
      "INSERT INTO roles (id, server_id, name, permissions, position, created_at) VALUES (?, ?, 'r', ?, 0, ?)",
    )
    .bind(roleId, serverId, permissions, NOW)
    .run();
}

async function addMemberRole(serverId: string, userId: string, roleId: string) {
  await db
    .prepare("INSERT INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)")
    .bind(serverId, userId, roleId)
    .run();
}

beforeAll(async () => {
  db = realDb();
  await ensureSchema(db);
  setBindings({ DB: db } as never);
});

beforeEach(async () => {
  // Reuse the same schema but clear rows between tests.
  await db.exec("DELETE FROM member_roles");
  await db.exec("DELETE FROM roles");
  await db.exec("DELETE FROM servers");
  await db.exec("DELETE FROM users");
});

describe("reportNotifierIds", () => {
  it("includes the instance admin, server owner, and message/server managers, but not the reporter", async () => {
    await addUser("admin", 1); // global admin
    await addUser("owner", 0);
    await addUser("mod", 0);
    await addUser("member", 0);
    await addUser("reporter", 0);

    await addServer("s1", "owner");
    await addRole("s1", "role-mod", 1 << 21); // MANAGE_MESSAGES
    await addMemberRole("s1", "mod", "role-mod");

    const ids = await reportNotifierIds(db, "s1", "reporter");
    expect(ids.sort()).toEqual(["admin", "mod", "owner"]);
  });

  it("excludes the reporter even when they are the server owner", async () => {
    await addUser("owner", 0);
    await addUser("reporter", 0);

    await addServer("s1", "reporter"); // reporter is also the owner

    const ids = await reportNotifierIds(db, "s1", "reporter");
    expect(ids).toEqual([]);
  });

  it("includes the server owner even when they are the only notifier", async () => {
    await addUser("member", 0);
    await addUser("reporter", 0);

    await addServer("s1", "member"); // owner is not the reporter

    const ids = await reportNotifierIds(db, "s1", "reporter");
    expect(ids).toEqual(["member"]);
  });

  it("returns the server owner plus instance admin when the reporter is a moderator", async () => {
    await addUser("admin", 1);
    await addUser("owner", 0);
    await addUser("mod", 0);
    await addUser("reporter", 0);

    await addServer("s1", "owner");
    await addRole("s1", "role-mod", 1 << 3); // MANAGE_SERVER
    await addMemberRole("s1", "mod", "role-mod");
    await addMemberRole("s1", "reporter", "role-mod"); // reporter is also a mod

    const ids = await reportNotifierIds(db, "s1", "reporter");
    expect(ids.sort()).toEqual(["admin", "mod", "owner"]);
  });
});
