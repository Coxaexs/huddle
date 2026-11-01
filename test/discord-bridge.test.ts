import { beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteAvailable, sqliteD1 } from "./stubs/sqlite-d1";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/schema", () => ({ DEFAULT_SERVER_ID: "hangout", DM_SERVER_ID: "dm", ensureSchema: async () => undefined }));
vi.mock("@/lib/discord/snowflake", () => ({
  snowflakeFor: async (kind: string, id: string) => `${kind}:${id}`,
  nativeFor: async (_kind: string, id: string) => id.split(":")[1] ?? null,
}));

const bridge = await import("@/lib/discord-bridge");
const { reactorFromBridgeQuery, isExternalReactorId, botReactorId } = await import("@/lib/reactors");
const { DISCORD_BRIDGE_BOT, isBridgeBot } = await import("@/lib/bot-auth");
const { publicOrigin, publicWsOrigin } = await import("@/lib/public-origin");
const accounts = await import("@/lib/discord-accounts");
const seats = await import("@/lib/discord-voice-seat");

let db: D1Database;

async function schema() {
  db = sqliteD1();
  await db.batch([
    db.prepare("CREATE TABLE servers (id TEXT PRIMARY KEY, name TEXT, created_by TEXT, created_at TEXT)"),
    db.prepare(`CREATE TABLE channels (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, kind TEXT, position INTEGER DEFAULT 0, created_at TEXT)`),
    db.prepare(`CREATE TABLE channel_overwrites (channel_id TEXT NOT NULL, server_id TEXT NOT NULL, target_type TEXT NOT NULL,
      target_id TEXT NOT NULL DEFAULT '', allow INTEGER NOT NULL DEFAULT 0, deny INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (channel_id, target_type, target_id))`),
    db.prepare(`CREATE TABLE discord_bridges (server_id TEXT PRIMARY KEY, guild_id TEXT, guild_name TEXT, guild_icon TEXT, link_code TEXT,
      link_expires_at TEXT, linked_by TEXT, linked_at TEXT, settings TEXT NOT NULL DEFAULT '{}', created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare("CREATE UNIQUE INDEX discord_bridges_guild_idx ON discord_bridges(guild_id) WHERE guild_id IS NOT NULL"),
    db.prepare("CREATE UNIQUE INDEX discord_bridges_code_idx ON discord_bridges(link_code) WHERE link_code IS NOT NULL"),
    db.prepare(`CREATE TABLE discord_bridge_channels (server_id TEXT NOT NULL, channel_id TEXT NOT NULL, discord_channel_id TEXT NOT NULL,
      created_at TEXT NOT NULL, PRIMARY KEY (server_id, channel_id))`),
    db.prepare("CREATE UNIQUE INDEX discord_bridge_channels_discord_idx ON discord_bridge_channels(discord_channel_id)"),
    db.prepare("CREATE TABLE discord_bridge_service (id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare(`INSERT INTO servers VALUES ('s1', 'Writers', 'owner', '2026-01-01'), ('s2', 'Other', 'owner', '2026-01-01')`),
    db.prepare(`INSERT INTO channels (id, server_id, name, kind, created_at) VALUES
      ('genel', 's1', 'genel', 'text', '2026-01-01'), ('mikrofonsuz', 's1', 'mikrofonsuz', 'text', '2026-01-01'),
      ('cat', 's1', 'Stuff', 'category', '2026-01-01'), ('elsewhere', 's2', 'general', 'text', '2026-01-01')`),
  ]);
}

const guild = { id: "1517821810626789436", name: "The Writers Journey", icon: null };
const by = { id: "123456789012", name: "Ayşe" };

async function linked() {
  const row = await bridge.startBridge(db, "s1", "owner");
  await bridge.linkWithCode(db, row.link_code, guild, by);
}

describe("link codes", () => {
  it("are eight unambiguous characters, forgiving how they're typed", () => {
    const code = bridge.newLinkCode();
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(bridge.normalizeLinkCode(code.toLowerCase().replace("-", " "))).toBe(code);
    expect(bridge.normalizeLinkCode("abc")).toBe("");
  });

  it("settings fill in defaults and ignore junk", () => {
    expect(bridge.parseSettings(null)).toEqual(bridge.DEFAULT_BRIDGE_SETTINGS);
    expect(bridge.parseSettings('{"reactions":false,"typing":"yes"}')).toMatchObject({ reactions: false, typing: true });
    expect(bridge.parseSettings("not json")).toEqual(bridge.DEFAULT_BRIDGE_SETTINGS);
  });

  it("invite links ask for what the bridge uses", () => {
    const url = new URL(bridge.discordInviteUrl("1534110008453763093"));
    expect(url.searchParams.get("client_id")).toBe("1534110008453763093");
    expect(url.searchParams.get("scope")).toBe("bot applications.commands");
    const permissions = BigInt(url.searchParams.get("permissions") || "0");
    expect(permissions & (1n << 29n)).toBe(1n << 29n); // Manage Webhooks
    expect(permissions & (1n << 3n)).toBe(0n); // never Administrator
    expect(permissions & (3n << 20n)).toBe(3n << 20n); // Connect + Speak, for voice channels
  });

  it("voice helper invites ask only to join calls under a person's name, in the linked server", () => {
    const url = new URL(bridge.discordHelperInviteUrl("1534110008453763094", "1100000000000000001"));
    expect(url.searchParams.get("client_id")).toBe("1534110008453763094");
    expect(url.searchParams.get("scope")).toBe("bot");
    expect(url.searchParams.get("guild_id")).toBe("1100000000000000001");
    const permissions = BigInt(url.searchParams.get("permissions") || "0");
    expect(permissions).toBe((1n << 10n) | (1n << 20n) | (1n << 21n) | (1n << 26n)); // view, connect, speak, change nickname
    expect(new URL(bridge.discordHelperInviteUrl("1534110008453763094")).searchParams.has("guild_id")).toBe(false);
  });
});

describe.skipIf(!sqliteAvailable)("linking a Discord server", () => {
  beforeEach(schema);

  it("links with a fresh code, once", async () => {
    const row = await bridge.startBridge(db, "s1", "owner");
    expect(row.link_code).toMatch(/^.{4}-.{4}$/);
    const result = await bridge.linkWithCode(db, row.link_code!.toLowerCase(), guild, by);
    expect(result).toEqual({ serverId: "s1", serverName: "Writers" });
    const after = await bridge.loadBridge(db, "s1");
    expect(after?.guild_id).toBe(guild.id);
    expect(after?.link_code).toBeNull();
    // The code is used up.
    await expect(bridge.linkWithCode(db, row.link_code, guild, by)).rejects.toThrow(/expired/);
  });

  it("refuses expired codes and a Discord server bridged elsewhere", async () => {
    const row = await bridge.startBridge(db, "s1", "owner");
    await db.prepare("UPDATE discord_bridges SET link_expires_at = '2000-01-01' WHERE server_id = 's1'").run();
    await expect(bridge.linkWithCode(db, row.link_code, guild, by)).rejects.toThrow(/expired/);

    await linked();
    const other = await bridge.startBridge(db, "s2", "owner");
    await expect(bridge.linkWithCode(db, other.link_code, guild, by)).rejects.toThrow(/another Hoffle server/);
  });

  it("pairs channels of this server with channels the bot can see, one each", async () => {
    await linked();
    const seen = {
      id: guild.id,
      name: guild.name,
      icon: null,
      missing: [],
      channels: [
        { id: "900000000001", name: "genel", type: 0, parent: null, position: 0, missing: [] },
        { id: "900000000002", name: "miksiz", type: 0, parent: null, position: 1, missing: [] },
      ],
    };
    const pairs = await bridge.setPairs(db, "s1", [
      { channelId: "genel", discordChannelId: "900000000001" },
      { channelId: "mikrofonsuz", discordChannelId: "900000000002" },
    ], seen);
    expect(pairs).toHaveLength(2);
    expect(await bridge.loadPairs(db, "s1")).toHaveLength(2);

    await expect(bridge.setPairs(db, "s1", [{ channelId: "cat", discordChannelId: "900000000001" }], seen)).rejects.toThrow(/not a text channel/);
    await expect(bridge.setPairs(db, "s1", [{ channelId: "elsewhere", discordChannelId: "900000000001" }], seen)).rejects.toThrow(/not a text channel/);
    await expect(bridge.setPairs(db, "s1", [{ channelId: "genel", discordChannelId: "900000000009" }], seen)).rejects.toThrow(/not in the linked/);
    await expect(
      bridge.setPairs(db, "s1", [
        { channelId: "genel", discordChannelId: "900000000001" },
        { channelId: "mikrofonsuz", discordChannelId: "900000000001" },
      ], seen),
    ).rejects.toThrow(/paired once/);
  });

  it("won't pair a channel it can't see in the linked server, but lets saved pairs go", async () => {
    await linked();
    const seen = {
      id: guild.id,
      name: guild.name,
      icon: null,
      missing: [],
      channels: [
        { id: "900000000001", name: "genel", type: 0, parent: null, position: 0, missing: [] },
        { id: "900000000002", name: "miksiz", type: 0, parent: null, position: 1, missing: [] },
      ],
    };
    await bridge.setPairs(db, "s1", [
      { channelId: "genel", discordChannelId: "900000000001" },
      { channelId: "mikrofonsuz", discordChannelId: "900000000002" },
    ], seen);
    // The service has not reported the linked server (the bot was kicked, or
    // it is offline): an id could be a channel of anybody's Discord server.
    await expect(
      bridge.setPairs(db, "s1", [{ channelId: "genel", discordChannelId: "777000000001" }], null),
    ).rejects.toThrow(/can't see your Discord server/);
    // ...but a pair already saved can stay while another is removed, or all cleared.
    expect(await bridge.setPairs(db, "s1", [{ channelId: "genel", discordChannelId: "900000000001" }], null)).toHaveLength(1);
    expect(await bridge.setPairs(db, "s1", [], null)).toHaveLength(0);
  });

  it("gives the service everything it needs, and unlink clears the pairs", async () => {
    await linked();
    const seen = {
      id: guild.id,
      name: guild.name,
      icon: null,
      missing: [],
      channels: [{ id: "900000000001", name: "genel", type: 0, parent: null, position: 0, missing: [] }],
    };
    await bridge.setPairs(db, "s1", [{ channelId: "genel", discordChannelId: "900000000001" }], seen);
    await bridge.updateSettings(db, "s1", { typing: false, mirrorDeletes: false, bogus: true } as never);
    const config = await bridge.bridgeConfig(db);
    expect(config.bridges).toHaveLength(1);
    expect(config.bridges[0]).toMatchObject({
      serverId: "s1",
      serverName: "Writers",
      guildSnowflake: "guild:s1",
      discordGuildId: guild.id,
      settings: { typing: false, mirrorDeletes: false, reactions: true },
      channels: [{ hoffleChannelId: "genel", hoffleChannelSnowflake: "channel:genel", name: "genel", discordChannelId: "900000000001", private: false }],
    });

    expect(await bridge.unlinkGuild(db, guild.id)).toBe("s1");
    expect(await bridge.loadPairs(db, "s1")).toHaveLength(0);
    expect((await bridge.bridgeConfig(db)).bridges).toHaveLength(0);
    expect(await bridge.unlinkGuild(db, guild.id)).toBeNull();
  });

  it("pairs voice rooms with Discord voice channels, and carries the call only there", async () => {
    await linked();
    await db.prepare("INSERT INTO channels (id, server_id, name, kind, created_at) VALUES ('lounge', 's1', 'Lounge', 'voice', '2026-01-01')").run();
    const voiceGuild = {
      id: guild.id,
      name: guild.name,
      icon: null,
      missing: [],
      channels: [
        { id: "900000000001", name: "genel", type: 0, parent: null, position: 0, missing: [] },
        { id: "900000000003", name: "Lounge", type: 2, parent: null, position: 2, missing: [] },
      ],
    };
    // A text channel here can't take a Discord voice channel.
    await expect(bridge.setPairs(db, "s1", [{ channelId: "genel", discordChannelId: "900000000003" }], voiceGuild)).rejects.toThrow(
      /voice room/,
    );
    await bridge.setPairs(db, "s1", [{ channelId: "lounge", discordChannelId: "900000000003" }], voiceGuild);

    // Nothing is carried until the service has reported the channel as a voice channel.
    expect([...(await bridge.bridgedVoiceRooms(db))]).toEqual([]);
    await bridge.saveServiceStatus(db, { discord: { connected: true }, hoffle: { connected: true }, guilds: [voiceGuild] });
    expect([...(await bridge.bridgedVoiceRooms(db))]).toEqual(["lounge"]);
    const config = await bridge.bridgeConfig(db);
    expect(config.bridges[0].channels).toEqual([expect.objectContaining({ hoffleChannelId: "lounge", voice: true })]);

    // Switched off: the chat still crosses, the call doesn't.
    await bridge.updateSettings(db, "s1", { voice: false });
    expect([...(await bridge.bridgedVoiceRooms(db))]).toEqual([]);

    // A voice room paired with a text channel only carries its chat.
    await bridge.updateSettings(db, "s1", { voice: true });
    await bridge.setPairs(db, "s1", [{ channelId: "lounge", discordChannelId: "900000000001" }], voiceGuild);
    expect([...(await bridge.bridgedVoiceRooms(db))]).toEqual([]);
  });

  it("keeps only sane fields of the service's status", async () => {
    await bridge.saveServiceStatus(db, {
      version: "2.0.0",
      app: { id: "1534110008453763093", name: "huddle", avatarUrl: "https://cdn.discordapp.com/x.png" },
      discord: { connected: true, error: null },
      hoffle: { connected: true, error: null },
      guilds: [
        {
          id: guild.id,
          name: guild.name,
          icon: "javascript:alert(1)",
          missing: ["ManageWebhooks"],
          channels: [],
          voiceHelpers: ["1534110008453763094", "not-an-id", 7],
        },
      ],
      voiceHelpers: [
        { id: "1534110008453763094", name: "Hoffle Voice 1", avatarUrl: "http://plain.example/x.png", connected: true },
        { id: "<script>", name: "bad" },
      ],
      evil: "x".repeat(10),
    });
    const status = await bridge.loadServiceStatus(db);
    expect(status.online).toBe(true);
    expect(status.status.discord?.connected).toBe(true);
    expect(status.status.guilds?.[0].missing).toEqual(["ManageWebhooks"]);
    expect(status.status.guilds?.[0].icon).toBeNull();
    expect(status.status.app?.avatarUrl).toBe("https://cdn.discordapp.com/x.png");
    expect(status.status.guilds?.[0].voiceHelpers).toEqual(["1534110008453763094"]);
    expect(status.status.voiceHelpers).toEqual([
      { id: "1534110008453763094", name: "Hoffle Voice 1", avatarUrl: null, connected: true },
    ]);
    expect(status.status).not.toHaveProperty("evil");
  });
});

describe("acting for people on Discord", () => {
  const url = (query: string) => new URL(`https://h.test/hangout/api/v10/channels/1/typing?${query}`);
  const someBot = { id: "b1", name: "Bot", avatar: "🤖", serverId: "s1", isMaster: false, kind: "custom" } as never;

  it("only the bridge may react or type on someone's behalf", () => {
    const actor = reactorFromBridgeQuery(DISCORD_BRIDGE_BOT, url("on_behalf_of=discord:123456&name=Ay%C5%9Fe&avatar_url=https://cdn.discordapp.com/a.png"));
    expect(actor).toMatchObject({ id: "ext:discord:123456", name: "Ayşe", avatarUrl: "https://cdn.discordapp.com/a.png" });
    expect(isExternalReactorId(actor!.id)).toBe(true);
    expect(reactorFromBridgeQuery(someBot, url("on_behalf_of=discord:123456&name=x"))).toBeNull();
    expect(reactorFromBridgeQuery(DISCORD_BRIDGE_BOT, url("on_behalf_of=hoffle:abc"))).toBeNull();
    expect(isBridgeBot(DISCORD_BRIDGE_BOT)).toBe(true);
    expect(isBridgeBot(someBot)).toBe(false);
    expect(botReactorId(someBot)).toBe("bot:b1");
  });
});

describe("public origin behind a proxy", () => {
  it("uses https when Cloudflare or the proxy says so", () => {
    const behind = new Request("http://hoffle.online/hangout/api/v10/gateway", { headers: { "cf-visitor": '{"scheme":"https"}' } });
    expect(publicOrigin(behind)).toBe("https://hoffle.online");
    expect(publicWsOrigin(behind)).toBe("wss://hoffle.online");
    const proxied = new Request("http://hoffle.online/x", { headers: { "x-forwarded-proto": "https" } });
    expect(publicWsOrigin(proxied)).toBe("wss://hoffle.online");
    expect(publicWsOrigin(new Request("http://127.0.0.1:8730/x"))).toBe("ws://127.0.0.1:8730");
  });
});

describe.skipIf(!sqliteAvailable)("linking a Discord account to a Hoffle account", () => {

  beforeEach(async () => {
    await schema();
    await db.batch([
      db.prepare("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, display_name TEXT, avatar TEXT, color TEXT, is_admin INTEGER DEFAULT 0, created_at TEXT, suspended_at TEXT)"),
      db.prepare("CREATE TABLE server_members (server_id TEXT, user_id TEXT, timeout_until TEXT)"),
      db.prepare("CREATE TABLE bans (server_id TEXT, user_id TEXT)"),
      db.prepare("CREATE TABLE discord_account_links (user_id TEXT PRIMARY KEY, discord_user_id TEXT NOT NULL UNIQUE, discord_name TEXT, linked_at TEXT NOT NULL)"),
      db.prepare("CREATE TABLE discord_account_codes (code TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)"),
      db.prepare("INSERT INTO users (id, username, display_name, avatar, color, is_admin, created_at) VALUES ('mewis', 'mewis', 'Mewis', 'M', '#ff00ff', 0, '2026-01-01'), ('other', 'other', 'Other', 'O', '#00ff00', 0, '2026-01-01')"),
      db.prepare("INSERT INTO server_members (server_id, user_id) VALUES ('s1', 'mewis'), ('s1', 'other')"),
    ]);
  });

  it("links with a code made in Hoffle and run on Discord, then acts only where they could", async () => {
    const { code } = await accounts.newAccountCode(db, "mewis");
    expect(await accounts.pendingAccountCode(db, "mewis")).toMatchObject({ code });
    const linked = await accounts.linkAccountWithCode(db, code.toLowerCase(), { id: "777777777777", name: "qwerse" });
    expect(linked).toEqual({ userId: "mewis", username: "mewis", displayName: "Mewis" });
    expect(await accounts.pendingAccountCode(db, "mewis")).toBeNull();
    await expect(accounts.linkAccountWithCode(db, code, { id: "777777777777", name: "qwerse" })).rejects.toThrow(/expired/);

    // In a server they're in: theirs. Elsewhere, or once banned: bridged like anyone.
    expect((await accounts.linkedActor(db, "777777777777", "genel"))?.id).toBe("mewis");
    expect(await accounts.linkedActor(db, "777777777777", "elsewhere")).toBeNull();
    expect(await accounts.linkedActor(db, "888888888888", "genel")).toBeNull();
    await db.prepare("INSERT INTO bans VALUES ('s1', 'mewis')").run();
    expect(await accounts.linkedActor(db, "777777777777", "genel")).toBeNull();

    expect(await accounts.accountLinksForService(db)).toEqual([{ discordUserId: "777777777777", hoffleUserId: "user:mewis" }]);
    expect(await accounts.unlinkAccount(db, { discordUserId: "777777777777" })).toBe(true);
    expect(await accounts.accountLinkFor(db, "mewis")).toBeNull();
  });

  it("doesn't let a suspended or timed-out account act through its Discord link", async () => {
    await accounts.linkAccountWithCode(db, (await accounts.newAccountCode(db, "mewis")).code, { id: "777777777777", name: "q" });
    expect((await accounts.linkedActor(db, "777777777777", "genel"))?.id).toBe("mewis");

    // Timed out in this server: bridged like anyone, not as their account.
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await db.prepare("UPDATE server_members SET timeout_until = ? WHERE user_id = 'mewis'").bind(later).run();
    expect(await accounts.linkedActor(db, "777777777777", "genel")).toBeNull();
    // Once it runs out, theirs again.
    await db.prepare("UPDATE server_members SET timeout_until = '2000-01-01T00:00:00Z' WHERE user_id = 'mewis'").run();
    expect((await accounts.linkedActor(db, "777777777777", "genel"))?.id).toBe("mewis");

    // Suspended: signed out everywhere, Discord included.
    await db.prepare("UPDATE users SET suspended_at = '2026-10-31' WHERE id = 'mewis'").run();
    expect(await accounts.linkedActor(db, "777777777777", "genel")).toBeNull();
  });

  it("moves a Discord account to whichever Hoffle account proves it last", async () => {
    await accounts.linkAccountWithCode(db, (await accounts.newAccountCode(db, "mewis")).code, { id: "777777777777", name: "q" });
    await accounts.linkAccountWithCode(db, (await accounts.newAccountCode(db, "other")).code, { id: "777777777777", name: "q" });
    expect(await accounts.accountLinkFor(db, "mewis")).toBeNull();
    expect((await accounts.accountLinkByDiscord(db, "777777777777"))?.userId).toBe("other");
  });

  it("refuses expired and malformed codes", async () => {
    const { code } = await accounts.newAccountCode(db, "mewis");
    await db.prepare("UPDATE discord_account_codes SET expires_at = '2000-01-01'").run();
    await expect(accounts.linkAccountWithCode(db, code, { id: "777777777777", name: "q" })).rejects.toThrow(/expired/);
    await expect(accounts.linkAccountWithCode(db, "nope", { id: "777777777777", name: "q" })).rejects.toThrow(/doesn't look right/);
  });
});

describe.skipIf(!sqliteAvailable)("Discord people's voice seats", () => {
  beforeEach(async () => {
    db = sqliteD1();
    await db.batch([
      db.prepare("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, display_name TEXT, avatar TEXT, avatar_url TEXT, color TEXT, suspended_at TEXT)"),
      db.prepare("CREATE TABLE discord_account_links (user_id TEXT PRIMARY KEY, discord_user_id TEXT NOT NULL UNIQUE, discord_name TEXT, linked_at TEXT NOT NULL)"),
      db.prepare("INSERT INTO users (id, username, display_name, avatar, avatar_url, color) VALUES ('mewis', 'mewis', 'Mewis', 'M', '/hangout/api/files/m.png', '#ff00ff')"),
      db.prepare("INSERT INTO discord_account_links VALUES ('mewis', '777777777777', 'qwerse', '2026-10-31')"),
    ]);
  });
  const params = (query: Record<string, string>) => new URLSearchParams(query);

  it("is the bridge's own monitor when no Discord account is named", async () => {
    expect(await seats.bridgeSeatIdentity(db, params({}), "/hangout")).toMatchObject({ userId: "bot:discord-bridge", discord: false });
  });

  it("sits a linked person as themselves", async () => {
    expect(await seats.bridgeSeatIdentity(db, params({ discordUser: "777777777777", name: "fake name" }), "/hangout")).toEqual({
      userId: "mewis",
      username: "mewis",
      displayName: "Mewis",
      avatar: "M",
      avatarUrl: "/hangout/api/files/m.png",
      color: "#ff00ff",
      discord: true,
    });
  });

  it("sits a suspended account as a Discord stand-in, never as the account", async () => {
    await db.prepare("UPDATE users SET suspended_at = '2026-10-31' WHERE id = 'mewis'").run();
    expect(await seats.bridgeSeatIdentity(db, params({ discordUser: "777777777777", name: "qwerse" }), "/hangout")).toMatchObject({
      userId: "discord:777777777777",
      displayName: "qwerse",
      discord: true,
    });
  });

  it("sits anyone else as a Discord stand-in, with a clean name and a proxied Discord picture", async () => {
    const seat = await seats.bridgeSeatIdentity(
      db,
      params({
        discordUser: "888888888888",
        name: "  Ayşe\u202e\n  the   great ",
        avatarUrl: "https://cdn.discordapp.com/avatars/888888888888/abc.png?size=64",
      }),
      "/hangout",
    );
    expect(seat).toMatchObject({
      userId: "discord:888888888888",
      displayName: "Ayşe the great",
      avatar: "A",
      color: seats.DISCORD_SEAT_COLOR,
      discord: true,
    });
    expect(seat?.avatarUrl).toBe(
      `/hangout/api/unfurl/image?url=${encodeURIComponent("https://cdn.discordapp.com/avatars/888888888888/abc.png?size=64")}`,
    );
    // Pictures from anywhere else, and odd account ids, are refused.
    expect(seats.discordSeatPicture("https://evil.example/a.png", "/hangout")).toBeNull();
    expect(seats.discordSeatPicture("https://cdn.discordapp.com/a.png\"><x", "/hangout")).toBeNull();
    expect(await seats.bridgeSeatIdentity(db, params({ discordUser: "../../x" }), "/hangout")).toBeNull();
    expect(seats.cleanSeatName("")).toBe("Discord user");
    expect(Array.from(seats.cleanSeatName("x".repeat(80)))).toHaveLength(32);
  });
});
