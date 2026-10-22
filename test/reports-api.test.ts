import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { ensureSchema } from "@/lib/schema";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/hub-client", () => ({ publishMessageEvent: vi.fn() }));
vi.mock("@/lib/push", () => ({
  sendPushNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth", () => ({
  currentUser: vi.fn(),
  isInstanceAdmin: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "unauthorized" }, { status: 401 })),
}));

import { sendPushNotifications } from "@/lib/push";
import { currentUser } from "@/lib/auth";
import { POST } from "@/app/api/reports/route";

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

beforeAll(async () => {
  db = realDb();
  await ensureSchema(db);
  setBindings({ DB: db } as never);
});

beforeEach(async () => {
  await db.exec("DELETE FROM message_reports");
  await db.exec("DELETE FROM messages");
  await db.exec("DELETE FROM server_members");
  await db.exec("DELETE FROM channels");
  await db.exec("DELETE FROM servers");
  await db.exec("DELETE FROM users");
  await db.exec("DELETE FROM member_roles");
  await db.exec("DELETE FROM roles");
  await db.exec("DELETE FROM channel_overwrites");
  vi.clearAllMocks();
});

async function seed() {
  await db
    .prepare(
      `INSERT INTO users (id, username, username_lower, display_name, password_hash, avatar, color, is_admin, created_at, last_seen_at)
       VALUES ('reporter','reporter','reporter','Reporter','x','a','#000',0,?,?),
              ('mod','mod','mod','Mod','x','a','#000',0,?,?),
              ('owner','owner','owner','Owner','x','a','#000',0,?,?)`,
    )
    .bind(NOW, NOW, NOW, NOW, NOW, NOW)
    .run();
  await db
    .prepare("INSERT INTO servers (id, name, icon, color, created_by, created_at) VALUES ('s1','Srv','S','#000','owner',?)")
    .bind(NOW)
    .run();
  await db
    .prepare("INSERT INTO channels (id, server_id, name, kind, created_at) VALUES ('c1','s1','general','text',?)")
    .bind(NOW)
    .run();
  await db
    .prepare(
      `INSERT INTO messages (id, channel, channel_id, author, avatar, color, content, is_bot, created_at)
       VALUES ('m1','general','c1','author','a','#000','hello',0,?)`,
    )
    .bind(NOW)
    .run();
  await db
    .prepare("INSERT INTO server_members (server_id, user_id, joined_at) VALUES ('s1','reporter',?),('s1','mod',?)")
    .bind(NOW, NOW)
    .run();
}

function post(body: { messageId: string; reason: string }) {
  return POST(
    new Request("http://x/api/reports", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/reports", () => {
  it("files the report and notifies the server's moderators", async () => {
    await seed();
    await db
      .prepare("INSERT INTO roles (id, server_id, name, permissions, position, created_at) VALUES ('r1','s1','mod',?,0,?)")
      .bind(1 << 21, NOW)
      .run(); // MANAGE_MESSAGES
    await db
      .prepare("INSERT INTO member_roles (server_id, user_id, role_id) VALUES ('s1','mod','r1')")
      .run();
    (currentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "reporter",
      username: "reporter",
      display_name: "Reporter",
    } as never);

    const res = await post({ messageId: "m1", reason: "This is spam" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; id: string };
    expect(json.ok).toBe(true);

    const report = await db
      .prepare("SELECT * FROM message_reports WHERE id = ?")
      .bind(json.id)
      .first();
    expect(report).toMatchObject({
      server_id: "s1",
      channel_id: "c1",
      message_id: "m1",
      reporter_id: "reporter",
      reason: "This is spam",
      status: "open",
    });

    expect(sendPushNotifications).toHaveBeenCalledTimes(1);
    const [, ids, payload] = (sendPushNotifications as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ids.sort()).toEqual(["mod", "owner"]);
    expect(payload.title).toBe("New message report");
    expect(payload.body).toContain("Reporter");
    expect(payload.body).toContain("This is spam");
    expect(payload.body).toContain("#general");
  });

  it("does not notify when there are no moderators", async () => {
    await seed();
    // The reporter is also the server owner, and no one holds mod permissions.
    await db.prepare("UPDATE servers SET created_by = 'reporter' WHERE id = 's1'").run();
    (currentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "reporter",
      username: "reporter",
      display_name: "Reporter",
    } as never);

    const res = await post({ messageId: "m1", reason: "spam" });
    expect(res.status).toBe(200);
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });

  it("refuses a message in a channel hidden from the reporter", async () => {
    await seed();
    await db
      .prepare("INSERT INTO channel_overwrites VALUES ('c1', 's1', 'everyone', '', 0, ?)")
      .bind(1 << 30) // VIEW_CHANNEL
      .run();
    (currentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "reporter",
      username: "reporter",
      display_name: "Reporter",
    } as never);

    const res = await post({ messageId: "m1", reason: "spam" });
    expect(res.status).toBe(404);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM message_reports").first()).toEqual({ n: 0 });
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });
});
