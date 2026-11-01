import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { musicBotInServer, serversWithMusicBot } from "./music-bot";
import { backfillMusicBot } from "./schema";
import { sqliteAvailable, sqliteD1 } from "../test/stubs/sqlite-d1";

async function dbWithServers(ids: string[]): Promise<D1Database> {
  const db = sqliteD1();
  await db.batch([
    db.prepare("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    db.prepare("CREATE TABLE servers (id TEXT PRIMARY KEY, created_by TEXT)"),
    db.prepare(`CREATE TABLE server_bots (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '🤖',
      token TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'custom',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL
    )`),
    ...ids.map((id) => db.prepare("INSERT INTO servers VALUES (?, 'owner')").bind(id)),
  ]);
  return db;
}

const musicRows = async (db: D1Database) =>
  (
    await db
      .prepare("SELECT server_id, enabled, created_by FROM server_bots WHERE kind = 'music' ORDER BY server_id")
      .all<{ server_id: string; enabled: number; created_by: string }>()
  ).results;

describe.skipIf(!sqliteAvailable)("the music bot is added per server", () => {
  it("keeps it in every server that existed before, once each, but not in DMs", async () => {
    const db = await dbWithServers(["dm", "hangout", "friends"]);
    await backfillMusicBot(db);
    await backfillMusicBot(db);
    expect(await musicRows(db)).toEqual([
      { server_id: "friends", enabled: 1, created_by: "owner" },
      { server_id: "hangout", enabled: 1, created_by: "owner" },
    ]);
    expect(await musicBotInServer(db, "hangout")).toBe(true);
    expect(await musicBotInServer(db, "dm")).toBe(false);
  });

  it("does not add it to a server that already has one", async () => {
    const db = await dbWithServers(["hangout"]);
    await db
      .prepare(
        "INSERT INTO server_bots (id, server_id, name, token, kind, enabled, created_at) VALUES ('b1', 'hangout', 'Mine', 't1', 'music', 0, 'now')",
      )
      .run();
    await backfillMusicBot(db);
    expect(await musicRows(db)).toEqual([{ server_id: "hangout", enabled: 0, created_by: null }]);
    expect(await musicBotInServer(db, "hangout")).toBe(false);
  });

  it("leaves servers made later, and servers that removed it, without it", async () => {
    const db = await dbWithServers(["hangout"]);
    await backfillMusicBot(db);
    await db.prepare("DELETE FROM server_bots WHERE server_id = 'hangout'").run();
    await db.prepare("INSERT INTO servers VALUES ('new-one', 'someone')").run();
    await backfillMusicBot(db);
    expect(await musicRows(db)).toEqual([]);
    expect(await musicBotInServer(db, "new-one")).toBe(false);
  });

  it("lists the servers that have it turned on", async () => {
    const db = await dbWithServers(["a", "b"]);
    await backfillMusicBot(db);
    await db.prepare("UPDATE server_bots SET enabled = 0 WHERE server_id = 'b'").run();
    expect([...(await serversWithMusicBot(db))]).toEqual(["a"]);
  });
});
