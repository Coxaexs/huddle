import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { ensureSchema, backfillMusicApplication, MUSIC_BOT_PERMISSIONS } from "@/lib/schema";
import { ALL_PERMISSIONS, BOT_PERMISSION_INFO, Permission } from "@/lib/permissions";
import { resetMemoryRateLimits } from "@/lib/rate-limit";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/hub-client", () => ({
  publishMessage: vi.fn(),
  publishMessageEvent: vi.fn(),
  publishStructureChange: vi.fn(),
  hubState: vi.fn(async () => ({ online: [], voice: {}, players: {}, serverNow: 1 })),
}));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  currentUser: vi.fn(),
}));

import { currentUser } from "@/lib/auth";
import { POST as createApp } from "@/app/api/applications/route";
import { DELETE as deleteApp, PATCH as patchApp } from "@/app/api/applications/[id]/route";
import { POST as resetToken } from "@/app/api/applications/[id]/token/route";
import { GET as authorizeInfo, POST as authorize } from "@/app/api/oauth2/authorize/route";
import { POST as addServerBot } from "@/app/api/servers/[id]/bots/route";
import { GET as botServers, resetBotServerCache } from "@/app/api/bot/servers/route";
import { GET as v1Guilds } from "@/app/api/v1/guilds/route";
import { handleDiscordRest } from "@/lib/discord/rest";
import { listCommandsForServer } from "@/lib/discord/interactions";
import { snowflakeFor } from "@/lib/discord/snowflake";
import { authenticateBot } from "@/lib/bot-auth";
import { botMayReceive, memberPatchFlags, requiredFor, withinGrant } from "@/lib/discord/app-permissions";

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
    batch: async (list: Array<ReturnType<typeof statement>>) => Promise.all(list.map((item) => item.run())),
    exec: async (query: string) => sqlite.exec(query),
  } as unknown as D1Database;
}

let db: D1Database;
const NOW = "2026-11-05T12:00:00.000Z";
const P = Permission;
const json = (body: unknown, method = "POST") => new Request("http://x/", { method, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function signIn(id: string) {
  (currentUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id, username: id, display_name: id, is_admin: id === "root" ? 1 : 0 } as never);
}

/** A hostile bot's view: the real REST entry point with its token. */
async function api(token: string, method: string, path: string, body?: unknown) {
  const request = new Request(`http://x/hangout/api/v10/${path}`, {
    method,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handleDiscordRest(request, "10", path.split("/"), "/hangout");
}

const guild = (id: string) => snowflakeFor("guild", id, NOW);
const channel = (id: string) => snowflakeFor("channel", id, NOW);

async function makeBot(owner = "dev", name = "Trivia") {
  signIn(owner);
  const made = (await (await createApp(json({ name }))).json()) as { application: { id: string }; token: string };
  return { id: made.application.id, token: made.token };
}

async function add(botId: string, serverId: string, permissions: number, by = "owner") {
  signIn(by);
  return authorize(json({ client_id: botId, guild_id: serverId, permissions }));
}

beforeAll(async () => {
  db = realDb();
  await ensureSchema(db);
  setBindings({ DB: db, BOT_TOKEN: "master" } as never);
});

beforeEach(async () => {
  resetMemoryRateLimits();
  resetBotServerCache();
  for (const table of ["applications", "server_bots", "server_members", "member_roles", "roles", "channel_overwrites", "messages", "channels", "servers", "users", "discord_commands"]) {
    await db.exec(`DELETE FROM ${table}`);
  }
  await db.exec("DELETE FROM meta WHERE key = 'music_application_backfilled'");
  for (const id of ["root", "owner", "mod", "dev", "stranger"]) {
    await db
      .prepare(
        `INSERT INTO users (id, username, username_lower, display_name, password_hash, avatar, color, is_admin, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, 'x', 'a', '#000', ?, ?, ?)`,
      )
      .bind(id, id, id, id, id === "root" ? 1 : 0, NOW, NOW)
      .run();
  }
  for (const [id, by] of [["s1", "owner"], ["s2", "stranger"]]) {
    await db.prepare("INSERT INTO servers (id, name, icon, color, created_by, created_at) VALUES (?, ?, 'S', '#000', ?, ?)").bind(id, id, by, NOW).run();
    await db.prepare("INSERT INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)").bind(id, by, NOW).run();
  }
  await db.prepare("INSERT INTO server_members (server_id, user_id, joined_at) VALUES ('s1', 'mod', ?)").bind(NOW).run();
  for (const [id, server] of [["c1", "s1"], ["p1", "s1"], ["c2", "s2"]]) {
    await db.prepare("INSERT INTO channels (id, server_id, name, kind, created_at) VALUES (?, ?, ?, 'text', ?)").bind(id, server, id, NOW).run();
  }
  await db.prepare("INSERT INTO channel_overwrites VALUES ('p1', 's1', 'everyone', '', 0, ?)").bind(P.VIEW_CHANNEL).run();
  // mod holds Manage Server but nothing else.
  await db.prepare("INSERT INTO roles (id, server_id, name, permissions, position, created_at) VALUES ('rmod', 's1', 'mod', ?, 1, ?)").bind(P.MANAGE_SERVER, NOW).run();
  await db.prepare("INSERT INTO member_roles (server_id, user_id, role_id) VALUES ('s1', 'mod', 'rmod')").run();
  await db.prepare("INSERT INTO roles (id, server_id, name, permissions, position, created_at) VALUES ('rboss', 's1', 'boss', ?, 2, ?)").bind(P.ADMINISTRATOR, NOW).run();
  await guild("s1");
  await guild("s2");
  for (const id of ["c1", "p1", "c2"]) await channel(id);
});

describe("a bot only reaches servers that added it", () => {
  it("lists only those servers and is refused everywhere else", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", P.VIEW_CHANNEL | P.SEND_MESSAGES);

    const guilds = (await (await api(bot.token, "GET", "users/@me/guilds")).json()) as Array<{ id: string }>;
    expect(guilds.map((g) => g.id)).toEqual([await guild("s1")]);
    expect((await api(bot.token, "GET", `guilds/${await guild("s2")}`)).status).toBe(403);
    expect((await api(bot.token, "GET", `channels/${await channel("c2")}`)).status).toBe(403);
    expect((await api(bot.token, "POST", `channels/${await channel("c2")}/messages`, { content: "hi" })).status).toBe(403);
  });

  it("cannot register commands in a server that did not add it", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", P.VIEW_CHANNEL);
    const res = await api(bot.token, "POST", `applications/x/guilds/${await guild("s2")}/commands`, { name: "steal", description: "x" });
    expect(res.status).toBe(403);
  });

  it("offers its global commands only where it was added", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", P.VIEW_CHANNEL);
    expect((await api(bot.token, "POST", "applications/x/commands", { name: "ping", description: "x" })).status).toBe(201);
    expect((await listCommandsForServer(db, "s1")).map((c) => c.name)).toEqual(["ping"]);
    expect(await listCommandsForServer(db, "s2")).toEqual([]);
  });

  it("stays out of Hoffle's unchecked v1 API", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", P.ADMINISTRATOR);
    const res = await v1Guilds(new Request("http://x/", { headers: { authorization: `Bot ${bot.token}` } }));
    expect(res.status).toBe(401);
  });
});

describe("a bot gets exactly what it was granted", () => {
  it("cannot post without Send Messages, and can with it", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", P.VIEW_CHANNEL);
    const path = `channels/${await channel("c1")}/messages`;
    expect((await api(bot.token, "POST", path, { content: "hi" })).status).toBe(403);

    await add(bot.id, "s1", P.VIEW_CHANNEL | P.SEND_MESSAGES);
    expect((await api(bot.token, "POST", path, { content: "hi" })).status).toBe(200);
  });

  it("cannot see private channels unless it is an administrator", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", P.VIEW_CHANNEL | P.SEND_MESSAGES | P.READ_MESSAGE_HISTORY);
    expect((await api(bot.token, "POST", `channels/${await channel("p1")}/messages`, { content: "hi" })).status).toBe(403);
    const listed = (await (await api(bot.token, "GET", `guilds/${await guild("s1")}/channels`)).json()) as Array<{ name: string }>;
    expect(listed.map((c) => c.name)).toEqual(["c1"]);

    await add(bot.id, "s1", P.ADMINISTRATOR);
    const all = (await (await api(bot.token, "GET", `guilds/${await guild("s1")}/channels`)).json()) as Array<{ name: string }>;
    expect(all.map((c) => c.name).sort()).toEqual(["c1", "p1"]);
  });

  it("cannot read message history without the Message Content switch", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", P.VIEW_CHANNEL | P.READ_MESSAGE_HISTORY);
    const path = `channels/${await channel("c1")}/messages`;
    expect((await api(bot.token, "GET", path)).status).toBe(403);

    signIn("dev");
    await patchApp(json({ intents: 1 << 15 }, "PATCH"), params(bot.id));
    expect((await api(bot.token, "GET", path)).status).toBe(200);
  });

  it("cannot kick or ban without the permission", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", P.VIEW_CHANNEL);
    const member = await snowflakeFor("user", "mod", NOW);
    expect((await api(bot.token, "DELETE", `guilds/${await guild("s1")}/members/${member}`)).status).toBe(403);
    expect((await api(bot.token, "PUT", `guilds/${await guild("s1")}/bans/${member}`, {})).status).toBe(403);
  });

  it("can never kick or ban the server owner, even as administrator", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", P.ADMINISTRATOR);
    const owner = await snowflakeFor("user", "owner", NOW);
    expect((await api(bot.token, "DELETE", `guilds/${await guild("s1")}/members/${owner}`)).status).toBe(403);
    expect((await api(bot.token, "PUT", `guilds/${await guild("s1")}/bans/${owner}`, {})).status).toBe(403);
  });

  it("cannot hand out a role stronger than itself", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", P.VIEW_CHANNEL | P.MANAGE_ROLES);
    const member = await snowflakeFor("user", "mod", NOW);
    const boss = await snowflakeFor("role", "rboss", NOW);
    expect((await api(bot.token, "PUT", `guilds/${await guild("s1")}/members/${member}/roles/${boss}`)).status).toBe(403);
    expect((await api(bot.token, "POST", `guilds/${await guild("s1")}/roles`, { name: "x", permissions: String(P.ADMINISTRATOR) })).status).toBe(403);
  });

  it("cannot edit a message by sharing its author's name", async () => {
    const bot = await makeBot("dev", "Sam");
    await add(bot.id, "s1", P.VIEW_CHANNEL | P.SEND_MESSAGES);
    await db
      .prepare(
        `INSERT INTO messages (id, channel, channel_id, author, avatar, color, content, is_bot, created_at)
         VALUES ('m9', 'c1', 'c1', 'Sam', 'a', '#000', 'mine', 1, ?)`,
      )
      .bind(NOW)
      .run();
    const message = await snowflakeFor("message", "m9", NOW);
    const res = await api(bot.token, "PATCH", `channels/${await channel("c1")}/messages/${message}`, { content: "hacked" });
    expect(res.status).toBe(403);
  });

  it("refuses anything the rules do not list", () => {
    expect(requiredFor("POST", ["guilds", "1", "something-new"]).kind).toBe("deny");
    expect(requiredFor("DELETE", ["guilds", "1"]).kind).toBe("deny");
    expect(requiredFor("POST", ["channels", "1", "something-new"]).kind).toBe("deny");
    expect(requiredFor("POST", ["users", "@me", "channels"]).kind).toBe("deny");
    expect(requiredFor("GET", ["nonsense"]).kind).toBe("deny");
  });

  it("works out what a member edit needs from its fields", () => {
    expect(memberPatchFlags({ nick: "x" })).toEqual([P.MANAGE_NICKNAMES]);
    expect(memberPatchFlags({ nick: "x", roles: [] })).toEqual([P.MANAGE_NICKNAMES, P.MANAGE_ROLES]);
    expect(memberPatchFlags({})).toEqual([P.MANAGE_SERVER]);
    expect(withinGrant(P.MANAGE_ROLES, P.ADMINISTRATOR)).toBe(false);
    expect(withinGrant(P.MANAGE_ROLES | P.KICK_MEMBERS, P.KICK_MEMBERS)).toBe(true);
    expect(withinGrant(P.MANAGE_ROLES, P.BAN_MEMBERS)).toBe(false);
  });

  it("hears gateway events only where it may", () => {
    const grants = { s1: P.VIEW_CHANNEL, s3: 0, s4: P.ADMINISTRATOR };
    expect(botMayReceive(grants, { serverId: "s1" })).toBe(true);
    expect(botMayReceive(grants, { serverId: "s1", privateChannel: true })).toBe(false);
    expect(botMayReceive(grants, { serverId: "s2" })).toBe(false);
    expect(botMayReceive(grants, { serverId: "s3" })).toBe(false);
    expect(botMayReceive(grants, { serverId: "s4", privateChannel: true })).toBe(true);
    expect(botMayReceive(grants, {})).toBe(false);
    expect(botMayReceive(grants, { serverId: "__proto__" })).toBe(false);
  });
});

describe("tokens", () => {
  it("stores only a hash, and a reset kills the old token", async () => {
    const bot = await makeBot();
    const row = await db.prepare("SELECT token_hash FROM applications WHERE id = ?").bind(bot.id).first<{ token_hash: string }>();
    expect(row!.token_hash).not.toContain(bot.token);
    expect((await api(bot.token, "GET", "users/@me")).status).toBe(200);

    signIn("dev");
    const { token } = (await (await resetToken(json({}), params(bot.id))).json()) as { token: string };
    expect((await api(bot.token, "GET", "users/@me")).status).toBe(401);
    expect((await api(token, "GET", "users/@me")).status).toBe(200);
  });

  it("does not let an added bot's row work as a login", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", P.ADMINISTRATOR);
    const row = await db.prepare("SELECT token FROM server_bots WHERE application_id = ?").bind(bot.id).first<{ token: string }>();
    const request = new Request("http://x/", { headers: { Authorization: `Bot ${row!.token}` } });
    expect(await authenticateBot(request)).toBeNull();
  });

  it("only its owner can change, reset or delete it", async () => {
    const bot = await makeBot();
    signIn("stranger");
    expect((await patchApp(json({ name: "Mine now" }, "PATCH"), params(bot.id))).status).toBe(404);
    expect((await resetToken(json({}), params(bot.id))).status).toBe(404);
    expect((await deleteApp(json({}, "DELETE"), params(bot.id))).status).toBe(404);
  });
});

describe("adding a bot", () => {
  it("needs Manage Server", async () => {
    const bot = await makeBot();
    expect((await add(bot.id, "s1", P.VIEW_CHANNEL, "stranger")).status).toBe(403);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM server_bots").first()).toEqual({ n: 0 });
  });

  it("cannot grant more than the person adding it holds", async () => {
    const bot = await makeBot();
    expect((await add(bot.id, "s1", P.MANAGE_SERVER, "mod")).status).toBe(200);
    expect((await add(bot.id, "s1", P.VIEW_CHANNEL | P.MANAGE_SERVER, "mod")).status).toBe(200);
    expect((await add(bot.id, "s1", P.ADMINISTRATOR, "mod")).status).toBe(403);
    expect((await add(bot.id, "s1", P.BAN_MEMBERS, "mod")).status).toBe(403);
  });

  it("keeps a private bot to its owner", async () => {
    const bot = await makeBot();
    signIn("dev");
    await patchApp(json({ public: false }, "PATCH"), params(bot.id));
    expect((await add(bot.id, "s1", P.VIEW_CHANNEL)).status).toBe(403);
    signIn("owner");
    const info = await authorizeInfo(new Request(`http://x/?client_id=${bot.id}`));
    expect(info.status).toBe(403);
  });

  it("shows the servers you can add to and what the bot asks for", async () => {
    const bot = await makeBot();
    signIn("owner");
    const info = await authorizeInfo(new Request(`http://x/?client_id=${bot.id}&permissions=${P.VIEW_CHANNEL | P.SEND_MESSAGES}`));
    const body = (await info.json()) as { servers: Array<{ id: string }>; permissions: string[] };
    expect(body.servers.map((s) => s.id)).toEqual(["s1"]);
    expect(body.permissions).toEqual(["View Channels", "Send Messages"]);
  });

  it("shows every permission a bot can hold, so nothing is asked for silently", () => {
    const shown = BOT_PERMISSION_INFO.reduce((all, info) => all | info.flag, 0);
    expect(shown).toBe(ALL_PERMISSIONS);
  });

  it("does not let strangers pass a bot off as Hoffle", async () => {
    signIn("dev");
    for (const name of ["Hoffle Official", "discord", "System", "x"]) {
      expect((await createApp(json({ name }))).status).toBe(400);
    }
  });
});

describe("the music bot is a normal bot", () => {
  async function seedMusic() {
    for (const id of ["s1", "s2"]) {
      await db
        .prepare(
          `INSERT INTO server_bots (id, server_id, name, avatar, token, description, kind, enabled, created_at)
           VALUES (?, ?, 'Hoffle Music', '🎵', ?, '', 'music', 1, ?)`,
        )
        .bind(`row-${id}`, id, `old-${id}`, NOW)
        .run();
    }
    await backfillMusicApplication(db);
    return db.prepare("SELECT * FROM applications WHERE kind = 'music'").first<{ id: string; owner_id: string; name: string }>();
  }

  it("keeps every server it is in, and is owned by the admin", async () => {
    const app = await seedMusic();
    expect(app).toMatchObject({ owner_id: "root", name: "Hoffle Music" });
    const rows = await db.prepare("SELECT server_id, application_id, permissions, enabled FROM server_bots ORDER BY server_id").all();
    expect(rows.results).toEqual([
      { server_id: "s1", application_id: app!.id, permissions: MUSIC_BOT_PERMISSIONS, enabled: 1 },
      { server_id: "s2", application_id: app!.id, permissions: MUSIC_BOT_PERMISSIONS, enabled: 1 },
    ]);
    await backfillMusicApplication(db);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM applications").first()).toEqual({ n: 1 });
  });

  it("is no longer one click in server settings", async () => {
    signIn("owner");
    const res = await addServerBot(json({ name: "Music", kind: "music" }), params("s1"));
    expect(res.status).toBe(400);
  });

  it("is added with its invite link like any other bot, music included", async () => {
    const app = await seedMusic();
    await db.exec("DELETE FROM server_bots WHERE server_id = 's1'");
    expect((await add(app!.id, "s1", MUSIC_BOT_PERMISSIONS)).status).toBe(200);
    const row = await db.prepare("SELECT kind, enabled FROM server_bots WHERE server_id = 's1'").first();
    expect(row).toEqual({ kind: "music", enabled: 1 });
  });

  it("sees only the servers that added it with its own token", async () => {
    const app = await seedMusic();
    await db.exec("DELETE FROM server_bots WHERE server_id = 's2'");
    signIn("root");
    const { token } = (await (await resetToken(json({}), params(app!.id))).json()) as { token: string };
    const res = await botServers(new Request("http://x/", { headers: { authorization: `Bearer ${token}` } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { servers: Array<{ id: string }> };
    expect(body.servers.map((s) => s.id)).toEqual(["s1"]);
  });

  it("still works on the master token until it is switched", async () => {
    await seedMusic();
    const res = await botServers(new Request("http://x/", { headers: { authorization: "Bearer master" } }));
    expect(res.status).toBe(200);
  });

  it("does not open music endpoints to other bots", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", P.ADMINISTRATOR);
    const res = await botServers(new Request("http://x/", { headers: { authorization: `Bearer ${bot.token}` } }));
    expect(res.status).toBe(401);
  });

  it("cannot be deleted by accident", async () => {
    const app = await seedMusic();
    signIn("root");
    expect((await deleteApp(json({}, "DELETE"), params(app!.id))).status).toBe(400);
  });
});
