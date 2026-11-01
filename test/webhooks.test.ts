import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetMemoryRateLimits } from "@/lib/rate-limit";
import {
  BRIDGE_WEBHOOK_SOURCE,
  cleanAvatarUrl,
  cleanEmbeds,
  createWebhook,
  deleteWebhookMessage,
  editWebhookMessage,
  executeWebhook,
  webhookMessage,
  githubToExecute,
  handleWebhookRequest,
  slackToExecute,
  tokensMatch,
} from "@/lib/webhooks";
import { sqliteAvailable, sqliteD1 } from "./stubs/sqlite-d1";

const published = vi.hoisted(() => [] as Array<{ channelId: string; message: Record<string, unknown> }>);
vi.mock("@/lib/hub-client", () => ({
  publishMessage: vi.fn(async (channelId: string, message: Record<string, unknown>) => {
    published.push({ channelId, message });
  }),
  publishMessageEvent: vi.fn(async (channelId: string, event: Record<string, unknown>) => {
    published.push({ channelId, message: event });
  }),
}));
vi.mock("@/lib/discord/dispatch", () => ({
  dispatchMessage: vi.fn(async () => undefined),
  dispatchMessageDelete: vi.fn(async () => undefined),
}));

describe("webhook payloads", () => {
  it("keeps only the embed fields Hoffle renders, capped", () => {
    const [embed] = cleanEmbeds([
      {
        title: "x".repeat(300),
        color: "#ff0000",
        url: "javascript:alert(1)",
        image: { url: "https://example.com/a.png" },
        fields: [{ name: "a", value: "b", inline: true }, { name: "", value: "skip" }],
        evil: { nested: true },
      },
    ]);
    expect(embed.title).toHaveLength(256);
    expect(embed.color).toBe(0xff0000);
    expect(embed.url).toBeUndefined();
    expect(embed.image).toEqual({ url: "https://example.com/a.png" });
    expect(embed.fields).toEqual([{ name: "a", value: "b", inline: true }]);
    expect(embed).not.toHaveProperty("evil");
    expect(cleanEmbeds(Array.from({ length: 20 }, () => ({ title: "t" })))).toHaveLength(10);
    expect(cleanEmbeds("nope")).toEqual([]);
  });

  it("turns GitHub events into one embed, and skips noise", () => {
    const push = githubToExecute("push", {
      ref: "refs/heads/main",
      compare: "https://github.com/o/r/compare/a...b",
      repository: { full_name: "o/r" },
      sender: { login: "kiwi" },
      commits: [{ id: "abcdef1234", url: "https://github.com/o/r/commit/abc", message: "Fix it\n\nbody", author: { username: "kiwi" } }],
    });
    expect(push?.embeds).toHaveLength(1);
    const embed = (push!.embeds as Array<Record<string, unknown>>)[0];
    expect(embed.title).toBe("[o/r:main] 1 new commit");
    expect(embed.description).toContain("`abcdef1`");
    expect(embed.description).not.toContain("body");

    const merged = githubToExecute("pull_request", {
      action: "closed",
      repository: { full_name: "o/r" },
      pull_request: { number: 4, title: "Webhooks", merged: true, html_url: "https://github.com/o/r/pull/4" },
    });
    expect((merged!.embeds as Array<Record<string, unknown>>)[0].title).toBe("[o/r] Pull request merged: #4 Webhooks");

    expect(githubToExecute("push", { commits: [] })).toBeNull();
    expect(githubToExecute("pull_request", { action: "labeled", pull_request: {} })).toBeNull();
    expect(githubToExecute("workflow_run", { action: "completed", workflow_run: { conclusion: "success" } })).toBeNull();
    expect(githubToExecute("watch", {})).toBeNull();
  });

  it("reads Slack's text and attachments", () => {
    const body = slackToExecute({ text: "Deploy done", attachments: [{ title: "v2", color: "good", text: "all green" }] });
    expect(body.content).toBe("Deploy done");
    const [embed] = cleanEmbeds(body.embeds);
    expect(embed).toMatchObject({ title: "v2", description: "all green", color: 0x2eb67d });
  });

  it("compares tokens without leaking length shortcuts", () => {
    expect(tokensMatch("abc", "abc")).toBe(true);
    expect(tokensMatch("abc", "abd")).toBe(false);
    expect(tokensMatch("abc", "abcd")).toBe(false);
  });
});

describe.skipIf(!sqliteAvailable)("executing a webhook", () => {
  let db: D1Database;

  beforeEach(async () => {
    published.length = 0;
    resetMemoryRateLimits();
    db = sqliteD1();
    await db.exec(`CREATE TABLE channels (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, kind TEXT, position INTEGER DEFAULT 0)`);
    await db.exec(`CREATE TABLE channel_webhooks (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, channel_id TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '🪝', token TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, last_used_at TEXT, uses INTEGER NOT NULL DEFAULT 0, source TEXT)`);
    await db.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, channel TEXT, channel_id TEXT, user_id TEXT, author TEXT, avatar TEXT,
      color TEXT, content TEXT, attachment_key TEXT, attachments TEXT, is_bot INTEGER, created_at TEXT, payload TEXT, reply_to TEXT, thread_id TEXT, deleted_at TEXT, edited_at TEXT)`);
    await db.exec(`CREATE TABLE message_edits (id TEXT PRIMARY KEY, message_id TEXT, content TEXT, written_at TEXT, replaced_at TEXT)`);
    await db.exec(`INSERT INTO channels VALUES ('c1', 's1', 'deploys', 'text', 0), ('c2', 's2', 'other', 'text', 0), ('v1', 's1', 'Lounge', 'voice', 1)`);
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`https://chat.test/hangout/api/webhooks/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("posts into its channel as a bot and counts the use", async () => {
    const hook = await createWebhook(db, { serverId: "s1", channelId: "c1", name: "CI", avatar: "🤖", createdBy: "u1" });
    const response = await handleWebhookRequest(db, post(`${hook.id}/${hook.token}?wait=true`, { content: "Build passed", username: "Builder" }), [hook.id, hook.token]);
    expect(response.status).toBe(200);
    const sent = (await response.json()) as { content: string; author: { username: string } };
    expect(sent).toMatchObject({ content: "Build passed", author: { username: "Builder" } });

    const row = await db.prepare("SELECT * FROM messages").first<Record<string, unknown>>();
    expect(row).toMatchObject({ channel_id: "c1", user_id: null, is_bot: 1, author: "Builder", avatar: "🤖" });
    expect(published).toHaveLength(1);
    expect(published[0].channelId).toBe("c1");
    const uses = await db.prepare("SELECT uses FROM channel_webhooks WHERE id = ?").bind(hook.id).first<{ uses: number }>();
    expect(uses?.uses).toBe(1);
  });

  it("answers 204 without wait, and refuses a wrong token or an empty body", async () => {
    const hook = await createWebhook(db, { serverId: "s1", channelId: "c1", name: "CI", avatar: "🤖", createdBy: "u1" });
    expect((await handleWebhookRequest(db, post("x", { content: "hi" }), [hook.id, hook.token])).status).toBe(204);
    expect((await handleWebhookRequest(db, post("x", { content: "hi" }), [hook.id, "wrong"])).status).toBe(404);
    expect((await handleWebhookRequest(db, post("x", {}), [hook.id, hook.token])).status).toBe(400);
  });

  it("holds each webhook to 30 posts a minute", async () => {
    const hook = await createWebhook(db, { serverId: "s1", channelId: "c1", name: "CI", avatar: "🤖", createdBy: "u1" });
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) {
      statuses.push((await handleWebhookRequest(db, post("x", { content: `n${i}` }), [hook.id, hook.token])).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 204)).toBe(true);
    expect(statuses[30]).toBe(429);
    const count = await db.prepare("SELECT COUNT(*) AS n FROM messages").first<{ n: number }>();
    expect(count?.n).toBe(30);
  });

  it("takes GitHub deliveries, and acknowledges ignored events without posting", async () => {
    const hook = await createWebhook(db, { serverId: "s1", channelId: "c1", name: "GitHub", avatar: "🐙", createdBy: "u1" });
    const ping = await handleWebhookRequest(db, post("x", { zen: "Keep it simple", repository: { full_name: "o/r" } }, { "x-github-event": "ping" }), [hook.id, hook.token, "github"]);
    expect(ping.status).toBe(204);
    const ignored = await handleWebhookRequest(db, post("x", {}, { "x-github-event": "fork" }), [hook.id, hook.token, "github"]);
    expect(ignored.status).toBe(204);
    const wrong = await handleWebhookRequest(db, post("x", {}, { "x-github-event": "fork" }), [hook.id, "nope", "github"]);
    expect(wrong.status).toBe(404);
    const rows = await db.prepare("SELECT payload FROM messages").all<{ payload: string }>();
    expect(rows.results).toHaveLength(1);
    expect(JSON.parse(rows.results[0].payload).embeds[0].title).toBe("[o/r] Webhook connected");
  });

  it("only posts into a thread of its own channel", async () => {
    const hook = await createWebhook(db, { serverId: "s1", channelId: "c1", name: "CI", avatar: "🤖", createdBy: "u1" });
    await db.exec(`INSERT INTO messages (id, channel_id, content, thread_id) VALUES ('root', 'c1', 'hi', NULL), ('elsewhere', 'c2', 'x', NULL)`);
    const ok = await handleWebhookRequest(db, post("x?thread_id=root", { content: "in thread" }), [hook.id, hook.token]);
    expect(ok.status).toBe(204);
    const bad = await handleWebhookRequest(db, post("x?thread_id=elsewhere", { content: "nope" }), [hook.id, hook.token]);
    expect(bad.status).toBe(400);
  });

  it("describes itself on GET, as Discord tools check", async () => {
    const hook = await createWebhook(db, { serverId: "s1", channelId: "c1", name: "CI", avatar: "🤖", createdBy: "u1" });
    const response = await handleWebhookRequest(db, new Request("https://chat.test/x"), [hook.id, hook.token]);
    expect(await response.json()).toMatchObject({ id: hook.id, channel_id: "c1", name: "CI", type: 1 });
    expect(hook.id).toMatch(/^\d{17,20}$/);
  });

  it("lets the Discord bridge post with each person's picture, a link back, and as a reply", async () => {
    const hook = await createWebhook(db, { serverId: "s1", channelId: "c1", name: "Discord", avatar: "🌉", createdBy: "bot:discord-bridge", source: BRIDGE_WEBHOOK_SOURCE });
    const first = await executeWebhook(db, hook.id, hook.token, { content: "first" }, { wait: true, bridgeCaller: true });
    const { id: firstId } = (await first.json()) as { id: string };
    const response = await executeWebhook(
      db,
      hook.id,
      hook.token,
      {
        content: "hi from Discord",
        username: "Ayşe",
        avatar_url: "https://cdn.discordapp.com/avatars/1/a.png",
        hoffle_source_url: "https://discord.com/channels/1517821810626789436/900000000001/900000000777",
      },
      { wait: true, replyTo: firstId, bridgeCaller: true },
    );
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    const row = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first<Record<string, string>>();
    expect(row?.reply_to).toBe(firstId);
    expect(JSON.parse(row!.payload)).toMatchObject({
      webhookId: hook.id,
      avatarUrl: "https://cdn.discordapp.com/avatars/1/a.png",
      bridge: { platform: "discord", url: "https://discord.com/channels/1517821810626789436/900000000001/900000000777" },
    });
  });

  it("ignores the bridge-only link from an ordinary webhook, and unsafe pictures", async () => {
    const hook = await createWebhook(db, { serverId: "s1", channelId: "c1", name: "CI", avatar: "🤖", createdBy: "u1" });
    const response = await executeWebhook(
      db,
      hook.id,
      hook.token,
      { content: "x", avatar_url: "javascript:alert(1)", hoffle_source_url: "https://discord.com/channels/1/2/3" },
      { wait: true },
    );
    const { id } = (await response.json()) as { id: string };
    const row = await db.prepare("SELECT payload FROM messages WHERE id = ?").bind(id).first<{ payload: string }>();
    expect(JSON.parse(row!.payload)).not.toHaveProperty("bridge");
    expect(JSON.parse(row!.payload)).not.toHaveProperty("avatarUrl");
    expect(cleanAvatarUrl("/hangout/api/uploads/abc--me.png")).toBe("/hangout/api/uploads/abc--me.png");
    expect(cleanAvatarUrl("/hangout/api/admin")).toBeUndefined();
  });

  it("edits and deletes only its own messages, and skips edits that change nothing", async () => {
    const hook = await createWebhook(db, { serverId: "s1", channelId: "c1", name: "Discord", avatar: "🌉", createdBy: "u1" });
    const other = await createWebhook(db, { serverId: "s1", channelId: "c1", name: "Other", avatar: "🤖", createdBy: "u1" });
    const sent = await executeWebhook(db, hook.id, hook.token, { content: "typo" }, { wait: true });
    const { id } = (await sent.json()) as { id: string };
    expect(await webhookMessage(db, other, id)).toBeNull();
    const message = (await webhookMessage(db, hook, id))!;
    expect(message.content).toBe("typo");

    published.length = 0;
    const same = await editWebhookMessage(db, hook, message, { content: "typo" });
    expect(same).toBe(message);
    expect(published).toHaveLength(0);

    const edited = await editWebhookMessage(db, hook, message, { content: "fixed" });
    expect(edited).toMatchObject({ content: "fixed" });
    const history = await db.prepare("SELECT content FROM message_edits WHERE message_id = ?").bind(id).all<{ content: string }>();
    expect(history.results?.map((r) => r.content)).toEqual(["typo"]);
    expect(published.length).toBeGreaterThan(0);

    await deleteWebhookMessage(db, hook, (await webhookMessage(db, hook, id))!);
    expect(await webhookMessage(db, hook, id)).toBeNull();
    expect(published.some((p) => p.message.t === "message-deleted" && p.message.id === id)).toBe(true);
  });

  it("posts a linked person's Discord message as their own, only where they may post", async () => {
    await db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, display_name TEXT, avatar TEXT, color TEXT, is_admin INTEGER DEFAULT 0, created_at TEXT, suspended_at TEXT)`);
    await db.exec(`CREATE TABLE server_members (server_id TEXT, user_id TEXT, timeout_until TEXT)`);
    await db.exec(`CREATE TABLE bans (server_id TEXT, user_id TEXT)`);
    await db.exec(`CREATE TABLE channel_overwrites (channel_id TEXT, server_id TEXT, target_type TEXT, target_id TEXT, allow INTEGER, deny INTEGER)`);
    await db.exec(`CREATE TABLE discord_account_links (user_id TEXT PRIMARY KEY, discord_user_id TEXT NOT NULL UNIQUE, discord_name TEXT, linked_at TEXT NOT NULL)`);
    await db.exec(`CREATE TABLE automod_rules (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, kind TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      action TEXT NOT NULL DEFAULT 'block', timeout_minutes INTEGER NOT NULL DEFAULT 0, config TEXT NOT NULL DEFAULT '{}', created_by TEXT, created_at TEXT NOT NULL)`);
    await db.exec(`INSERT INTO users (id, username, display_name, avatar, color, is_admin, created_at) VALUES ('mewis', 'mewis', 'Mewis', 'M', '#ff00ff', 0, '2026-01-01')`);
    await db.exec(`INSERT INTO server_members (server_id, user_id) VALUES ('s1', 'mewis')`);
    await db.exec(`INSERT INTO discord_account_links VALUES ('mewis', '777777777777', 'qwerse', '2026-10-31')`);
    const hook = await createWebhook(db, { serverId: "s1", channelId: "c1", name: "Discord", avatar: "🌉", createdBy: "u1", source: BRIDGE_WEBHOOK_SOURCE });
    const plain = await createWebhook(db, { serverId: "s1", channelId: "c1", name: "CI", avatar: "🤖", createdBy: "u1" });

    const send = async (h: typeof hook, discordId: string, bridgeCaller = true, content = "hi") => {
      const response = await executeWebhook(db, h.id, h.token, { content, username: "qwerse", hoffle_discord_user_id: discordId }, { wait: true, bridgeCaller });
      if (response.status !== 200) return { status: response.status };
      const { id } = (await response.json()) as { id: string };
      return (await db.prepare("SELECT user_id, author, is_bot FROM messages WHERE id = ?").bind(id).first<Record<string, unknown>>())!;
    };
    expect(await send(hook, "777777777777")).toEqual({ user_id: "mewis", author: "Mewis", is_bot: 0 });
    // An unlinked Discord person, or any webhook but the bridge's: a bot message as before.
    expect(await send(hook, "888888888888")).toMatchObject({ user_id: null, author: "qwerse", is_bot: 1 });
    expect(await send(plain, "777777777777")).toMatchObject({ user_id: null, is_bot: 1 });
    // The bridge webhook's URL alone, without the bridge's own token, speaks for nobody.
    expect(await send(hook, "777777777777", false)).toMatchObject({ user_id: null, author: "qwerse", is_bot: 1 });

    // The bridge can still edit what it posted for them; the URL alone cannot.
    const row = await db.prepare("SELECT id FROM messages WHERE user_id = 'mewis'").first<{ id: string }>();
    expect(await webhookMessage(db, hook, row!.id, { bridgeCaller: true })).not.toBeNull();
    expect(await webhookMessage(db, hook, row!.id)).toBeNull();
    expect(await webhookMessage(db, plain, row!.id, { bridgeCaller: true })).toBeNull();

    // Their posts answer to the server's automod, as their own would.
    await db.exec(`INSERT INTO automod_rules (id, server_id, kind, config, created_at) VALUES ('r1', 's1', 'keyword', '{"words":["badword"]}', '2026-01-01')`);
    expect(await send(hook, "777777777777", true, "this has badword in it")).toEqual({ status: 400 });
    expect(await send(hook, "777777777777", true, "this is fine")).toMatchObject({ user_id: "mewis" });

    // Timed out, or suspended: no longer posting as them.
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await db.prepare("UPDATE server_members SET timeout_until = ? WHERE user_id = 'mewis'").bind(later).run();
    expect(await send(hook, "777777777777")).toMatchObject({ user_id: null, is_bot: 1 });
    await db.exec(`UPDATE server_members SET timeout_until = NULL`);
    await db.exec(`UPDATE users SET suspended_at = '2026-10-31' WHERE id = 'mewis'`);
    expect(await send(hook, "777777777777")).toMatchObject({ user_id: null, is_bot: 1 });
  });
});
