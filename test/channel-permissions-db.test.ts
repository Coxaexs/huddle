import { beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteAvailable, sqliteD1 } from "./stubs/sqlite-d1";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/schema", () => ({ DEFAULT_SERVER_ID: "hangout", DM_SERVER_ID: "dm", ensureSchema: async () => undefined }));

const { channelAccess } = await import("@/lib/access");
const { channelViewers, hiddenChannelIds, memberAccessMany } = await import("@/lib/channel-permissions");
const { applyServerLayout } = await import("@/lib/server-layout");
const { layoutFromDiscord } = await import("@/lib/discord-import");
const { Permission } = await import("@/lib/permissions");
const { TEMPLATE_GUILD } = await import("./fixtures/discord-template");

let db: D1Database;

async function schema() {
  db = sqliteD1();
  await db.batch([
    db.prepare("CREATE TABLE servers (id TEXT PRIMARY KEY, created_by TEXT, everyone_permissions INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("CREATE TABLE users (id TEXT PRIMARY KEY, is_admin INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("CREATE TABLE server_members (server_id TEXT, user_id TEXT)"),
    db.prepare("CREATE TABLE bans (server_id TEXT, user_id TEXT)"),
    db.prepare("CREATE TABLE dm_members (channel_id TEXT, user_id TEXT)"),
    db.prepare("CREATE TABLE roles (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, color TEXT, permissions INTEGER, position INTEGER, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE member_roles (server_id TEXT, user_id TEXT, role_id TEXT)"),
    db.prepare("CREATE TABLE categories (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, position INTEGER, created_at TEXT NOT NULL)"),
    db.prepare(`CREATE TABLE channels (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, kind TEXT, topic TEXT DEFAULT '', position INTEGER DEFAULT 0,
      category_id TEXT, created_at TEXT, slowmode INTEGER NOT NULL DEFAULT 0, nsfw INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE TABLE channel_overwrites (channel_id TEXT NOT NULL, server_id TEXT NOT NULL, target_type TEXT NOT NULL,
      target_id TEXT NOT NULL DEFAULT '', allow INTEGER NOT NULL DEFAULT 0, deny INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (channel_id, target_type, target_id))`),
  ]);
}

const VIEW = 1 << 30;

describe.skipIf(!sqliteAvailable)("channel permissions against a real database", () => {
  beforeEach(async () => {
    await schema();
    await db.batch([
      db.prepare("INSERT INTO servers (id, created_by) VALUES ('s1', 'owner')"),
      db.prepare("INSERT INTO users (id, is_admin) VALUES ('owner', 0), ('gm', 0), ('player', 0), ('friend', 0), ('root', 1)"),
      db.prepare("INSERT INTO server_members VALUES ('s1', 'owner'), ('s1', 'gm'), ('s1', 'player'), ('s1', 'friend')"),
      db.prepare("INSERT INTO roles VALUES ('r-gm', 's1', 'GM', '#ff0000', 0, 2, 'now')"),
      db.prepare("INSERT INTO member_roles VALUES ('s1', 'gm', 'r-gm')"),
      db.prepare("INSERT INTO channels (id, server_id, name, kind) VALUES ('general', 's1', 'general', 'text'), ('gm-room', 's1', 'gm-room', 'text'), ('news', 's1', 'news', 'text')"),
      db.prepare(`INSERT INTO channel_overwrites VALUES
        ('gm-room', 's1', 'everyone', '', 0, ${VIEW}),
        ('gm-room', 's1', 'role', 'r-gm', ${VIEW}, 0),
        ('gm-room', 's1', 'member', 'friend', ${VIEW}, 0),
        ('news', 's1', 'everyone', '', 0, ${Permission.SEND_MESSAGES})`),
    ]);
  });

  it("works out who holds what server-wide", async () => {
    const access = await memberAccessMany(db, "s1", ["owner", "gm", "player", "root"]);
    expect(access.get("owner")?.unlimited).toBe(true);
    expect(access.get("root")?.unlimited).toBe(true);
    expect(access.get("gm")?.roleIds.has("r-gm")).toBe(true);
    expect(access.get("player")?.unlimited).toBe(false);
  });

  it("lets only the GM role, the friend let in by name, and the owner see a private channel", async () => {
    expect(await channelViewers(db, "gm-room", "s1", ["owner", "gm", "player", "friend"])).toEqual(["owner", "gm", "friend"]);
    expect(await channelViewers(db, "general", "s1", ["owner", "player"])).toEqual(["owner", "player"]);
    expect([...(await hiddenChannelIds(db, "player"))]).toEqual(["gm-room"]);
    expect([...(await hiddenChannelIds(db, "gm"))]).toEqual([]);
  });

  it("answers 404 for a channel you can't see, and 403 when you can see but not post", async () => {
    const hidden = await channelAccess(db, "gm-room", { id: "player" });
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.response.status).toBe(404);
    expect((await channelAccess(db, "gm-room", { id: "gm" })).ok).toBe(true);
    const readOnly = await channelAccess(db, "news", { id: "player" }, { need: [Permission.SEND_MESSAGES] });
    expect(readOnly.ok).toBe(false);
    if (!readOnly.ok) expect(readOnly.response.status).toBe(403);
    const reading = await channelAccess(db, "news", { id: "player" });
    expect(reading.ok).toBe(true);
  });

  it("imports a Discord server with its private channel intact, and twice is the same as once", async () => {
    await db.batch([db.prepare("INSERT INTO servers (id, created_by) VALUES ('s2', 'owner')"), db.prepare("INSERT INTO server_members VALUES ('s2', 'owner'), ('s2', 'player')")]);
    const { layout } = layoutFromDiscord(TEMPLATE_GUILD.roles, TEMPLATE_GUILD.channels, "0");
    const first = await applyServerLayout(db, "s2", layout, { setEveryone: true });
    expect(first).toMatchObject({ categories: 2, channels: 6, roles: 3, privateChannels: ["gm-room"] });
    const again = await applyServerLayout(db, "s2", layout);
    expect(again).toMatchObject({ categories: 0, channels: 0, roles: 0 });

    const gmRoom = await db.prepare("SELECT id FROM channels WHERE server_id = 's2' AND name = 'gm-room'").first<{ id: string }>();
    const gmRole = await db.prepare("SELECT id, permissions FROM roles WHERE server_id = 's2' AND name = 'Game Master'").first<{ id: string; permissions: number }>();
    expect(gmRole?.permissions).toBe(Permission.ADMINISTRATOR);
    expect(await channelViewers(db, gmRoom!.id, "s2", ["player"])).toEqual([]);
    await db.prepare("INSERT INTO member_roles VALUES ('s2', 'player', ?)").bind(gmRole!.id).run();
    expect(await channelViewers(db, gmRoom!.id, "s2", ["player"])).toEqual(["player"]);

    // @everyone only ever gets member-level permissions from an import.
    const server = await db.prepare("SELECT everyone_permissions FROM servers WHERE id = 's2'").first<{ everyone_permissions: number }>();
    expect(server!.everyone_permissions & (Permission.ADMINISTRATOR | Permission.MANAGE_SERVER | Permission.BAN_MEMBERS)).toBe(0);
  });

  it("never creates roles stronger than the person importing", async () => {
    await db.prepare("INSERT INTO servers (id, created_by) VALUES ('s3', 'owner')").run();
    const { layout } = layoutFromDiscord(TEMPLATE_GUILD.roles, TEMPLATE_GUILD.channels, "0");
    await applyServerLayout(db, "s3", layout, { grantable: Permission.KICK_MEMBERS });
    const roles = await db.prepare("SELECT name, permissions FROM roles WHERE server_id = 's3' ORDER BY position").all<{ name: string; permissions: number }>();
    expect(roles.results.map((r) => [r.name, r.permissions])).toEqual([
      ["Players", 0],
      ["Game Master", 0],
      ["Mods", Permission.KICK_MEMBERS],
    ]);
  });
});
