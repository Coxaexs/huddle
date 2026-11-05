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
import { playerCommand } from "@/lib/hub-client";
import { resolveTrack } from "@/lib/music";
import { POST as createApp } from "@/app/api/applications/route";
import { PATCH as patchApp } from "@/app/api/applications/[id]/route";
import { POST as authorize } from "@/app/api/oauth2/authorize/route";
import { GET as offered, POST as ticketFor } from "@/app/api/bot-activities/route";
import { POST as roomActivity } from "@/app/api/(features)/activities/route";
import { GET as getPlayer, POST as drivePlayer } from "@/app/api/bot/player/route";
import { POST as musicCommand } from "@/app/api/(features)/music/command/route";
import { handleDiscordRest } from "@/lib/discord/rest";
import { playerBotInServer, serversWithPlayerBot } from "@/lib/music-bot";
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
const params = (id: string) => ({ params: Promise.resolve({ id }) });
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
const register = (token: string, name = "quiz", url = "https://quiz.example/play") =>
  api(token, "PUT", `applications/x/activities/${name}`, { title: "Quiz Night", description: "Play", url });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  db = realDb();
  await ensureSchema(db);
  setBindings({ DB: db, BOT_TOKEN: "master" } as never);
});

beforeEach(async () => {
  vi.clearAllMocks();
  resetMemoryRateLimits();
  for (const table of ["applications", "server_bots", "server_members", "channels", "servers", "users", "bot_activities", "bot_activity_tickets", "room_activities"]) {
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

async function ticketUrl(bot: { id: string }, as = "member", channelId = "v1") {
  signIn(as);
  return ticketFor(json({ channelId, applicationId: bot.id, name: "quiz" }));
}
async function ticketValue(bot: { id: string }) {
  const { url } = (await (await ticketUrl(bot)).json()) as { url: string };
  return new URL(url).searchParams.get("hoffle_ticket")!;
}

describe("bot activities", () => {
  it("shows in servers that added the bot, and nowhere else", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", VOICE);
    expect((await register(bot.token)).status).toBe(200);
    signIn("member");
    const here = (await (await offered(new Request("http://x/?channelId=v1"))).json()) as { activities: Array<{ title: string; botName: string }> };
    expect(here.activities).toMatchObject([{ title: "Quiz Night", botName: "Quiz" }]);
    signIn("stranger");
    expect(await (await offered(new Request("http://x/?channelId=v2"))).json()).toEqual({ activities: [] });
  });

  it("disappears when the bot is removed", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", VOICE);
    await register(bot.token);
    await db.exec("DELETE FROM server_bots");
    expect((await ticketUrl(bot)).status).toBe(404);
  });

  it("needs an https page", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", VOICE);
    expect((await register(bot.token, "a", "http://quiz.example")).status).toBe(400);
    expect((await register(bot.token, "b", "javascript:alert(1)")).status).toBe(400);
    expect((await register(bot.token, "c", "https://me:pw@quiz.example")).status).toBe(400);
    expect((await register(bot.token, "Bad Name")).status).toBe(400);
  });

  it("stops at 10 per bot, and a bot lists and removes only its own", async () => {
    const bot = await makeBot();
    const other = await makeBot("Other");
    for (let i = 0; i < 10; i += 1) expect((await register(bot.token, `a${i}`)).status).toBe(200);
    expect((await register(bot.token, "a10")).status).toBe(400);
    expect((await register(bot.token, "a0")).status).toBe(200);
    expect(await (await api(other.token, "GET", "applications/x/activities")).json()).toEqual([]);
    await api(other.token, "DELETE", "applications/x/activities/a0");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM bot_activities").first()).toEqual({ n: 10 });
  });

  it("is not for a server's own old-style bots", async () => {
    await db.prepare("INSERT INTO server_bots (id, server_id, name, avatar, token, kind, enabled, created_at) VALUES ('old', 's1', 'Old', 'a', 'hfl_bot_old', 'custom', 1, ?)").bind(NOW).run();
    expect((await register("hfl_bot_old")).status).toBe(403);
  });

  it("gives a member their own link, and nobody else one", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", VOICE);
    await register(bot.token);
    const { url } = (await (await ticketUrl(bot)).json()) as { url: string };
    expect(url).toContain("https://quiz.example/play?hoffle_ticket=");
    expect((await ticketUrl(bot, "stranger")).status).toBe(403);
    expect((await ticketUrl(bot, "member", "v2")).status).toBe(403);
  });
});

describe("tickets", () => {
  async function ready() {
    const bot = await makeBot();
    await add(bot.id, "s1", VOICE);
    await register(bot.token);
    return bot;
  }
  const redeem = (token: string, ticket: string) => api(token, "GET", `applications/x/activity-tickets/${ticket}`);

  it("tells the bot who opened it, once", async () => {
    const bot = await ready();
    const ticket = await ticketValue(bot);
    const res = await redeem(bot.token, ticket);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { username: string }; guild_id: string };
    expect(body.user.username).toBe("member");
    expect(body.guild_id).toBe(await snowflakeFor("guild", "s1", NOW));
    expect((await redeem(bot.token, ticket)).status).toBe(404);
  });

  it("is useless to any other bot, and does not get spent by one", async () => {
    const bot = await ready();
    const thief = await makeBot("Thief");
    const ticket = await ticketValue(bot);
    expect((await redeem(thief.token, ticket)).status).toBe(404);
    expect((await redeem(bot.token, ticket)).status).toBe(200);
  });

  it("runs out", async () => {
    const bot = await ready();
    const ticket = await ticketValue(bot);
    await db.exec("UPDATE bot_activity_tickets SET expires_at = 1");
    expect((await redeem(bot.token, ticket)).status).toBe(404);
  });

  it("is stored only as a hash", async () => {
    const bot = await ready();
    const ticket = await ticketValue(bot);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM bot_activity_tickets WHERE ticket_hash = ?").bind(ticket).first()).toEqual({ n: 0 });
  });

  it("refuses made-up tickets", async () => {
    const bot = await ready();
    expect((await redeem(bot.token, "nope")).status).toBe(404);
  });
});

describe("opening one in a room", () => {
  it("only takes an activity this server has", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", VOICE);
    await register(bot.token);
    signIn("member");
    const open = (state: unknown) => roomActivity(json({ action: "open", channelId: "v1", kind: "app", state }));
    expect((await open({ applicationId: bot.id, name: "nope" })).status).toBe(404);
    expect((await open({ applicationId: "made-up", name: "quiz" })).status).toBe(404);
    const res = await open({ applicationId: bot.id, name: "quiz", title: "Forged", url: "https://evil.example" });
    expect(res.status).toBe(201);
    const { activity } = (await res.json()) as { activity: { state: Record<string, unknown> } };
    expect(activity.state).toMatchObject({ title: "Quiz Night", botName: "Quiz" });
    expect(JSON.stringify(activity.state)).not.toContain("evil.example");
    expect((await roomActivity(json({ action: "update", channelId: "v1", state: { title: "Hijacked" } }))).status).toBe(400);
  });
});

describe("the room player", () => {
  const audio = { title: "Song", audioUrl: "https://bot.example/a.mp3" };
  async function playerBot(permissions = VOICE) {
    const bot = await makeBot("Radio");
    signIn("dev");
    await patchApp(json({ player: true }, "PATCH"), params(bot.id));
    await add(bot.id, "s1", permissions);
    return bot;
  }
  const drive = (token: string, body: unknown) => drivePlayer(json(body, "POST", bearer(token)));

  it("is closed to a bot without the switch", async () => {
    const bot = await makeBot();
    await add(bot.id, "s1", VOICE);
    expect((await drive(bot.token, { channelId: "v1", tracks: [audio] })).status).toBe(401);
    expect((await getPlayer(new Request("http://x/?channelId=v1", { headers: bearer(bot.token) }))).status).toBe(401);
  });

  it("needs Connect and Speak from the server", async () => {
    const bot = await playerBot(P.VIEW_CHANNEL | P.SEND_MESSAGES);
    expect((await drive(bot.token, { channelId: "v1", tracks: [audio] })).status).toBe(403);
    expect(playerCommand).not.toHaveBeenCalled();
  });

  it("stays out of servers that did not add it", async () => {
    const bot = await playerBot();
    expect((await drive(bot.token, { channelId: "v2", tracks: [audio] })).status).toBe(403);
    expect((await getPlayer(new Request("http://x/?channelId=v2", { headers: bearer(bot.token) }))).status).toBe(403);
  });

  it("plays a bot's own audio, named after the bot", async () => {
    const bot = await playerBot();
    expect((await drive(bot.token, { channelId: "v1", tracks: [{ ...audio, requestedBy: "kiwi" }], startNow: true })).status).toBe(200);
    const [, action] = (playerCommand as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(action).toMatchObject({ name: "enqueueMany", startNow: true, tracks: [{ title: "Song", audioUrl: audio.audioUrl, requestedBy: "Radio" }] });
  });

  it("refuses audio that is not https", async () => {
    const bot = await playerBot();
    for (const audioUrl of ["http://bot.example/a.mp3", "javascript:alert(1)", "", undefined]) {
      expect((await drive(bot.token, { channelId: "v1", tracks: [{ title: "x", audioUrl }] })).status).toBe(400);
    }
    expect(playerCommand).not.toHaveBeenCalled();
  });

  it("does not lend out the music bot's lookups", async () => {
    const bot = await playerBot();
    expect((await drive(bot.token, { channelId: "v1", query: "some song" })).status).toBe(403);
    expect((await drive(bot.token, { channelId: "v1", resolveTrackId: "t1" })).status).toBe(403);
    expect((await drive(bot.token, { channelId: "v1", tracks: [{ query: "some song" }] })).status).toBe(400);
    expect(resolveTrack).not.toHaveBeenCalled();
  });

  it("allows the transport controls and nothing internal", async () => {
    const bot = await playerBot();
    expect((await drive(bot.token, { channelId: "v1", action: { name: "pause" } })).status).toBe(200);
    for (const name of ["resolve", "mixAdvance", "live", "ended", "play"]) {
      expect((await drive(bot.token, { channelId: "v1", action: { name } })).status, name).toBe(403);
    }
  });

  it("lights up the player for the server, and pause works, but /play stays the music bot's", async () => {
    expect(await playerBotInServer(db, "s1")).toBe(false);
    await playerBot();
    expect(await playerBotInServer(db, "s1")).toBe(true);
    expect([...(await serversWithPlayerBot(db))]).toEqual(["s1"]);
    signIn("member");
    expect((await musicCommand(json({ command: "/pause", voiceChannelId: "v1", textChannelId: null }))).status).toBe(200);
    expect((await musicCommand(json({ command: "/play abba", voiceChannelId: "v1", textChannelId: null }))).status).toBe(409);
  });

  it("keeps every command closed where no bot can play", async () => {
    signIn("member");
    expect((await musicCommand(json({ command: "/pause", voiceChannelId: "v1", textChannelId: null }))).status).toBe(409);
  });

  it("leaves the music bot's own path alone", async () => {
    await db.prepare("INSERT INTO server_bots (id, server_id, name, avatar, token, kind, enabled, created_at) VALUES ('m', 's1', 'Music', 'a', 't', 'music', 1, ?)").bind(NOW).run();
    expect(await playerBotInServer(db, "s1")).toBe(true);
    const res = await drivePlayer(json({ channelId: "v1", query: "abba" }, "POST", bearer("master")));
    expect(res.status).toBe(200);
    expect(resolveTrack).toHaveBeenCalled();
  });
});
