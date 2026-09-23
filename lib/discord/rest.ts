/**
 * The Discord-compatible REST API, served under /api/v10 (and /api/v9).
 *
 * This is routed from the worker rather than through file-based routes because
 * Discord's paths are deeply parameterised — /channels/{id}/messages/{id}/
 * reactions/{emoji}/{user} — and matching them as segment patterns in one place
 * keeps the shape of the API visible and the error bodies consistent.
 *
 * Every response body is Discord's, including its error envelope
 * ({ message, code }), because clients branch on those codes: discord.js maps
 * 10003 to UnknownChannel and 50013 to MissingPermissions, and a bot's retry
 * logic depends on telling those apart.
 */
import { authenticateBot, botById, type BotIdentity } from "../bot-auth";
import { ensureSchema, DM_SERVER_ID } from "../schema";
import { bindings, type StoredMessage } from "../storage";
import { publishMessage, publishMessageEvent } from "../hub-client";
import { dispatchMessage, dispatchMessageDelete } from "./dispatch";
import {
  botCanSeeServer,
  botServers,
  channelWithGuild,
  loadGuild,
  loadMentionedUsers,
  loadReactions,
  loadUser,
} from "./guild-data";
import {
  serializeBotUser,
  serializeChannel,
  serializeMessage,
  serializeRole,
  serializeUser,
  everyoneRole,
  intToColor,
  colorToInt,
  type HoffleChannelRow,
  type HoffleRoleRow,
} from "./serialize";
import { nativeFor, snowflakeFor } from "./snowflake";
import { SUPPORTED_API_VERSIONS } from "./protocol";
import { handleCommandRoutes, handleInteractionRoutes } from "./interactions";
import { botPayload, mergeBotPayload, publishBotEdit } from "./bot-messages";
import { snapshotBeforeEdit } from "../message-edits";

/** Discord JSON error codes, for the subset of failures we can produce. */
export const ErrorCode = {
  GeneralError: 0,
  UnknownAccount: 10001,
  UnknownChannel: 10003,
  UnknownGuild: 10004,
  UnknownMember: 10007,
  UnknownMessage: 10008,
  UnknownRole: 10011,
  UnknownUser: 10013,
  UnknownEmoji: 10014,
  UnknownBan: 10026,
  UnknownInteraction: 10062,
  Unauthorized: 40001,
  MissingAccess: 50001,
  InvalidFormBody: 50035,
  MissingPermissions: 50013,
  CannotSendEmptyMessage: 50006,
} as const;

export function discordError(
  status: number,
  code: number,
  message: string,
  errors?: unknown,
): Response {
  return Response.json({ message, code, ...(errors ? { errors } : {}) }, { status });
}

const json = (data: unknown, status = 200) => Response.json(data, { status });

/**
 * Discord returns rate limit headers on every response and libraries read them
 * to pace themselves. Hoffle does not rate limit bots, so these advertise a
 * bucket that never runs out rather than leaving clients to guess.
 */
function withRateLimitHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("x-ratelimit-limit", "1000");
  headers.set("x-ratelimit-remaining", "999");
  headers.set("x-ratelimit-reset", String(Math.ceil(Date.now() / 1000) + 1));
  headers.set("x-ratelimit-reset-after", "1");
  headers.set("x-ratelimit-bucket", "hoffle");
  headers.set("via", "1.1 hoffle");
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Resolves the bot behind an interaction token.
 *
 * /interactions/{id}/{token}/callback and /webhooks/{appId}/{token}/... both
 * put the token in the second path segment, so one lookup serves both.
 */
async function botForInteractionToken(
  db: D1Database,
  segments: string[],
): Promise<BotIdentity | null> {
  const token = segments[2];
  if (!token) return null;
  const row = await db
    .prepare(
      "SELECT bot_id, expires_at FROM discord_interactions WHERE token = ? LIMIT 1",
    )
    .bind(token)
    .first<{ bot_id: string; expires_at: string }>();
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) return null;
  return botById(db, row.bot_id);
}

export interface RestContext {
  bot: BotIdentity;
  db: D1Database;
  request: Request;
  url: URL;
  /** Absolute origin, for attachment URLs clients must be able to fetch. */
  origin: string;
  basePath: string;
}

/**
 * Entry point from the worker. `segments` are the path parts after the version,
 * so /api/v10/channels/123/messages arrives as ["channels", "123", "messages"].
 */
export async function handleDiscordRest(
  request: Request,
  version: string,
  segments: string[],
  basePath: string,
): Promise<Response> {
  if (!SUPPORTED_API_VERSIONS.has(version)) {
    return discordError(400, ErrorCode.GeneralError, "Unsupported API version");
  }

  const url = new URL(request.url);
  const origin = url.origin;

  // The gateway endpoints are the one thing an unauthenticated client may ask
  // for; everything else needs a token.
  if (segments[0] === "gateway") {
    return withRateLimitHeaders(gatewayInfo(request, segments, origin, basePath));
  }

  const db = bindings().DB;
  if (!db) {
    return discordError(503, ErrorCode.GeneralError, "Database not connected");
  }
  await ensureSchema(db);

  // Interaction callbacks and followups carry no Authorization header: the
  // interaction token in the path is the credential, and libraries send these
  // with auth explicitly disabled. The identity comes from the stored
  // interaction, which also scopes the call to that one channel and bot.
  const bot =
    segments[0] === "interactions" || segments[0] === "webhooks"
      ? await botForInteractionToken(db, segments)
      : await authenticateBot(request);

  if (!bot) {
    return withRateLimitHeaders(
      discordError(401, ErrorCode.Unauthorized, "401: Unauthorized"),
    );
  }

  const context: RestContext = { bot, db, request, url, origin, basePath };

  try {
    const response = await route(context, segments);
    return withRateLimitHeaders(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    return withRateLimitHeaders(
      discordError(500, ErrorCode.GeneralError, message),
    );
  }
}

async function route(context: RestContext, segments: string[]): Promise<Response> {
  const [head, ...rest] = segments;

  switch (head) {
    case "users":
      return userRoutes(context, rest);
    case "guilds":
      return guildRoutes(context, rest);
    case "channels":
      return channelRoutes(context, rest);
    case "applications":
      return handleCommandRoutes(context, rest);
    case "interactions":
    case "webhooks":
      return handleInteractionRoutes(context, head, rest);
    case "oauth2":
      return oauthRoutes(context, rest);
    case "voice":
      // Regions are harmless to answer and some libraries fetch them on boot.
      return json([]);
    default:
      return discordError(404, ErrorCode.GeneralError, "404: Not Found");
  }
}

// ---------------------------------------------------------------------------
// Gateway discovery
// ---------------------------------------------------------------------------

function gatewayInfo(
  request: Request,
  segments: string[],
  origin: string,
  basePath: string,
): Response {
  // Clients take this URL literally, so the scheme has to match how they
  // reached us: a bot talking https must be handed wss or the socket is blocked.
  const wsOrigin = origin.replace(/^http/, "ws");
  const gatewayUrl = `${wsOrigin}${basePath}/api/gateway`;

  if (segments[1] === "bot") {
    return json({
      url: gatewayUrl,
      shards: 1,
      session_start_limit: {
        total: 1000,
        remaining: 999,
        reset_after: 86_400_000,
        max_concurrency: 1,
      },
    });
  }
  return json({ url: gatewayUrl });
}

async function oauthRoutes(context: RestContext, segments: string[]): Promise<Response> {
  // discord.js fetches /oauth2/applications/@me to learn its application id.
  if (segments[0] === "applications" && segments[1] === "@me") {
    const applicationId = await snowflakeFor("application", `bot:${context.bot.id}`);
    const user = await serializeBotUser(context.bot);
    return json({
      id: applicationId,
      name: context.bot.name,
      icon: null,
      description: "",
      bot_public: false,
      bot_require_code_grant: false,
      verify_key: "0".repeat(64),
      owner: user,
      flags: 0,
      team: null,
    });
  }
  return discordError(404, ErrorCode.GeneralError, "404: Not Found");
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function userRoutes(context: RestContext, segments: string[]): Promise<Response> {
  const [userId, sub] = segments;

  if (userId === "@me" && !sub) {
    if (context.request.method === "PATCH") {
      // Bots edit their own username here. Accepting and echoing keeps startup
      // flows working; Hoffle's bot name is managed in server settings.
      return json(await serializeBotUser(context.bot));
    }
    return json(await serializeBotUser(context.bot));
  }

  if (userId === "@me" && sub === "guilds") {
    const servers = await botServers(context.db, context.bot);
    return json(
      await Promise.all(
        servers.map(async (server) => ({
          id: await snowflakeFor("guild", server.id, server.created_at),
          name: server.name,
          icon: null,
          owner: false,
          permissions: "8",
          features: [],
        })),
      ),
    );
  }

  if (userId === "@me" && sub === "channels") {
    // Opening a DM. Hoffle DMs are between two accounts, and a bot has no
    // account, so there is nothing truthful to return here.
    return discordError(
      400,
      ErrorCode.GeneralError,
      "Bots cannot open direct messages on Hoffle",
    );
  }

  if (userId && !sub) {
    const nativeId = await nativeFor("user", userId);
    const user = nativeId ? await loadUser(context.db, nativeId) : null;
    if (!user) return discordError(404, ErrorCode.UnknownUser, "Unknown User");
    return json(await serializeUser(user));
  }

  return discordError(404, ErrorCode.GeneralError, "404: Not Found");
}

// ---------------------------------------------------------------------------
// Guilds
// ---------------------------------------------------------------------------

async function resolveGuild(
  context: RestContext,
  guildId: string,
): Promise<{ id: string; row: Record<string, unknown> } | Response> {
  const nativeId = await nativeFor("guild", guildId);
  if (!nativeId) return discordError(404, ErrorCode.UnknownGuild, "Unknown Guild");
  if (!botCanSeeServer(context.bot, nativeId)) {
    return discordError(403, ErrorCode.MissingAccess, "Missing Access");
  }
  const row = await context.db
    .prepare(
      "SELECT id, name, icon, color, created_by, created_at, banner_url FROM servers WHERE id = ?",
    )
    .bind(nativeId)
    .first<Record<string, unknown>>();
  if (!row) return discordError(404, ErrorCode.UnknownGuild, "Unknown Guild");
  return { id: nativeId, row };
}

async function guildRoutes(context: RestContext, segments: string[]): Promise<Response> {
  const [guildId, sub, subId, subSub, subSubId] = segments;
  if (!guildId) return discordError(404, ErrorCode.GeneralError, "404: Not Found");

  const resolved = await resolveGuild(context, guildId);
  if (resolved instanceof Response) return resolved;
  const server = resolved.row as never;
  const nativeGuildId = resolved.id;
  const guildSnowflake = guildId;

  // GET /guilds/{id}
  if (!sub) {
    const withCounts = context.url.searchParams.get("with_counts") === "true";
    const guild = await loadGuild(context.db, server, {
      includeMembers: withCounts,
    });
    // A plain guild fetch must not carry GUILD_CREATE-only collections, or
    // discord.js caches a members list it believes is complete.
    delete guild.members;
    delete guild.presences;
    delete guild.voice_states;
    delete guild.channels;
    delete guild.threads;
    delete guild.joined_at;
    delete guild.large;
    delete guild.member_count;
    return json(guild);
  }

  if (sub === "channels") {
    const rows = await context.db
      .prepare(
        `SELECT id, server_id, name, kind, topic, position, category_id, created_at
         FROM channels WHERE server_id = ? ORDER BY position, created_at`,
      )
      .bind(nativeGuildId)
      .all<HoffleChannelRow>();
    return json(
      await Promise.all(
        (rows.results || []).map((channel) => serializeChannel(channel, guildSnowflake)),
      ),
    );
  }

  if (sub === "roles") {
    if (context.request.method === "GET") {
      const rows = await context.db
        .prepare(
          `SELECT id, server_id, name, color, permissions, position, created_at
           FROM roles WHERE server_id = ? ORDER BY position`,
        )
        .bind(nativeGuildId)
        .all<HoffleRoleRow>();
      return json([
        everyoneRole(guildSnowflake),
        ...(await Promise.all((rows.results || []).map((role) => serializeRole(role)))),
      ]);
    }
    if (context.request.method === "POST") {
      const body = (await context.request.json().catch(() => ({}))) as {
        name?: string;
        color?: number;
        permissions?: string | number;
        position?: number;
      };
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      // Hoffle's permissions column is a 32-bit int; Discord bitfields are
      // 64-bit strings, so the high bits are dropped rather than overflowed.
      const permissions = Number(BigInt(body.permissions ?? 0) & 0x7fffffffn);
      await context.db
        .prepare(
          `INSERT INTO roles (id, server_id, name, color, permissions, position, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          nativeGuildId,
          (body.name || "new role").slice(0, 80),
          intToColor(body.color),
          permissions,
          body.position ?? 0,
          now,
        )
        .run();
      const role = await serializeRole({
        id,
        server_id: nativeGuildId,
        name: body.name || "new role",
        color: intToColor(body.color),
        permissions,
        position: body.position ?? 0,
        created_at: now,
      });
      return json(role, 201);
    }
  }

  // /guilds/{id}/roles/{roleId}
  if (sub === "roles" && subId) {
    const nativeRoleId = await nativeFor("role", subId);
    if (!nativeRoleId) return discordError(404, ErrorCode.UnknownRole, "Unknown Role");

    if (context.request.method === "DELETE") {
      await context.db
        .prepare("DELETE FROM roles WHERE id = ? AND server_id = ?")
        .bind(nativeRoleId, nativeGuildId)
        .run();
      await context.db
        .prepare("DELETE FROM member_roles WHERE role_id = ?")
        .bind(nativeRoleId)
        .run();
      return new Response(null, { status: 204 });
    }

    if (context.request.method === "PATCH") {
      const body = (await context.request.json().catch(() => ({}))) as {
        name?: string;
        color?: number;
        permissions?: string | number;
        position?: number;
      };
      const existing = await context.db
        .prepare(
          "SELECT id, server_id, name, color, permissions, position, created_at FROM roles WHERE id = ?",
        )
        .bind(nativeRoleId)
        .first<HoffleRoleRow>();
      if (!existing) return discordError(404, ErrorCode.UnknownRole, "Unknown Role");

      const updated: HoffleRoleRow = {
        ...existing,
        name: body.name ?? existing.name,
        color: body.color !== undefined ? intToColor(body.color) : existing.color,
        permissions:
          body.permissions !== undefined
            ? Number(BigInt(body.permissions) & 0x7fffffffn)
            : existing.permissions,
        position: body.position ?? existing.position,
      };
      await context.db
        .prepare(
          "UPDATE roles SET name = ?, color = ?, permissions = ?, position = ? WHERE id = ?",
        )
        .bind(updated.name, updated.color, updated.permissions, updated.position, nativeRoleId)
        .run();
      return json(await serializeRole(updated));
    }
  }

  if (sub === "members") {
    return memberRoutes(context, nativeGuildId, guildSnowflake, [subId, subSub, subSubId]);
  }

  if (sub === "bans") {
    return banRoutes(context, nativeGuildId, subId);
  }

  if (sub === "emojis") {
    const rows = await context.db
      .prepare("SELECT id, name, created_at FROM emojis WHERE server_id = ? ORDER BY name")
      .bind(nativeGuildId)
      .all<{ id: string; name: string; created_at: string }>();
    return json(
      await Promise.all(
        (rows.results || []).map(async (emoji) => ({
          id: await snowflakeFor("emoji", emoji.id, emoji.created_at),
          name: emoji.name,
          roles: [],
          user: null,
          require_colons: true,
          managed: false,
          animated: false,
          available: true,
        })),
      ),
    );
  }

  if (sub === "commands" || sub === "application-commands") {
    return handleCommandRoutes(context, ["@me", "guilds", guildSnowflake, "commands", subId]);
  }

  if (sub === "preview" || sub === "widget.json") {
    return discordError(404, ErrorCode.GeneralError, "404: Not Found");
  }

  return discordError(404, ErrorCode.GeneralError, "404: Not Found");
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

async function memberRoutes(
  context: RestContext,
  nativeGuildId: string,
  guildSnowflake: string,
  [memberId, sub, subId]: Array<string | undefined>,
): Promise<Response> {
  const { db, request } = context;

  // GET /guilds/{id}/members — the member list, paginated Discord-style.
  if (!memberId) {
    const limit = Math.min(
      Math.max(Number(context.url.searchParams.get("limit") || 100), 1),
      1000,
    );
    const guild = await loadGuild(
      db,
      (await db
        .prepare("SELECT id, name, icon, color, created_by, created_at FROM servers WHERE id = ?")
        .bind(nativeGuildId)
        .first()) as never,
      { includeMembers: true },
    );
    const members = ((guild.members as Record<string, unknown>[]) || []).slice(0, limit);
    return json(members);
  }

  if (memberId === "search") {
    const query = (context.url.searchParams.get("query") || "").toLowerCase();
    const guild = await loadGuild(
      db,
      (await db
        .prepare("SELECT id, name, icon, color, created_by, created_at FROM servers WHERE id = ?")
        .bind(nativeGuildId)
        .first()) as never,
      { includeMembers: true },
    );
    const members = ((guild.members as Record<string, unknown>[]) || []).filter((member) => {
      const user = member.user as { username?: string; global_name?: string } | undefined;
      return (
        user?.username?.toLowerCase().includes(query) ||
        user?.global_name?.toLowerCase().includes(query)
      );
    });
    return json(members);
  }

  const nativeUserId = await nativeFor("user", memberId);
  if (!nativeUserId) return discordError(404, ErrorCode.UnknownMember, "Unknown Member");

  // PUT/DELETE /guilds/{id}/members/{uid}/roles/{rid}
  if (sub === "roles" && subId) {
    const nativeRoleId = await nativeFor("role", subId);
    if (!nativeRoleId) return discordError(404, ErrorCode.UnknownRole, "Unknown Role");

    if (request.method === "PUT") {
      await db
        .prepare(
          "INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)",
        )
        .bind(nativeGuildId, nativeUserId, nativeRoleId)
        .run();
      return new Response(null, { status: 204 });
    }
    if (request.method === "DELETE") {
      await db
        .prepare(
          "DELETE FROM member_roles WHERE server_id = ? AND user_id = ? AND role_id = ?",
        )
        .bind(nativeGuildId, nativeUserId, nativeRoleId)
        .run();
      return new Response(null, { status: 204 });
    }
  }

  const membership = await db
    .prepare(
      "SELECT joined_at FROM server_members WHERE server_id = ? AND user_id = ?",
    )
    .bind(nativeGuildId, nativeUserId)
    .first<{ joined_at: string }>();
  if (!membership) return discordError(404, ErrorCode.UnknownMember, "Unknown Member");

  // DELETE /guilds/{id}/members/{uid} — a kick.
  if (request.method === "DELETE") {
    await db
      .prepare("DELETE FROM server_members WHERE server_id = ? AND user_id = ?")
      .bind(nativeGuildId, nativeUserId)
      .run();
    await db
      .prepare("DELETE FROM member_roles WHERE server_id = ? AND user_id = ?")
      .bind(nativeGuildId, nativeUserId)
      .run();
    const user = await loadUser(db, nativeUserId);
    if (user) {
      const { dispatchToBots } = await import("./dispatch");
      await dispatchToBots(
        "GUILD_MEMBER_REMOVE",
        { guild_id: guildSnowflake, user: await serializeUser(user) },
        { serverId: nativeGuildId },
      );
    }
    return new Response(null, { status: 204 });
  }

  const user = await loadUser(db, nativeUserId);
  if (!user) return discordError(404, ErrorCode.UnknownMember, "Unknown Member");

  const roleRows = await db
    .prepare("SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?")
    .bind(nativeGuildId, nativeUserId)
    .all<{ role_id: string }>();

  const { serializeMember } = await import("./serialize");
  return json(
    await serializeMember(user, {
      joined_at: membership.joined_at,
      roles: (roleRows.results || []).map((r) => r.role_id),
    }),
  );
}

// ---------------------------------------------------------------------------
// Bans
// ---------------------------------------------------------------------------

async function banRoutes(
  context: RestContext,
  nativeGuildId: string,
  userId: string | undefined,
): Promise<Response> {
  const { db, request } = context;

  if (!userId) {
    const rows = await db
      .prepare("SELECT user_id FROM bans WHERE server_id = ?")
      .bind(nativeGuildId)
      .all<{ user_id: string }>();
    return json(
      await Promise.all(
        (rows.results || []).map(async (row) => {
          const user = await loadUser(db, row.user_id);
          return {
            reason: null,
            user: user ? await serializeUser(user) : { id: row.user_id },
          };
        }),
      ),
    );
  }

  const nativeUserId = await nativeFor("user", userId);
  if (!nativeUserId) return discordError(404, ErrorCode.UnknownUser, "Unknown User");

  if (request.method === "PUT") {
    const now = new Date().toISOString();
    await db
      .prepare(
        "INSERT OR REPLACE INTO bans (server_id, user_id, banned_by, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(nativeGuildId, nativeUserId, null, now)
      .run();
    await db
      .prepare("DELETE FROM server_members WHERE server_id = ? AND user_id = ?")
      .bind(nativeGuildId, nativeUserId)
      .run();
    const user = await loadUser(db, nativeUserId);
    if (user) {
      const { dispatchToBots } = await import("./dispatch");
      const guildSnowflake = await snowflakeFor("guild", nativeGuildId);
      await dispatchToBots(
        "GUILD_BAN_ADD",
        { guild_id: guildSnowflake, user: await serializeUser(user) },
        { serverId: nativeGuildId },
      );
    }
    return new Response(null, { status: 204 });
  }

  if (request.method === "DELETE") {
    await db
      .prepare("DELETE FROM bans WHERE server_id = ? AND user_id = ?")
      .bind(nativeGuildId, nativeUserId)
      .run();
    return new Response(null, { status: 204 });
  }

  const ban = await db
    .prepare("SELECT user_id FROM bans WHERE server_id = ? AND user_id = ?")
    .bind(nativeGuildId, nativeUserId)
    .first<{ user_id: string }>();
  if (!ban) return discordError(404, ErrorCode.UnknownBan, "Unknown Ban");
  const user = await loadUser(db, nativeUserId);
  return json({ reason: null, user: user ? await serializeUser(user) : { id: userId } });
}

// ---------------------------------------------------------------------------
// Channels and messages
// ---------------------------------------------------------------------------

export async function resolveChannel(
  context: RestContext,
  channelId: string,
): Promise<
  | { channel: HoffleChannelRow; guildSnowflake: string | null; isDm: boolean }
  | Response
> {
  const nativeId = await nativeFor("channel", channelId);
  if (!nativeId) return discordError(404, ErrorCode.UnknownChannel, "Unknown Channel");

  const located = await channelWithGuild(context.db, nativeId);
  if (!located) return discordError(404, ErrorCode.UnknownChannel, "Unknown Channel");

  if (!botCanSeeServer(context.bot, located.channel.server_id)) {
    return discordError(403, ErrorCode.MissingAccess, "Missing Access");
  }

  const guildSnowflake = located.server
    ? await snowflakeFor("guild", located.server.id, located.server.created_at)
    : null;
  return { channel: located.channel, guildSnowflake, isDm: located.isDm };
}

async function channelRoutes(
  context: RestContext,
  segments: string[],
): Promise<Response> {
  const [channelId, sub, messageId, subSub, emoji, reactionUser] = segments;
  if (!channelId) return discordError(404, ErrorCode.GeneralError, "404: Not Found");

  const resolved = await resolveChannel(context, channelId);
  if (resolved instanceof Response) return resolved;
  const { channel, guildSnowflake } = resolved;

  if (!sub) {
    if (context.request.method === "GET") {
      return json(await serializeChannel(channel, guildSnowflake || ""));
    }
    if (context.request.method === "PATCH") {
      const body = (await context.request.json().catch(() => ({}))) as {
        name?: string;
        topic?: string;
        position?: number;
      };
      await context.db
        .prepare("UPDATE channels SET name = ?, topic = ?, position = ? WHERE id = ?")
        .bind(
          body.name ?? channel.name,
          body.topic ?? channel.topic ?? "",
          body.position ?? channel.position ?? 0,
          channel.id,
        )
        .run();
      return json(
        await serializeChannel(
          {
            ...channel,
            name: body.name ?? channel.name,
            topic: body.topic ?? channel.topic,
            position: body.position ?? channel.position,
          },
          guildSnowflake || "",
        ),
      );
    }
  }

  if (sub === "typing") {
    // Bots "type" to signal a slow command. Hoffle shows typing from accounts
    // only, so this is accepted and dropped rather than faked as a user.
    return new Response(null, { status: 204 });
  }

  if (sub === "messages") {
    return messageRoutes(context, channel, guildSnowflake, [
      messageId,
      subSub,
      emoji,
      reactionUser,
    ]);
  }

  if (sub === "pins") {
    return pinRoutes(context, channel, guildSnowflake, messageId);
  }

  if (sub === "permissions" || sub === "invites" || sub === "webhooks") {
    // Hoffle has no channel overwrites, channel invites or webhooks. An empty
    // list is truthful; a 404 would read as "this channel is gone".
    return json([]);
  }

  return discordError(404, ErrorCode.GeneralError, "404: Not Found");
}

async function messageRoutes(
  context: RestContext,
  channel: HoffleChannelRow,
  guildSnowflake: string | null,
  [messageId, sub, emoji, reactionUser]: Array<string | undefined>,
): Promise<Response> {
  const { db, request } = context;

  if (!messageId) {
    if (request.method === "GET") return listMessages(context, channel, guildSnowflake);
    if (request.method === "POST") return createMessage(context, channel, guildSnowflake);
  }

  if (messageId === "bulk-delete" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { messages?: string[] };
    const ids = Array.isArray(body.messages) ? body.messages : [];
    const native = (
      await Promise.all(ids.map((id) => nativeFor("message", id)))
    ).filter((id): id is string => Boolean(id));
    if (!native.length) {
      return discordError(400, ErrorCode.InvalidFormBody, "No valid messages");
    }
    const now = new Date().toISOString();
    for (const id of native) {
      await db
        .prepare("UPDATE messages SET deleted_at = ? WHERE id = ?")
        .bind(now, id)
        .run();
      await publishMessageEvent(channel.id, { t: "message-deleted", id });
    }
    const snowflakes = await Promise.all(native.map((id) => snowflakeFor("message", id)));
    const { dispatchToBots } = await import("./dispatch");
    await dispatchToBots(
      "MESSAGE_DELETE_BULK",
      {
        ids: snowflakes,
        channel_id: await snowflakeFor("channel", channel.id, channel.created_at),
        guild_id: guildSnowflake ?? undefined,
      },
      { serverId: channel.server_id },
    );
    return new Response(null, { status: 204 });
  }

  if (!messageId) return discordError(404, ErrorCode.GeneralError, "404: Not Found");

  const nativeMessageId = await nativeFor("message", messageId);
  if (!nativeMessageId) {
    return discordError(404, ErrorCode.UnknownMessage, "Unknown Message");
  }

  // Reactions: /messages/{id}/reactions/{emoji}/{user}
  if (sub === "reactions") {
    return reactionRoutes(context, channel, nativeMessageId, emoji, reactionUser);
  }

  if (!sub) {
    if (request.method === "GET") {
      const row = await loadMessageRow(db, nativeMessageId);
      if (!row) return discordError(404, ErrorCode.UnknownMessage, "Unknown Message");
      return json(await buildMessage(context, row, channel, guildSnowflake));
    }

    if (request.method === "DELETE") {
      await db
        .prepare("UPDATE messages SET deleted_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), nativeMessageId)
        .run();
      await publishMessageEvent(channel.id, {
        t: "message-deleted",
        id: nativeMessageId,
      });
      await dispatchMessageDelete(nativeMessageId, channel.id);
      return new Response(null, { status: 204 });
    }

    if (request.method === "PATCH") {
      const body = (await parseMessageBody(request)) as {
        content?: string;
        embeds?: unknown[];
        components?: unknown[];
      };
      const before = await loadMessageRow(db, nativeMessageId);
      if (!before) return discordError(404, ErrorCode.UnknownMessage, "Unknown Message");
      const now = new Date().toISOString();
      const payload = mergeBotPayload(before.payload, body, context.bot.id);
      await db.batch([
        snapshotBeforeEdit(db, nativeMessageId, body.content ?? null, now),
        db
          .prepare(
            `UPDATE messages SET content = COALESCE(?, content),
               payload = ?, edited_at = ? WHERE id = ?`,
          )
          .bind(body.content ?? null, payload, now, nativeMessageId),
      ]);
      const row = await loadMessageRow(db, nativeMessageId);
      if (!row) return discordError(404, ErrorCode.UnknownMessage, "Unknown Message");
      await publishBotEdit(channel.id, {
        id: nativeMessageId,
        content: row.content,
        editedAt: now,
        payload: row.payload,
      });
      await dispatchMessage("MESSAGE_UPDATE", row, {
        origin: context.origin,
        basePath: context.basePath,
      });
      return json(await buildMessage(context, row, channel, guildSnowflake));
    }
  }

  return discordError(404, ErrorCode.GeneralError, "404: Not Found");
}

const MESSAGE_COLUMNS = `id, channel, channel_id, user_id, author, avatar, color, content,
  attachment_key, is_bot, created_at, link, action_label, audio_url, kind, payload,
  pinned_at, pinned_by, deleted_at, reply_to, edited_at, attachments, thread_id,
  command_text, command_by`;

async function loadMessageRow(
  db: D1Database,
  messageId: string,
): Promise<StoredMessage | null> {
  return db
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE id = ? AND deleted_at IS NULL`)
    .bind(messageId)
    .first<StoredMessage>();
}

async function buildMessage(
  context: RestContext,
  row: StoredMessage,
  channel: HoffleChannelRow,
  guildSnowflake: string | null,
): Promise<Record<string, unknown>> {
  const [author, mentions, reactions, channelSnowflake] = await Promise.all([
    row.user_id ? loadUser(context.db, row.user_id) : Promise.resolve(null),
    loadMentionedUsers(context.db, row.id),
    loadReactions(context.db, row.id),
    snowflakeFor("channel", channel.id, channel.created_at),
  ]);
  return serializeMessage(row, {
    channelSnowflake,
    guildSnowflake,
    author,
    mentions,
    reactions,
    origin: context.origin,
    basePath: context.basePath,
  });
}

async function listMessages(
  context: RestContext,
  channel: HoffleChannelRow,
  guildSnowflake: string | null,
): Promise<Response> {
  const params = context.url.searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit") || 50), 1), 100);

  // Discord pages by message id in three directions. Hoffle orders by
  // created_at, so each anchor becomes a timestamp subquery.
  const before = params.get("before");
  const after = params.get("after");
  const around = params.get("around");

  const clauses: string[] = ["channel_id = ?", "deleted_at IS NULL"];
  const binds: unknown[] = [channel.id];

  const anchorNative = async (id: string | null) =>
    id ? await nativeFor("message", id) : null;

  const beforeId = await anchorNative(before);
  const afterId = await anchorNative(after);
  const aroundId = await anchorNative(around);

  if (beforeId) {
    clauses.push("created_at < (SELECT created_at FROM messages WHERE id = ?)");
    binds.push(beforeId);
  }
  if (afterId) {
    clauses.push("created_at > (SELECT created_at FROM messages WHERE id = ?)");
    binds.push(afterId);
  }

  let sql = `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE ${clauses.join(" AND ")}`;
  if (aroundId) {
    // "around" is a window centred on the anchor: half before, half after.
    const half = Math.floor(limit / 2);
    sql = `
      SELECT * FROM (
        SELECT ${MESSAGE_COLUMNS} FROM messages
        WHERE channel_id = ? AND deleted_at IS NULL
          AND created_at <= (SELECT created_at FROM messages WHERE id = ?)
        ORDER BY created_at DESC LIMIT ?
      )
      UNION
      SELECT * FROM (
        SELECT ${MESSAGE_COLUMNS} FROM messages
        WHERE channel_id = ? AND deleted_at IS NULL
          AND created_at > (SELECT created_at FROM messages WHERE id = ?)
        ORDER BY created_at ASC LIMIT ?
      )
      ORDER BY created_at DESC`;
    const rows = await context.db
      .prepare(sql)
      .bind(channel.id, aroundId, half + 1, channel.id, aroundId, half)
      .all<StoredMessage>();
    return json(
      await Promise.all(
        (rows.results || []).map((row) =>
          buildMessage(context, row, channel, guildSnowflake),
        ),
      ),
    );
  }

  // `after` pages forward, so it has to take the *oldest* rows above the
  // anchor and then reverse them; everything else takes the newest first.
  sql += afterId
    ? " ORDER BY created_at ASC LIMIT ?"
    : " ORDER BY created_at DESC LIMIT ?";
  binds.push(limit);

  const rows = await context.db.prepare(sql).bind(...binds).all<StoredMessage>();
  const results = rows.results || [];
  if (afterId) results.reverse();

  return json(
    await Promise.all(
      results.map((row) => buildMessage(context, row, channel, guildSnowflake)),
    ),
  );
}

interface CreateMessageBody {
  content?: string;
  embeds?: Array<Record<string, unknown>>;
  components?: unknown[];
  message_reference?: { message_id?: string };
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  allowed_mentions?: unknown;
  flags?: number;
}

/** POST /channels/{id}/messages, shared with interaction responses. */
export async function createMessage(
  context: RestContext,
  channel: HoffleChannelRow,
  guildSnowflake: string | null,
  override?: CreateMessageBody,
): Promise<Response> {
  const body =
    override ??
    ((await parseMessageBody(context.request)) as CreateMessageBody);

  const content = (body.content || "").trim();
  const embeds = Array.isArray(body.embeds) ? body.embeds : [];
  const components = Array.isArray(body.components) ? body.components : [];

  if (!content && !embeds.length && !components.length) {
    return discordError(
      400,
      ErrorCode.CannotSendEmptyMessage,
      "Cannot send an empty message",
    );
  }

  const replyTo = body.message_reference?.message_id
    ? await nativeFor("message", body.message_reference.message_id)
    : null;

  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    channel: channel.name,
    channel_id: channel.id,
    user_id: null,
    author: (body.username || context.bot.name).slice(0, 80),
    avatar: (context.bot.avatar || "🤖").slice(0, 4),
    color: "#b8a6ff",
    content: content.slice(0, 4000),
    attachment_key: null,
    is_bot: 1,
    created_at: new Date().toISOString(),
    link: null,
    action_label: null,
    audio_url: null,
    kind: null,
    // Embeds and components round-trip through `payload`, which is how the
    // serializer reads them back out for other bots and for message fetches.
    payload: botPayload(context.bot.id, embeds, components),
    reply_to: replyTo,
  };

  await context.db
    .prepare(
      `INSERT INTO messages
         (id, channel, channel_id, user_id, author, avatar, color, content,
          attachment_key, is_bot, created_at, payload, reply_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?)`,
    )
    .bind(
      stored.id,
      stored.channel,
      stored.channel_id,
      stored.user_id,
      stored.author,
      stored.avatar,
      stored.color,
      stored.content,
      stored.created_at,
      stored.payload,
      stored.reply_to,
    )
    .run();

  // Hoffle's own tabs first: the web UI is the reason most of these messages
  // are being sent, and it must not wait on bot fan-out.
  const { publicMessage } = await import("../../app/api/messages/route");
  await publishMessage(channel.id, publicMessage(stored));

  // Discord delivers a bot its own MESSAGE_CREATE as well, which is why every
  // bot guards with `if (message.author.bot) return`. Suppressing the echo
  // here would silently change how that guard behaves.
  await dispatchMessage("MESSAGE_CREATE", stored, {
    origin: context.origin,
    basePath: context.basePath,
  });

  return json(await buildMessage(context, stored, channel, guildSnowflake), 200);
}

/**
 * Discord accepts messages as JSON or as multipart when files are attached.
 * discord.js switches to multipart the moment a bot adds an attachment, so a
 * JSON-only parser would fail on exactly the bots that send images.
 */
/** JSON or multipart (`payload_json`), as libraries send with attachments. */
export async function parseMessageBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const payload = form.get("payload_json");
    if (typeof payload === "string") {
      try {
        return JSON.parse(payload) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    const content = form.get("content");
    return typeof content === "string" ? { content } : {};
  }
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

async function reactionRoutes(
  context: RestContext,
  channel: HoffleChannelRow,
  messageId: string,
  emoji: string | undefined,
  user: string | undefined,
): Promise<Response> {
  const { db, request } = context;

  if (!emoji) {
    if (request.method === "DELETE") {
      await db.prepare("DELETE FROM reactions WHERE message_id = ?").bind(messageId).run();
      return new Response(null, { status: 204 });
    }
    return discordError(404, ErrorCode.GeneralError, "404: Not Found");
  }

  // Custom emoji arrive as "name:id"; unicode arrives percent-encoded.
  const decoded = decodeURIComponent(emoji);
  const name = decoded.includes(":") ? decoded.split(":")[0] : decoded;

  if (request.method === "GET") {
    const rows = await db
      .prepare("SELECT user_id FROM reactions WHERE message_id = ? AND emoji = ?")
      .bind(messageId, name)
      .all<{ user_id: string }>();
    return json(
      await Promise.all(
        (rows.results || []).map(async (row) => {
          const found = await loadUser(db, row.user_id);
          return found ? await serializeUser(found) : { id: row.user_id };
        }),
      ),
    );
  }

  // A bot reacting would need a Hoffle account to own the row, and it has
  // none. Reading reactions works; writing them does not.
  if (user === "@me" && (request.method === "PUT" || request.method === "DELETE")) {
    return discordError(
      403,
      ErrorCode.MissingPermissions,
      "Bots cannot add reactions on Hoffle: reactions belong to an account",
    );
  }

  if (request.method === "DELETE" && user) {
    const nativeUserId = await nativeFor("user", user);
    if (!nativeUserId) return discordError(404, ErrorCode.UnknownUser, "Unknown User");
    await db
      .prepare("DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
      .bind(messageId, nativeUserId, name)
      .run();
    await publishMessageEvent(channel.id, {
      t: "reaction",
      messageId,
      emoji: name,
      userId: nativeUserId,
      removed: true,
    });
    return new Response(null, { status: 204 });
  }

  return discordError(404, ErrorCode.GeneralError, "404: Not Found");
}

async function pinRoutes(
  context: RestContext,
  channel: HoffleChannelRow,
  guildSnowflake: string | null,
  messageId: string | undefined,
): Promise<Response> {
  const { db, request } = context;

  if (!messageId) {
    const rows = await db
      .prepare(
        `SELECT ${MESSAGE_COLUMNS} FROM messages
         WHERE channel_id = ? AND pinned_at IS NOT NULL AND deleted_at IS NULL
         ORDER BY pinned_at DESC`,
      )
      .bind(channel.id)
      .all<StoredMessage>();
    return json(
      await Promise.all(
        (rows.results || []).map((row) =>
          buildMessage(context, row, channel, guildSnowflake),
        ),
      ),
    );
  }

  const nativeMessageId = await nativeFor("message", messageId);
  if (!nativeMessageId) {
    return discordError(404, ErrorCode.UnknownMessage, "Unknown Message");
  }

  if (request.method === "PUT") {
    await db
      .prepare("UPDATE messages SET pinned_at = ?, pinned_by = ? WHERE id = ?")
      .bind(new Date().toISOString(), null, nativeMessageId)
      .run();
  } else if (request.method === "DELETE") {
    await db
      .prepare("UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE id = ?")
      .bind(nativeMessageId)
      .run();
  } else {
    return discordError(404, ErrorCode.GeneralError, "404: Not Found");
  }

  await publishMessageEvent(channel.id, {
    t: "message-pinned",
    id: nativeMessageId,
    pinned: request.method === "PUT",
  });
  return new Response(null, { status: 204 });
}

export { DM_SERVER_ID, colorToInt };
