/**
 * A bot belongs to one server, and nothing it sends may reach another.
 *
 * The Discord-shaped API takes ids raw as well as by snowflake, so an id from
 * another server (which any member of that server can see) used to go straight
 * into queries that only matched on the id. These run each such route against
 * the real schema with a second server's ids.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { sqliteAvailable, sqliteD1 } from "./stubs/sqlite-d1";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const auth = vi.hoisted(() => ({
  bot: { id: "botA", name: "Bot A", avatar: "🤖", serverId: "srvA" as string | null, isMaster: false, kind: "custom" },
}));

vi.mock("@/lib/bot-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bot-auth")>()),
  authenticateBot: vi.fn(async () => auth.bot),
  botById: vi.fn(async () => auth.bot),
}));
vi.mock("@/lib/hub-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hub-client")>()),
  publishMessage: vi.fn(async () => undefined),
  publishMessageEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/discord/dispatch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/discord/dispatch")>()),
  dispatchToBots: vi.fn(async () => undefined),
  dispatchMessage: vi.fn(async () => undefined),
  dispatchMessageDelete: vi.fn(async () => undefined),
  dispatchReaction: vi.fn(async () => undefined),
}));

const { ensureSchema } = await import("@/lib/schema");
const { handleDiscordRest } = await import("@/lib/discord/rest");
const { createWebhook, BRIDGE_WEBHOOK_SOURCE } = await import("@/lib/webhooks");

let db: D1Database | null = null;
const NOW = "2026-10-01T00:00:00.000Z";
const SEEDED = [
  "servers", "channels", "roles", "server_members", "member_roles", "channel_overwrites",
  "messages", "discord_interactions", "channel_webhooks",
];

async function seed() {
  // The schema migrates once per isolate, so one database serves every test
  // and is emptied in between.
  if (!db) {
    db = sqliteD1();
    setBindings({ DB: db });
    await ensureSchema(db);
  }
  setBindings({ DB: db });
  for (const table of SEEDED) await db.prepare(`DELETE FROM ${table}`).run();
  const run = (sql: string, ...args: unknown[]) => db!.prepare(sql).bind(...args).run();
  await run("INSERT INTO servers (id, name, icon, color, created_by, created_at) VALUES ('srvA', 'A', 'A', '#000', 'ownerA', ?), ('srvB', 'B', 'B', '#000', 'ownerB', ?)", NOW, NOW);
  await run("INSERT INTO channels (id, server_id, name, kind, created_at) VALUES ('chanA', 'srvA', 'a', 'text', ?), ('chanB', 'srvB', 'b', 'text', ?)", NOW, NOW);
  await run("INSERT INTO roles (id, server_id, name, permissions, created_at) VALUES ('roleA', 'srvA', 'A role', 0, ?), ('roleB', 'srvB', 'Members', 0, ?)", NOW, NOW);
  await run("INSERT INTO server_members (server_id, user_id, joined_at) VALUES ('srvA', 'userA', ?), ('srvB', 'victim', ?)", NOW, NOW);
  await run("INSERT INTO member_roles (server_id, user_id, role_id) VALUES ('srvB', 'victim', 'roleB')");
  await run("INSERT INTO channel_overwrites (channel_id, server_id, target_type, target_id, allow, deny) VALUES ('chanB', 'srvB', 'role', 'roleB', 1024, 0)");
  const message = (id: string, channel: string, userId: string | null, content: string, payload: string | null) =>
    run(
      `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, is_bot, created_at, payload)
       VALUES (?, ?, ?, ?, 'someone', 'S', '#fff', ?, ?, ?, ?)`,
      id, channel, channel, userId, content, userId ? 0 : 1, NOW, payload,
    );
  await message("msgA", "chanA", null, "bot A's post", JSON.stringify({ embeds: [], components: [], botId: "botA" }));
  await message("msgA2", "chanA", "userA", "a member's post in A", null);
  await message("msgB", "chanB", "victim", "secret words in B", null);
  await run(
    `INSERT INTO discord_interactions (id, token, bot_id, server_id, channel_id, user_id, command_name, type, state, created_at, expires_at)
     VALUES ('i1', 'itok', 'botA', 'srvA', 'chanA', 'userA', 'ping', 2, 'replied', ?, '2999-01-01T00:00:00.000Z')`,
    NOW,
  );
}

function call(method: string, path: string, body?: unknown) {
  const segments = path.split("/").filter(Boolean);
  return handleDiscordRest(
    new Request(`https://hoffle.test/hangout/api/v10/${segments.join("/")}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    "10",
    segments,
    "/hangout",
  );
}

const value = async (sql: string, ...args: unknown[]) => db!.prepare(sql).bind(...args).first<Record<string, unknown>>();

describe.skipIf(!sqliteAvailable)("a bot stays inside its own server", () => {
  beforeEach(seed);

  it("can't change or delete another server's roles", async () => {
    expect((await call("PATCH", "guilds/srvA/roles/roleB", { permissions: "1", name: "pwned" })).status).toBe(404);
    expect(await value("SELECT name, permissions FROM roles WHERE id = 'roleB'")).toEqual({ name: "Members", permissions: 0 });

    expect((await call("DELETE", "guilds/srvA/roles/roleB")).status).toBe(404);
    expect(await value("SELECT 1 AS here FROM member_roles WHERE role_id = 'roleB'")).toEqual({ here: 1 });
    expect(await value("SELECT 1 AS here FROM channel_overwrites WHERE target_id = 'roleB'")).toEqual({ here: 1 });

    // Its own server's roles work as before.
    expect((await call("PATCH", "guilds/srvA/roles/roleA", { permissions: "8" })).status).toBe(200);
    expect(await value("SELECT permissions FROM roles WHERE id = 'roleA'")).toEqual({ permissions: 8 });
    expect((await call("DELETE", "guilds/srvA/roles/roleA")).status).toBe(204);
    expect(await value("SELECT 1 AS here FROM roles WHERE id = 'roleA'")).toBeNull();
  });

  it("hands out only its own server's roles, to its own members", async () => {
    expect((await call("PUT", "guilds/srvA/members/userA/roles/roleB")).status).toBe(404);
    expect((await call("PUT", "guilds/srvA/members/victim/roles/roleA")).status).toBe(404);
    expect((await call("PUT", "guilds/srvA/members/userA/roles/roleA")).status).toBe(204);
    expect(await value("SELECT role_id FROM member_roles WHERE server_id = 'srvA' AND user_id = 'userA'")).toEqual({ role_id: "roleA" });
  });

  it("bulk-deletes only messages of the channel it names", async () => {
    expect((await call("POST", "channels/chanA/messages/bulk-delete", { messages: ["msgB", "msgA2"] })).status).toBe(204);
    expect(await value("SELECT deleted_at FROM messages WHERE id = 'msgB'")).toEqual({ deleted_at: null });
    expect((await value("SELECT deleted_at FROM messages WHERE id = 'msgA2'"))?.deleted_at).toBeTruthy();
  });

  it("pins only messages of the channel it names", async () => {
    expect((await call("PUT", "channels/chanA/pins/msgB")).status).toBe(404);
    expect(await value("SELECT pinned_at FROM messages WHERE id = 'msgB'")).toEqual({ pinned_at: null });
    expect((await call("PUT", "channels/chanA/pins/msgA2")).status).toBe(204);
    expect((await value("SELECT pinned_at FROM messages WHERE id = 'msgA2'"))?.pinned_at).toBeTruthy();
  });

  it("replies only to a message in the same channel, so no preview shows words from elsewhere", async () => {
    const away = await call("POST", "channels/chanA/messages", { content: "look", message_reference: { message_id: "msgB" } });
    expect(away.status).toBe(200);
    const { id: awayId } = (await away.json()) as { id: string };
    const awayRow = await db!
      .prepare("SELECT reply_to FROM messages WHERE content = 'look'")
      .first<{ reply_to: string | null }>();
    expect(awayId).toBeTruthy();
    expect(awayRow?.reply_to).toBeNull();

    await call("POST", "channels/chanA/messages", { content: "answer", message_reference: { message_id: "msgA2" } });
    expect(await value("SELECT reply_to FROM messages WHERE content = 'answer'")).toEqual({ reply_to: "msgA2" });
  });

  it("can't read, edit or delete other messages through an interaction token", async () => {
    expect((await call("GET", "webhooks/app/itok/messages/msgB")).status).toBe(404);
    expect((await call("PATCH", "webhooks/app/itok/messages/msgB", { content: "I said this" })).status).toBe(404);
    expect(await value("SELECT content FROM messages WHERE id = 'msgB'")).toEqual({ content: "secret words in B" });
    expect((await call("DELETE", "webhooks/app/itok/messages/msgB")).status).toBe(404);
    expect(await value("SELECT deleted_at FROM messages WHERE id = 'msgB'")).toEqual({ deleted_at: null });

    // A member's message in its own channel is not the bot's to change either.
    expect((await call("PATCH", "webhooks/app/itok/messages/msgA2", { content: "I said this" })).status).toBe(404);
    expect(await value("SELECT content FROM messages WHERE id = 'msgA2'")).toEqual({ content: "a member's post in A" });

    // Its own post it may.
    expect((await call("PATCH", "webhooks/app/itok/messages/msgA", { content: "edited" })).status).toBe(200);
    expect(await value("SELECT content FROM messages WHERE id = 'msgA'")).toEqual({ content: "edited" });
  });

  it("never sees the Discord bridge's webhook URLs", async () => {
    const bridgeHook = await createWebhook(db!, {
      serverId: "srvA", channelId: "chanA", name: "Discord", avatar: "🌉", createdBy: "bot:discord-bridge", source: BRIDGE_WEBHOOK_SOURCE,
    });
    const plainHook = await createWebhook(db!, { serverId: "srvA", channelId: "chanA", name: "CI", avatar: "🤖", createdBy: "ownerA" });
    for (const path of ["guilds/srvA/webhooks", "channels/chanA/webhooks"]) {
      const list = (await (await call("GET", path)).json()) as Array<{ id: string; token?: string }>;
      expect(list.find((hook) => hook.id === bridgeHook.id)?.token).toBeUndefined();
      expect(list.find((hook) => hook.id === plainHook.id)?.token).toBe(plainHook.token);
    }
    const one = (await (await call("GET", `webhooks/${bridgeHook.id}`)).json()) as { token?: string };
    expect(one.token).toBeUndefined();
  });
});
