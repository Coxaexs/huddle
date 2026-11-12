import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { ensureSchema } from "@/lib/schema";
import { Permission as P } from "@/lib/permissions";
import { resetMemoryRateLimits } from "@/lib/rate-limit";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/hub-client", () => ({
  publishMessage: vi.fn(),
  publishMessageEvent: vi.fn(),
  publishStructureChange: vi.fn(),
  playerCommand: vi.fn(async (_id: string, action: unknown) => ({ action })),
  playerState: vi.fn(async () => ({ track: null, queue: [] })),
  rawPlayerState: vi.fn(async () => null),
}));
vi.mock("@/lib/music", () => ({ resolveTrack: vi.fn(async () => ({ title: "resolved" })), resolveTracks: vi.fn(async () => []) }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  currentUser: vi.fn(),
}));

import { currentUser } from "@/lib/auth";
import { POST as createApp } from "@/app/api/applications/route";
import { POST as authorize } from "@/app/api/oauth2/authorize/route";
import { GET as menus } from "@/app/api/bot-menus/route";
import { handleDiscordRest } from "@/lib/discord/rest";
import { snowflakeFor } from "@/lib/discord/snowflake";

function realDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (query: string, params: unknown[] = []) => {
    const values = params as Array<string | number | null>;
    return {
      bind: (...args: unknown[]) => statement(query, args),
      async first<T>() { return (sqlite.prepare(query).get(...values) ?? null) as T; },
      async all<T>() { return { results: sqlite.prepare(query).all(...values) as T[] }; },
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

let db: D1Database;
const NOW = "2026-11-05T12:00:00.000Z";
const json = (body: unknown, method = "POST", headers: Record<string, string> = {}) =>
  new Request("http://x/", { method, headers, body: JSON.stringify(body) });
const VOICE = P.VIEW_CHANNEL | P.CONNECT | P.SPEAK;

function signIn(id: string) {
  (currentUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id, username: id, display_name: id, avatar: "a", color: "#000", avatar_url: null, is_admin: 0 } as never);
}
async function api(token: string, method: string, path: string, body?: unknown) {
  const request = new Request(`http://x/hangout/api/v10/${path}`, {
    method,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handleDiscordRest(request, "10", path.split("/"), "/hangout");
}
async function makeBot(name = "Quiz") {
  signIn("dev");
  const made = (await (await createApp(json({ name }))).json()) as { application: { id: string }; token: string };
  return { id: made.application.id, token: made.token };
}
async function add(id: string, server: string, permissions: number) {
  signIn(server === "s1" ? "owner" : "stranger");
  return authorize(json({ client_id: id, guild_id: server, permissions }));
}
const setMenu = (token: string, items: unknown) => api(token, "PUT", "applications/x/menu", { items });
const commands = (token: string, names: string[]) =>
  api(token, "PUT", "applications/x/commands", names.map((name) => ({ name, description: name })));
async function seen(server: string, as: string) {
  signIn(as);
  return menus(new Request(`http://x/api/bot-menus?serverId=${server}`));
}

beforeAll(async () => {
  db = realDb();
  await ensureSchema(db);
  setBindings({ DB: db, BOT_TOKEN: "master" } as never);
});

beforeEach(async () => {
  vi.clearAllMocks();
  resetMemoryRateLimits();
  for (const table of ["applications", "server_bots", "server_members", "channels", "servers", "users", "bot_menus", "discord_commands"]) {
    await db.exec(`DELETE FROM ${table}`).catch(() => undefined);
  }
  for (const id of ["owner", "dev", "stranger", "member"]) {
    await db
      .prepare(`INSERT INTO users (id, username, username_lower, display_name, password_hash, avatar, color, is_admin, created_at, last_seen_at) VALUES (?, ?, ?, ?, 'x', 'a', '#000', 0, ?, ?)`)
      .bind(id, id, id, id, NOW, NOW)
      .run();
  }
  for (const [id, by] of [["s1", "owner"], ["s2", "stranger"]]) {
    await db.prepare("INSERT INTO servers (id, name, icon, color, created_by, created_at) VALUES (?, ?, 'S', '#000', ?, ?)").bind(id, id, by, NOW).run();
    await db.prepare("INSERT INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)").bind(id, by, NOW).run();
  }
  await db.prepare("INSERT INTO server_members (server_id, user_id, joined_at) VALUES ('s1', 'member', ?)").bind(NOW).run();
  for (const [id, server] of [["v1", "s1"], ["v2", "s2"]]) {
    await db.prepare("INSERT INTO channels (id, server_id, name, kind, created_at) VALUES (?, ?, ?, 'voice', ?)").bind(id, server, id, NOW).run();
  }
  await snowflakeFor("guild", "s1", NOW);
});

describe("bot menus", () => {
  it("shows a bot's menu in servers that added it, and only to their members", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", VOICE);
    await commands(bot.token, ["quiz"]);
    expect((await setMenu(bot.token, [{ label: "Start a quiz", icon: "🧠", command: "/quiz start" }])).status).toBe(200);

    const inS1 = (await (await seen("s1", "member")).json()) as { menus: Array<{ applicationId: string; botName: string; items: Array<{ label: string; command: string; fill: boolean }> }> };
    expect(inS1.menus).toHaveLength(1);
    expect(inS1.menus[0]).toMatchObject({ applicationId: bot.id, botName: "Quiz" });
    expect(inS1.menus[0].items).toEqual([{ label: "Start a quiz", icon: "🧠", command: "/quiz start", fill: false }]);

    // s2 never added the bot; and someone outside s1 can't read s1's menus.
    expect(((await (await seen("s2", "stranger")).json()) as { menus: unknown[] }).menus).toEqual([]);
    expect((await seen("s1", "stranger")).status).toBe(403);
  });

  it("drops items that run a command the bot does not own", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", VOICE);
    await commands(bot.token, ["quiz"]);
    await setMenu(bot.token, [
      { label: "Scores", command: "/quiz scores" },
      { label: "Free prizes", command: "/purge 100" },
      { label: "Pick a topic", command: "/quiz topic", fill: true },
    ]);
    const { menus: list } = (await (await seen("s1", "member")).json()) as { menus: Array<{ items: Array<{ label: string; fill: boolean }> }> };
    expect(list[0].items.map((item) => item.label)).toEqual(["Scores", "Pick a topic"]);
    expect(list[0].items[1].fill).toBe(true);
  });

  it("shows nothing for a bot with no commands of its own", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", VOICE);
    await setMenu(bot.token, [{ label: "Play", command: "/play something" }]);
    expect(((await (await seen("s1", "member")).json()) as { menus: unknown[] }).menus).toEqual([]);
  });

  it("refuses a menu that is malformed or too long", async () => {
    const bot = await makeBot();
    expect((await setMenu(bot.token, "nope")).status).toBe(400);
    expect((await setMenu(bot.token, [{ label: "", command: "/quiz" }])).status).toBe(400);
    expect((await setMenu(bot.token, [{ label: "No slash", command: "quiz" }])).status).toBe(400);
    expect((await setMenu(bot.token, [{ label: "Two lines", command: "/quiz a\n/purge" }])).status).toBe(400);
    const many = Array.from({ length: 11 }, (_, index) => ({ label: `Item ${index}`, command: "/quiz" }));
    expect((await setMenu(bot.token, many)).status).toBe(400);
  });

  it("lets the bot read back and clear its menu", async () => {
    const bot = await makeBot();
    await setMenu(bot.token, [{ label: "Start", command: "/quiz start" }]);
    const read = (await (await api(bot.token, "GET", "applications/x/menu")).json()) as { items: unknown[] };
    expect(read.items).toHaveLength(1);
    expect((await api(bot.token, "DELETE", "applications/x/menu")).status).toBe(204);
    expect(((await (await api(bot.token, "GET", "applications/x/menu")).json()) as { items: unknown[] }).items).toEqual([]);
  });
});
