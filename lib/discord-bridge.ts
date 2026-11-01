/**
 * The Discord bridge, Hoffle's half.
 *
 * The bridge itself is a small service (discord-bridge/) holding two
 * connections: one to Discord with a Discord bot, one to Hoffle's
 * Discord-compatible gateway as the "Discord Bridge" bot. This file is what
 * Hoffle keeps for it, per server:
 *
 * 1. A server admin presses Set up. Hoffle makes a short link code.
 * 2. They add the bridge's Discord bot to their Discord server and run
 *    `/hoffle link <code>` there. Discord only lets people with Manage Server
 *    run it, and the service checks again, so a Hoffle server can only be tied
 *    to a Discord server its admin also runs.
 * 3. They pair channels (Hoffle #general ↔ Discord #general) and pick options.
 *
 * The service polls `bridgeConfig()` and reports back with `saveServiceStatus`:
 * which Discord servers it is in, their channels, and what is missing (a
 * permission, a channel it cannot see). Server Settings shows that as a status
 * light and as the channel dropdowns.
 */
import { postableChannelKindsSql } from "./channel-kinds";
import { isPrivateChannel, loadOverwrites } from "./channel-permissions";
import { snowflakeFor } from "./discord/snowflake";

export interface BridgeSettings {
  /** Reactions both ways. */
  reactions: boolean;
  /** Edits and deletes both ways. */
  edits: boolean;
  /** Files are copied across (otherwise linked). */
  files: boolean;
  /** Threads on one side become threads on the other. */
  threads: boolean;
  /** "Someone is typing…" both ways. */
  typing: boolean;
  /**
   * Deleting the other side's copy of a message deletes the original too: a
   * Discord person's message removed in Hoffle goes on Discord (needs Manage
   * Messages there), and a Hoffle message removed on Discord goes in Hoffle.
   * People deleting their own messages is covered by `edits`.
   */
  mirrorDeletes: boolean;
  /**
   * Voice rooms paired with a Discord voice channel carry the call too: each
   * Discord person gets their own seat here, and everyone here is heard on
   * Discord through the bot.
   */
  voice: boolean;
}

export const DEFAULT_BRIDGE_SETTINGS: BridgeSettings = {
  reactions: true,
  edits: true,
  files: true,
  threads: true,
  typing: true,
  mirrorDeletes: true,
  voice: true,
};

/** How long a link code works. */
export const LINK_CODE_TTL_MS = 30 * 60_000;
/** The service reports every 30 s; a minute and a half of silence means it is down. */
export const SERVICE_STALE_MS = 90_000;

/**
 * What the bridge's Discord bot needs, as an invite permission integer:
 * view/send/read history, embed links, attach files, add reactions, use
 * external emoji, manage webhooks (to post as each Hoffle person), manage
 * messages (optional deletes), create public threads, send in threads,
 * and connect + speak for voice channels.
 */
export const DISCORD_INVITE_PERMISSIONS = (
  (1n << 6n) | // ADD_REACTIONS
  (1n << 10n) | // VIEW_CHANNEL
  (1n << 11n) | // SEND_MESSAGES
  (1n << 13n) | // MANAGE_MESSAGES
  (1n << 14n) | // EMBED_LINKS
  (1n << 15n) | // ATTACH_FILES
  (1n << 16n) | // READ_MESSAGE_HISTORY
  (1n << 18n) | // USE_EXTERNAL_EMOJIS
  (1n << 20n) | // CONNECT
  (1n << 21n) | // SPEAK
  (1n << 29n) | // MANAGE_WEBHOOKS
  (1n << 35n) | // CREATE_PUBLIC_THREADS
  (1n << 38n) // SEND_MESSAGES_IN_THREADS
).toString();

export function discordInviteUrl(appId: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    scope: "bot applications.commands",
    permissions: DISCORD_INVITE_PERMISSIONS,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export interface BridgeRow {
  server_id: string;
  guild_id: string | null;
  guild_name: string | null;
  guild_icon: string | null;
  link_code: string | null;
  link_expires_at: string | null;
  linked_by: string | null;
  linked_at: string | null;
  settings: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BridgeChannelPair {
  channelId: string;
  discordChannelId: string;
}

export interface ServiceGuild {
  id: string;
  name: string;
  icon?: string | null;
  /** Permissions the bot lacks server-wide, by Discord name. */
  missing?: string[];
  channels: Array<{
    id: string;
    name: string;
    /** 0 text, 5 announcement, 15 forum, 2 voice, 13 stage. */
    type: number;
    parent?: string | null;
    position?: number;
    /** Permissions the bot lacks in this channel. */
    missing?: string[];
  }>;
}

export interface ServiceStatus {
  version?: string;
  startedAt?: string;
  app?: { id: string; name: string; avatarUrl?: string | null } | null;
  discord?: { connected: boolean; error?: string | null };
  hoffle?: { connected: boolean; error?: string | null };
  guilds?: ServiceGuild[];
  /** Per Hoffle server: what last happened. */
  bridges?: Record<string, { lastRelayAt?: string | null; lastError?: string | null; relayed?: number }>;
}

export function parseSettings(raw: string | null | undefined): BridgeSettings {
  let stored: Partial<BridgeSettings> = {};
  try {
    stored = raw ? (JSON.parse(raw) as Partial<BridgeSettings>) : {};
  } catch {
    stored = {};
  }
  const out = { ...DEFAULT_BRIDGE_SETTINGS };
  for (const key of Object.keys(DEFAULT_BRIDGE_SETTINGS) as Array<keyof BridgeSettings>) {
    if (typeof stored[key] === "boolean") out[key] = stored[key] as boolean;
  }
  return out;
}

/** Eight letters in two groups, no 0/O/1/I/L to misread: "K7QM-2XPD". */
export function newLinkCode(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Codes are typed by hand on Discord, so case and dashes are forgiven. */
export function normalizeLinkCode(raw: unknown): string {
  const clean = String(raw ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : "";
}

export async function loadBridge(db: D1Database, serverId: string): Promise<BridgeRow | null> {
  return db.prepare("SELECT * FROM discord_bridges WHERE server_id = ?").bind(serverId).first<BridgeRow>();
}

export async function loadPairs(db: D1Database, serverId: string): Promise<BridgeChannelPair[]> {
  const rows = await db
    .prepare(
      "SELECT channel_id, discord_channel_id FROM discord_bridge_channels WHERE server_id = ? ORDER BY created_at",
    )
    .bind(serverId)
    .all<{ channel_id: string; discord_channel_id: string }>();
  return (rows.results || []).map((row) => ({ channelId: row.channel_id, discordChannelId: row.discord_channel_id }));
}

/** Creates the bridge row (or refreshes an unlinked one) with a fresh link code. */
export async function startBridge(db: D1Database, serverId: string, userId: string): Promise<BridgeRow> {
  const now = new Date();
  const code = newLinkCode();
  const expires = new Date(now.getTime() + LINK_CODE_TTL_MS).toISOString();
  await db
    .prepare(
      `INSERT INTO discord_bridges (server_id, link_code, link_expires_at, settings, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(server_id) DO UPDATE SET link_code = excluded.link_code,
         link_expires_at = excluded.link_expires_at, updated_at = excluded.updated_at`,
    )
    .bind(serverId, code, expires, JSON.stringify(DEFAULT_BRIDGE_SETTINGS), userId, now.toISOString(), now.toISOString())
    .run();
  return (await loadBridge(db, serverId))!;
}

export async function updateSettings(
  db: D1Database,
  serverId: string,
  patch: Partial<Record<keyof BridgeSettings, unknown>>,
): Promise<BridgeSettings> {
  const row = await loadBridge(db, serverId);
  const settings = parseSettings(row?.settings);
  for (const key of Object.keys(DEFAULT_BRIDGE_SETTINGS) as Array<keyof BridgeSettings>) {
    if (typeof patch[key] === "boolean") settings[key] = patch[key] as boolean;
  }
  await db
    .prepare("UPDATE discord_bridges SET settings = ?, updated_at = ? WHERE server_id = ?")
    .bind(JSON.stringify(settings), new Date().toISOString(), serverId)
    .run();
  return settings;
}

export class BridgeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * Replaces the server's channel pairs. Each Hoffle channel must be a text
 * channel of this server, each Discord channel one the service reported in the
 * linked Discord server, and neither side may appear twice.
 */
export async function setPairs(
  db: D1Database,
  serverId: string,
  pairs: BridgeChannelPair[],
  guild: ServiceGuild | null,
): Promise<BridgeChannelPair[]> {
  const bridge = await loadBridge(db, serverId);
  if (!bridge?.guild_id) throw new BridgeError("Link a Discord server first.");
  const channels = await db
    .prepare(
      `SELECT id, kind FROM channels WHERE server_id = ? AND kind IN (${postableChannelKindsSql()}) AND kind != 'dm'`,
    )
    .bind(serverId)
    .all<{ id: string; kind: string }>();
  const ours = new Map((channels.results || []).map((row) => [row.id, row.kind]));
  const theirs = guild ? new Map(guild.channels.map((channel) => [channel.id, channel.type])) : null;

  const seenHoffle = new Set<string>();
  const seenDiscord = new Set<string>();
  const clean: BridgeChannelPair[] = [];
  for (const pair of pairs.slice(0, 100)) {
    const channelId = String(pair.channelId || "");
    const discordChannelId = String(pair.discordChannelId || "");
    if (!channelId || !discordChannelId) continue;
    if (!ours.has(channelId)) throw new BridgeError("One of those Hoffle channels is not a text channel here.");
    if (!/^\d{5,25}$/.test(discordChannelId) || (theirs && !theirs.has(discordChannelId))) {
      throw new BridgeError("One of those Discord channels is not in the linked Discord server.");
    }
    // A Discord voice channel only pairs with a Hoffle voice room (call and chat).
    if (theirs && DISCORD_VOICE_TYPES.has(theirs.get(discordChannelId) ?? -1) && !isVoiceKind(ours.get(channelId))) {
      throw new BridgeError("A Discord voice channel can only be paired with a voice room here.");
    }
    if (seenHoffle.has(channelId) || seenDiscord.has(discordChannelId)) {
      throw new BridgeError("Each channel can be paired once.");
    }
    seenHoffle.add(channelId);
    seenDiscord.add(discordChannelId);
    clean.push({ channelId, discordChannelId });
  }

  // A Discord channel already mirrored by another Hoffle server stays there.
  for (const pair of clean) {
    const taken = await db
      .prepare("SELECT server_id FROM discord_bridge_channels WHERE discord_channel_id = ? AND server_id != ?")
      .bind(pair.discordChannelId, serverId)
      .first<{ server_id: string }>();
    if (taken) throw new BridgeError("That Discord channel is already bridged to another Hoffle server.");
  }

  const now = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM discord_bridge_channels WHERE server_id = ?").bind(serverId),
    ...clean.map((pair) =>
      db
        .prepare(
          "INSERT INTO discord_bridge_channels (server_id, channel_id, discord_channel_id, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(serverId, pair.channelId, pair.discordChannelId, now),
    ),
    db.prepare("UPDATE discord_bridges SET updated_at = ? WHERE server_id = ?").bind(now, serverId),
  ]);
  return clean;
}

/** Discord's voice (2) and stage (13) channel types. */
export const DISCORD_VOICE_TYPES = new Set([2, 13]);

function isVoiceKind(kind: string | undefined): boolean {
  return kind === "voice" || kind === "stage";
}

/**
 * The Hoffle voice rooms whose call crosses to Discord right now: paired with
 * a Discord voice or stage channel (as the service last reported it), on a
 * linked bridge with voice switched on. The hub seats Discord people only here.
 */
export async function bridgedVoiceRooms(db: D1Database): Promise<Set<string>> {
  const rows = await db
    .prepare(
      `SELECT p.channel_id, p.discord_channel_id, b.guild_id, b.settings
         FROM discord_bridge_channels p
         JOIN discord_bridges b ON b.server_id = p.server_id
         JOIN channels c ON c.id = p.channel_id
        WHERE b.guild_id IS NOT NULL AND c.kind IN ('voice', 'stage')`,
    )
    .all<{ channel_id: string; discord_channel_id: string; guild_id: string; settings: string }>();
  const list = (rows.results || []).filter((row) => parseSettings(row.settings).voice);
  if (!list.length) return new Set();
  const { status } = await loadServiceStatus(db);
  const types = new Map<string, number>();
  for (const guild of status.guilds || []) for (const channel of guild.channels) types.set(channel.id, channel.type);
  return new Set(
    list.filter((row) => DISCORD_VOICE_TYPES.has(types.get(row.discord_channel_id) ?? -1)).map((row) => row.channel_id),
  );
}

/** Forgets the bridge: the Discord link, every pair, the settings. */
export async function removeBridge(db: D1Database, serverId: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM discord_bridge_channels WHERE server_id = ?").bind(serverId),
    db.prepare("DELETE FROM discord_bridges WHERE server_id = ?").bind(serverId),
  ]);
}

/**
 * `/hoffle link <code>` from Discord, relayed by the service. The person was
 * checked for Manage Server on that Discord server before this is called.
 */
export async function linkWithCode(
  db: D1Database,
  rawCode: unknown,
  guild: { id: string; name: string; icon?: string | null },
  by: { id: string; name: string },
): Promise<{ serverId: string; serverName: string }> {
  const code = normalizeLinkCode(rawCode);
  if (!code) throw new BridgeError("That code doesn't look right. It's 8 letters and numbers, like K7QM-2XPD.");
  if (!/^\d{5,25}$/.test(guild.id)) throw new BridgeError("Unknown Discord server.");
  const row = await db
    .prepare("SELECT * FROM discord_bridges WHERE link_code = ?")
    .bind(code)
    .first<BridgeRow>();
  if (!row || !row.link_expires_at || Date.parse(row.link_expires_at) < Date.now()) {
    throw new BridgeError("That code has expired or was never made. Make a new one in Hoffle: Server Settings → Integrations → Discord Bridge.");
  }
  const other = await db
    .prepare("SELECT server_id FROM discord_bridges WHERE guild_id = ? AND server_id != ?")
    .bind(guild.id, row.server_id)
    .first<{ server_id: string }>();
  if (other) {
    throw new BridgeError("This Discord server is already bridged to another Hoffle server. Run /hoffle unlink first.");
  }
  const now = new Date().toISOString();
  // A different Discord server than before: the old channel pairs mean nothing now.
  const statements = [
    db
      .prepare(
        `UPDATE discord_bridges SET guild_id = ?, guild_name = ?, guild_icon = ?, link_code = NULL,
           link_expires_at = NULL, linked_by = ?, linked_at = ?, updated_at = ? WHERE server_id = ?`,
      )
      .bind(guild.id, guild.name.slice(0, 100), guild.icon ?? null, `discord:${by.id}:${by.name.slice(0, 80)}`, now, now, row.server_id),
  ];
  if (row.guild_id && row.guild_id !== guild.id) {
    statements.unshift(db.prepare("DELETE FROM discord_bridge_channels WHERE server_id = ?").bind(row.server_id));
  }
  await db.batch(statements);
  const server = await db
    .prepare("SELECT name FROM servers WHERE id = ?")
    .bind(row.server_id)
    .first<{ name: string }>();
  return { serverId: row.server_id, serverName: server?.name || "your Hoffle server" };
}

/** `/hoffle unlink` from Discord. Keeps the Hoffle row so the admin can relink. */
export async function unlinkGuild(db: D1Database, guildId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT server_id FROM discord_bridges WHERE guild_id = ?")
    .bind(guildId)
    .first<{ server_id: string }>();
  if (!row) return null;
  await db.batch([
    db.prepare("DELETE FROM discord_bridge_channels WHERE server_id = ?").bind(row.server_id),
    db
      .prepare(
        "UPDATE discord_bridges SET guild_id = NULL, guild_name = NULL, guild_icon = NULL, linked_at = NULL, updated_at = ? WHERE server_id = ?",
      )
      .bind(new Date().toISOString(), row.server_id),
  ]);
  return row.server_id;
}

export async function loadServiceStatus(
  db: D1Database,
): Promise<{ status: ServiceStatus; updatedAt: string | null; online: boolean }> {
  const row = await db
    .prepare("SELECT status, updated_at FROM discord_bridge_service WHERE id = 'service'")
    .first<{ status: string; updated_at: string }>();
  if (!row) return { status: {}, updatedAt: null, online: false };
  let status: ServiceStatus = {};
  try {
    status = JSON.parse(row.status) as ServiceStatus;
  } catch {
    status = {};
  }
  return {
    status,
    updatedAt: row.updated_at,
    online: Date.now() - Date.parse(row.updated_at) < SERVICE_STALE_MS,
  };
}

/** Keeps what the service reports, trimmed to sane sizes. */
export async function saveServiceStatus(db: D1Database, raw: unknown): Promise<void> {
  const input = (raw && typeof raw === "object" ? raw : {}) as ServiceStatus;
  const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : undefined);
  // Shown as pictures in Settings: only ever an https address.
  const picture = (value: unknown) => {
    const url = str(value, 300);
    return url && /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : null;
  };
  const ids = (value: unknown) => (Array.isArray(value) ? value.filter((v) => typeof v === "string").slice(0, 20).map((v) => v.slice(0, 40)) : undefined);
  const guilds: ServiceGuild[] = (Array.isArray(input.guilds) ? input.guilds : []).slice(0, 200).flatMap((guild) => {
    if (!guild || typeof guild.id !== "string" || !/^\d{5,25}$/.test(guild.id)) return [];
    return [
      {
        id: guild.id,
        name: str(guild.name, 100) || "Discord server",
        icon: picture(guild.icon),
        missing: ids(guild.missing),
        channels: (Array.isArray(guild.channels) ? guild.channels : []).slice(0, 500).flatMap((channel) =>
          channel && typeof channel.id === "string" && /^\d{5,25}$/.test(channel.id)
            ? [
                {
                  id: channel.id,
                  name: str(channel.name, 100) || "channel",
                  type: Number(channel.type) || 0,
                  parent: str(channel.parent, 100) ?? null,
                  position: Number(channel.position) || 0,
                  missing: ids(channel.missing),
                },
              ]
            : [],
        ),
      },
    ];
  });
  const bridges: ServiceStatus["bridges"] = {};
  if (input.bridges && typeof input.bridges === "object") {
    for (const [serverId, value] of Object.entries(input.bridges).slice(0, 500)) {
      if (!value || typeof value !== "object") continue;
      bridges[serverId.slice(0, 64)] = {
        lastRelayAt: str(value.lastRelayAt, 40) ?? null,
        lastError: str(value.lastError, 300) ?? null,
        relayed: Number(value.relayed) || 0,
      };
    }
  }
  const status: ServiceStatus = {
    version: str(input.version, 40),
    startedAt: str(input.startedAt, 40),
    app:
      input.app && typeof input.app.id === "string" && /^\d{5,25}$/.test(input.app.id)
        ? { id: input.app.id, name: str(input.app.name, 100) || "Discord bot", avatarUrl: picture(input.app.avatarUrl) }
        : null,
    discord: { connected: Boolean(input.discord?.connected), error: str(input.discord?.error, 300) ?? null },
    hoffle: { connected: Boolean(input.hoffle?.connected), error: str(input.hoffle?.error, 300) ?? null },
    guilds,
    bridges,
  };
  await db
    .prepare(
      `INSERT INTO discord_bridge_service (id, status, updated_at) VALUES ('service', ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
    )
    .bind(JSON.stringify(status), new Date().toISOString())
    .run();
}

export interface ConfigBridge {
  serverId: string;
  serverName: string;
  guildSnowflake: string;
  discordGuildId: string;
  settings: BridgeSettings;
  channels: Array<{
    hoffleChannelId: string;
    hoffleChannelSnowflake: string;
    name: string;
    discordChannelId: string;
    private: boolean;
    /** A Hoffle voice or stage room: if its partner is a Discord voice channel, the call crosses too. */
    voice: boolean;
  }>;
}

/** Everything the service needs to run every linked bridge. */
export async function bridgeConfig(db: D1Database): Promise<{ version: string; bridges: ConfigBridge[] }> {
  const rows = await db
    .prepare(
      `SELECT b.server_id, b.guild_id, b.settings, b.updated_at, s.name AS server_name, s.created_at AS server_created_at
         FROM discord_bridges b JOIN servers s ON s.id = b.server_id
        WHERE b.guild_id IS NOT NULL`,
    )
    .all<{
      server_id: string;
      guild_id: string;
      settings: string;
      updated_at: string;
      server_name: string;
      server_created_at: string;
    }>();
  const bridges: ConfigBridge[] = [];
  let version = "";
  for (const row of rows.results || []) {
    const pairs = await db
      .prepare(
        `SELECT p.channel_id, p.discord_channel_id, c.name, c.kind, c.created_at
           FROM discord_bridge_channels p JOIN channels c ON c.id = p.channel_id
          WHERE p.server_id = ?`,
      )
      .bind(row.server_id)
      .all<{ channel_id: string; discord_channel_id: string; name: string; kind: string; created_at: string }>();
    const list = pairs.results || [];
    const overwrites = await loadOverwrites(db, list.map((pair) => pair.channel_id));
    bridges.push({
      serverId: row.server_id,
      serverName: row.server_name,
      guildSnowflake: await snowflakeFor("guild", row.server_id, row.server_created_at),
      discordGuildId: row.guild_id,
      settings: parseSettings(row.settings),
      channels: await Promise.all(
        list.map(async (pair) => ({
          hoffleChannelId: pair.channel_id,
          hoffleChannelSnowflake: await snowflakeFor("channel", pair.channel_id, pair.created_at),
          name: pair.name,
          discordChannelId: pair.discord_channel_id,
          private: isPrivateChannel(overwrites.get(pair.channel_id) || []),
          voice: isVoiceKind(pair.kind),
        })),
      ),
    });
    version += `${row.server_id}@${row.updated_at};`;
  }
  return { version, bridges };
}
