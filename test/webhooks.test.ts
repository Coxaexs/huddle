import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetMemoryRateLimits } from "@/lib/rate-limit";
import {
  cleanEmbeds,
  createWebhook,
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
}));
vi.mock("@/lib/discord/dispatch", () => ({ dispatchMessage: vi.fn(async () => undefined) }));

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
    await db.exec(`CREATE TABLE channel_webhooks (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, channel_id TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '🪝', token TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, last_used_at TEXT, uses INTEGER NOT NULL DEFAULT 0)`);
    await db.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, channel TEXT, channel_id TEXT, user_id TEXT, author TEXT, avatar TEXT,
      color TEXT, content TEXT, attachment_key TEXT, is_bot INTEGER, created_at TEXT, payload TEXT, reply_to TEXT, thread_id TEXT, deleted_at TEXT)`);
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
});
