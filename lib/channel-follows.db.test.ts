import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";

vi.mock("cloudflare:workers", () => ({ env: {} }));
import { addFollow, deliverToFollowers, followTargets, MAX_FOLLOWS_INTO_CHANNEL, removeFollow } from "./channel-follows";
import type { StoredMessage } from "./storage";

/** A real SQLite database behind D1's API, with just the tables following uses. */
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE servers (id TEXT PRIMARY KEY, name TEXT, icon TEXT, color TEXT, icon_url TEXT);
    CREATE TABLE channels (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, kind TEXT);
    CREATE TABLE channel_follows (source_channel_id TEXT, target_channel_id TEXT, created_by TEXT, created_at TEXT,
      PRIMARY KEY (source_channel_id, target_channel_id));
    CREATE TABLE messages (id TEXT PRIMARY KEY, channel TEXT, channel_id TEXT, user_id TEXT, author TEXT, avatar TEXT,
      color TEXT, content TEXT, attachment_key TEXT, attachments TEXT, is_bot INTEGER, created_at TEXT, link TEXT,
      action_label TEXT, audio_url TEXT, payload TEXT);
    INSERT INTO servers VALUES ('hoffle', 'Hoffle', 'h', '#7c3aed', NULL), ('friends', 'Friends', 'f', '#000', NULL);
    INSERT INTO channels VALUES ('news', 'hoffle', 'news', 'announcement'), ('chat', 'hoffle', 'chat', 'text'),
      ('general', 'friends', 'general', 'text'), ('updates', 'friends', 'updates', 'announcement');
  `);
  const db = {
    prepare: (sql: string) => {
      const statement = sqlite.prepare(sql);
      const bound = (args: unknown[]) => ({
        all: async () => ({ results: statement.all(...(args as never[])) }),
        first: async () => statement.get(...(args as never[])) ?? null,
        run: async () => statement.run(...(args as never[])),
      });
      return { ...bound([]), bind: (...args: unknown[]) => bound(args) };
    },
  } as unknown as D1Database;
  return { sqlite, db };
}

const post: StoredMessage = {
  id: "m1", channel: "news", channel_id: "news", user_id: "kiwi", author: "mewis", avatar: "K", color: "#000",
  content: "v2 is out", attachment_key: null, is_bot: 0, created_at: "2026-11-05T10:00:00Z",
};

describe("following announcement channels", () => {
  it("copies a new post into every following channel", async () => {
    const { sqlite, db } = database();
    expect(await addFollow(db, "news", "general", "kiwi")).toBe("added");
    expect(await addFollow(db, "news", "general", "kiwi")).toBe("already");
    expect(await addFollow(db, "news", "updates", "kiwi")).toBe("added");
    const publish = vi.fn(async () => undefined);

    expect(await deliverToFollowers(db, "news", post, { publish })).toBe(2);
    const copies = sqlite.prepare("SELECT channel_id, author, content, is_bot FROM messages ORDER BY channel_id").all();
    expect(copies).toEqual([
      { channel_id: "general", author: "Hoffle #news", content: "v2 is out", is_bot: 1 },
      { channel_id: "updates", author: "Hoffle #news", content: "v2 is out", is_bot: 1 },
    ]);
    expect(publish).toHaveBeenCalledTimes(2);
    expect((await followTargets(db, "news")).map((row) => row.id)).toEqual(["general", "updates"]);
  });

  it("sends nothing from a channel that is not an announcement channel, or once unfollowed", async () => {
    const { sqlite, db } = database();
    await addFollow(db, "chat", "general", "kiwi");
    expect(await deliverToFollowers(db, "chat", { ...post, channel_id: "chat" }, { publish: async () => undefined })).toBe(0);
    await addFollow(db, "news", "general", "kiwi");
    await removeFollow(db, "news", "general");
    expect(await deliverToFollowers(db, "news", post, { publish: async () => undefined })).toBe(0);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM messages").get()).toEqual({ n: 0 });
  });

  it("caps how many channels one channel follows, not counting deleted ones", async () => {
    const { sqlite, db } = database();
    for (let i = 0; i < MAX_FOLLOWS_INTO_CHANNEL; i++) {
      sqlite.prepare("INSERT INTO channels VALUES (?, 'hoffle', ?, 'announcement')").run(`a${i}`, `a${i}`);
      expect(await addFollow(db, `a${i}`, "general", "kiwi")).toBe("added");
    }
    expect(await addFollow(db, "news", "general", "kiwi")).toBe("full");
    sqlite.prepare("DELETE FROM channels WHERE id = 'a0'").run();
    expect(await addFollow(db, "news", "general", "kiwi")).toBe("added");
  });
});
