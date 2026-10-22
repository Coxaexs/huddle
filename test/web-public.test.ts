import { beforeEach, describe, expect, it } from "vitest";
import { sqliteAvailable, sqliteD1 } from "./stubs/sqlite-d1";
import { listWebPages, loadWebMessages, loadWebServer, webChannelPath } from "@/lib/web-public";
import { isOnTheWeb } from "@/lib/web-public-client";

let db: D1Database;

describe.skipIf(!sqliteAvailable)("servers readable on the web", () => {
  beforeEach(async () => {
    db = sqliteD1();
    await db.batch([
      db.prepare(`CREATE TABLE servers (id TEXT PRIMARY KEY, name TEXT, description TEXT, icon TEXT, color TEXT, icon_url TEXT,
        vanity_code TEXT, web_public INTEGER DEFAULT 0, created_at TEXT)`),
      db.prepare("CREATE TABLE server_members (server_id TEXT, user_id TEXT)"),
      db.prepare("CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT, avatar_url TEXT)"),
      db.prepare("CREATE TABLE channels (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, topic TEXT, kind TEXT, position INTEGER, nsfw INTEGER DEFAULT 0, created_at TEXT)"),
      db.prepare("CREATE TABLE channel_overwrites (channel_id TEXT, server_id TEXT, target_type TEXT, target_id TEXT, allow INTEGER, deny INTEGER)"),
      db.prepare(`CREATE TABLE messages (id TEXT PRIMARY KEY, channel_id TEXT, user_id TEXT, author TEXT, avatar TEXT, color TEXT, content TEXT,
        created_at TEXT, deleted_at TEXT, thread_id TEXT, attachment_key TEXT, attachments TEXT)`),
      db.prepare("INSERT INTO servers VALUES ('s1', 'D&D Club', 'Weekly one-shots', 'D', '#6a4ddb', NULL, 'DNDCLUB', 1, '2026'), ('s2', 'Secret', '', 'S', '#000', NULL, NULL, 0, '2026')"),
      db.prepare("INSERT INTO server_members VALUES ('s1', 'u1'), ('s1', 'u2')"),
      db.prepare("INSERT INTO users VALUES ('u1', 'Mira', NULL)"),
      db.prepare(`INSERT INTO channels VALUES
        ('c1', 's1', 'general', 'Say hi', 'text', 0, 0, '2026'),
        ('c2', 's1', 'gm-room', '', 'text', 1, 0, '2026'),
        ('c3', 's1', 'spicy', '', 'text', 2, 1, '2026'),
        ('c4', 's1', 'Table', '', 'voice', 3, 0, '2026'),
        ('c5', 's1', 'news', '', 'announcement', 4, 0, '2026'),
        ('x1', 's2', 'general', '', 'text', 0, 0, '2026')`),
      db.prepare(`INSERT INTO channel_overwrites VALUES ('c2', 's1', 'everyone', '', 0, ${1 << 30})`),
      db.prepare(`INSERT INTO messages VALUES
        ('m1', 'c1', 'u1', 'mira', 'M', '#f00', 'hello https://example.com', '2026-10-01T10:00:00.000Z', NULL, NULL, NULL, NULL),
        ('m2', 'c1', 'u2', 'kai', 'K', '#0f0', 'gone', '2026-10-01T10:01:00.000Z', '2026-10-02', NULL, NULL, NULL),
        ('m3', 'c1', 'u2', 'kai', 'K', '#0f0', 'in a thread', '2026-10-01T10:02:00.000Z', NULL, 'm1', NULL, NULL),
        ('m4', 'c1', 'u2', 'kai', 'K', '#0f0', '/hangout/stickers/hoffy/hi.svg', '2026-10-01T10:03:00.000Z', NULL, NULL, NULL, NULL),
        ('m5', 'c1', 'u2', 'kai', 'K', '#0f0', 'look', '2026-10-01T10:04:00.000Z', NULL, NULL, 'abc--map.png', '["def--notes.pdf"]')`),
    ]);
  });

  it("finds an opted-in server by vanity or id, and nothing else", async () => {
    expect((await loadWebServer(db, "dndclub"))?.id).toBe("s1");
    expect((await loadWebServer(db, "s1"))?.name).toBe("D&D Club");
    expect(await loadWebServer(db, "s2")).toBeNull();
    expect(await loadWebServer(db, "nope")).toBeNull();
  });

  it("shows only open text and announcement channels", async () => {
    const server = await loadWebServer(db, "s1");
    expect(server?.channels.map((c) => c.name)).toEqual(["general", "news"]);
    expect(server?.memberCount).toBe(2);
    expect(webChannelPath(server!, server!.channels[0])).toBe("/s/dndclub/general");
  });

  it("lists messages without deleted ones or thread replies, with pictures from our own files", async () => {
    const { messages, older } = await loadWebMessages(db, "c1", null);
    expect(messages.map((m) => m.id)).toEqual(["m1", "m4", "m5"]);
    expect(messages[0].author).toBe("Mira");
    expect(messages[1]).toMatchObject({ content: "", images: ["/hangout/stickers/hoffy/hi.svg"] });
    expect(messages[2].images).toEqual(["/hangout/api/uploads/abc--map.png"]);
    expect(older).toBeNull();
    expect((await loadWebMessages(db, "c1", "2026-10-01T10:03:00.000Z")).messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("puts the server and its channels with messages in the sitemap", async () => {
    expect(await listWebPages(db)).toEqual([
      { path: "/s/dndclub", lastmod: null },
      { path: "/s/dndclub/general", lastmod: "2026-10-01" },
    ]);
  });

  it("marks the same channels on the web in the app", () => {
    expect(isOnTheWeb({ kind: "text", nsfw: false, access: undefined })).toBe(true);
    expect(isOnTheWeb({ kind: "text", nsfw: false, access: 123 })).toBe(false);
    expect(isOnTheWeb({ kind: "text", nsfw: true, access: undefined })).toBe(false);
    expect(isOnTheWeb({ kind: "voice", nsfw: false, access: undefined })).toBe(false);
  });
});
