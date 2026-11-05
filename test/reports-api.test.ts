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
import { currentUser, isInstanceAdmin } from "@/lib/auth";
import { GET, PATCH, POST } from "@/app/api/reports/route";

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
  await db.exec("DELETE FROM dm_members");
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

async function seedDm() {
  await seed();
  await db.prepare("UPDATE users SET is_admin = 1 WHERE id = 'owner'").run();
  await db
    .prepare("INSERT INTO channels (id, server_id, name, kind, created_at) VALUES ('d1','dm','dm','dm',?)")
    .bind(NOW)
    .run();
  await db.prepare("INSERT INTO dm_members (channel_id, user_id) VALUES ('d1','reporter')").run();
  await db
    .prepare(
      `INSERT INTO messages (id, channel, channel_id, author, avatar, color, content, is_bot, created_at)
       VALUES ('m2','dm','d1','author','a','#000','hi there',0,?)`,
    )
    .bind(NOW)
    .run();
}

function signIn(id: string) {
  (isInstanceAdmin as ReturnType<typeof vi.fn>).mockReturnValue(false);
  (currentUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id, username: id, display_name: id } as never);
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

  it("rings the instance admin urgently and moderators normally", async () => {
    await seed();
    await db.prepare("UPDATE users SET is_admin = 1 WHERE id = 'owner'").run();
    signIn("reporter");

    const res = await post({ messageId: "m1", reason: "spam" });
    expect(res.status).toBe(200);
    const calls = (sendPushNotifications as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(["owner"]);
    expect(calls[0][2].urgent).toBe(true);
  });

  it("counts the same message reported twice as one report and one alert", async () => {
    await seedDm();
    signIn("reporter");

    const first = (await (await post({ messageId: "m2", reason: "spam" })).json()) as { id: string };
    const second = (await (await post({ messageId: "m2", reason: "spam" })).json()) as { id: string };
    expect(second.id).toBe(first.id);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM message_reports").first()).toEqual({ n: 1 });
    expect(sendPushNotifications).toHaveBeenCalledTimes(1);
  });
});

describe("DM reports", () => {
  it("files the report and alerts only the instance admin", async () => {
    await seedDm();
    signIn("reporter");

    const res = await post({ messageId: "m2", reason: "He keeps asking my age" });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    expect(await db.prepare("SELECT server_id, channel_id FROM message_reports WHERE id = ?").bind(id).first()).toEqual({
      server_id: "dm",
      channel_id: "d1",
    });

    const calls = (sendPushNotifications as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(["owner"]);
    expect(calls[0][2].urgent).toBe(true);
    expect(calls[0][2].body).toContain("a direct message");
    expect(calls[0][2].body).not.toContain("hi there");
  });

  it("refuses someone who is not in the conversation", async () => {
    await seedDm();
    signIn("mod");

    const res = await post({ messageId: "m2", reason: "spam" });
    expect(res.status).toBe(403);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM message_reports").first()).toEqual({ n: 0 });
  });

  it("only shows DM reports to instance admins", async () => {
    await seedDm();
    signIn("reporter");
    await post({ messageId: "m2", reason: "spam" });

    signIn("mod");
    const refused = await GET(new Request("http://x/api/reports?serverId=dm"));
    expect(refused.status).toBe(403);

    (isInstanceAdmin as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const shown = (await (await GET(new Request("http://x/api/reports"))).json()) as {
      reports: Array<{ channelName: string; messageContent: string }>;
    };
    expect(shown.reports[0]).toMatchObject({ channelName: "Direct message", messageContent: "hi there" });
  });

  it("only lets instance admins resolve DM reports", async () => {
    await seedDm();
    signIn("reporter");
    const { id } = (await (await post({ messageId: "m2", reason: "spam" })).json()) as { id: string };

    signIn("mod");
    const res = await PATCH(
      new Request("http://x/api/reports", { method: "PATCH", body: JSON.stringify({ reportId: id, status: "dismissed" }) }),
    );
    expect(res.status).toBe(403);
    expect(await db.prepare("SELECT status FROM message_reports WHERE id = ?").bind(id).first()).toEqual({ status: "open" });
  });
});
