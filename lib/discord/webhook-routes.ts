/**
 * Discord's webhook endpoints on the versioned surface.
 *
 * Two kinds of caller reach these:
 *
 * - A bot managing webhooks (`POST /channels/{id}/webhooks`, `GET
 *   /guilds/{id}/webhooks`, `DELETE /webhooks/{id}`), authenticated with its
 *   token like every other bot route.
 * - Anyone holding a webhook's URL (`POST /webhooks/{id}/{token}`, and the
 *   message routes under it). The token in the path is the whole credential,
 *   exactly as on Discord, so discord.js's WebhookClient and discord.py's
 *   Webhook work against Hoffle unchanged.
 *
 * The rows are the same `channel_webhooks` people make in Server Settings, so a
 * webhook a bot creates shows up there too (tagged with who made it).
 */
import { authenticateBot, isBridgeBot, type BotIdentity } from "../bot-auth";
import type { StoredMessage } from "../storage";
import {
  BRIDGE_WEBHOOK_SOURCE,
  cleanWebhookAvatar,
  cleanWebhookName,
  createWebhook,
  deleteWebhookMessage,
  editWebhookMessage,
  executeWebhook,
  getWebhook,
  tokensMatch,
  webhookChannel,
  webhookError,
  webhookMessage,
  type WebhookRow,
} from "../webhooks";
import { channelWithGuild } from "./guild-data";
import { serializeMessage, type HoffleChannelRow } from "./serialize";
import { nativeFor, snowflakeFor } from "./snowflake";
import { loadThread, nativeThread } from "./threads";

/** Discord's own cap, per channel. Bridge webhooks are one per channel anyway. */
const MAX_WEBHOOKS_PER_CHANNEL = 15;

const json = (data: unknown, status = 200) => Response.json(data, { status });

export interface WebhookRouteContext {
  db: D1Database;
  request: Request;
  origin: string;
  basePath: string;
}

/** Discord's webhook object. */
export async function serializeWebhook(
  row: WebhookRow,
  context: Pick<WebhookRouteContext, "origin" | "basePath" | "db">,
  includeToken: boolean,
): Promise<Record<string, unknown>> {
  const located = await channelWithGuild(context.db, row.channel_id);
  const channelId = located
    ? await snowflakeFor("channel", located.channel.id, located.channel.created_at)
    : await snowflakeFor("channel", row.channel_id);
  const guildId = located?.server
    ? await snowflakeFor("guild", located.server.id, located.server.created_at)
    : null;
  return {
    id: row.id,
    type: 1,
    guild_id: guildId,
    channel_id: channelId,
    name: row.name,
    avatar: null,
    application_id: null,
    ...(includeToken
      ? {
          token: row.token,
          url: `${context.origin}${context.basePath}/api/webhooks/${row.id}/${row.token}`,
        }
      : {}),
  };
}

function botMadeIt(row: WebhookRow, bot: BotIdentity): boolean {
  return row.created_by === `bot:${bot.id}`;
}

/** The Discord bridge's webhooks keep their URL to the bridge (and the operator's master token). */
function mayHoldToken(row: WebhookRow, bot: BotIdentity): boolean {
  return row.source !== BRIDGE_WEBHOOK_SOURCE || isBridgeBot(bot);
}

/** GET/POST /channels/{id}/webhooks. */
export async function channelWebhookRoutes(
  context: WebhookRouteContext & { bot: BotIdentity },
  channel: HoffleChannelRow,
): Promise<Response> {
  const { db, request, bot } = context;
  if (request.method === "GET") {
    const rows = await db
      .prepare("SELECT * FROM channel_webhooks WHERE channel_id = ? ORDER BY created_at")
      .bind(channel.id)
      .all<WebhookRow>();
    return json(
      await Promise.all(
        (rows.results || []).map((row) => serializeWebhook(row, context, mayHoldToken(row, bot))),
      ),
    );
  }
  if (request.method !== "POST") return webhookError(405, 0, "405: Method Not Allowed");

  const target = await webhookChannel(db, channel.server_id, channel.id);
  if (!target) return webhookError(400, 50035, "Webhooks can only post in text channels");
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM channel_webhooks WHERE channel_id = ?")
    .bind(channel.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_WEBHOOKS_PER_CHANNEL) {
    return webhookError(400, 30007, "Maximum number of webhooks reached (15)");
  }
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; avatar?: unknown };
  const name = cleanWebhookName(body.name);
  if (!name) return webhookError(400, 50035, "Invalid Form Body: name is required");
  // Discord sends the avatar as a data: URI; Hoffle webhooks wear an emoji.
  const avatar =
    typeof body.avatar === "string" && !body.avatar.startsWith("data:")
      ? cleanWebhookAvatar(body.avatar)
      : bot.kind === "discord-bridge"
        ? "🌉"
        : "🪝";
  const row = await createWebhook(db, {
    serverId: channel.server_id,
    channelId: channel.id,
    name,
    avatar,
    createdBy: `bot:${bot.id}`,
    source: bot.kind === "discord-bridge" ? BRIDGE_WEBHOOK_SOURCE : "bot",
  });
  return json(await serializeWebhook(row, context, true));
}

/** GET /guilds/{id}/webhooks. */
export async function guildWebhooks(
  context: WebhookRouteContext & { bot: BotIdentity },
  serverId: string,
): Promise<Response> {
  const rows = await context.db
    .prepare("SELECT * FROM channel_webhooks WHERE server_id = ? ORDER BY created_at")
    .bind(serverId)
    .all<WebhookRow>();
  return json(
    await Promise.all(
      (rows.results || []).map((row) => serializeWebhook(row, context, mayHoldToken(row, context.bot))),
    ),
  );
}

/** GET/PATCH/DELETE /webhooks/{id}, for a bot that can see the webhook's server. */
export async function webhookByIdRoutes(
  context: WebhookRouteContext & { bot: BotIdentity },
  webhookId: string,
  canSeeServer: (serverId: string) => boolean,
): Promise<Response> {
  const { db, request, bot } = context;
  const row = await getWebhook(db, webhookId);
  if (!row || !canSeeServer(row.server_id)) return webhookError(404, 10015, "Unknown Webhook");

  if (request.method === "GET") return json(await serializeWebhook(row, context, mayHoldToken(row, bot)));

  if (request.method === "DELETE") {
    // A bot may remove its own webhooks; people's ones stay people's, unless
    // the bot is the operator's.
    if (!botMadeIt(row, bot) && !bot.isMaster) {
      return webhookError(403, 50013, "Missing Permissions");
    }
    await db.prepare("DELETE FROM channel_webhooks WHERE id = ?").bind(row.id).run();
    return new Response(null, { status: 204 });
  }

  if (request.method === "PATCH") {
    if (!botMadeIt(row, bot) && !bot.isMaster) {
      return webhookError(403, 50013, "Missing Permissions");
    }
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; channel_id?: unknown };
    const name = body.name === undefined ? row.name : cleanWebhookName(body.name) || row.name;
    let channelId = row.channel_id;
    if (typeof body.channel_id === "string") {
      const native = await nativeFor("channel", body.channel_id);
      const target = native ? await webhookChannel(db, row.server_id, native) : null;
      if (!target) return webhookError(400, 10003, "Unknown Channel");
      channelId = target.id;
    }
    await db
      .prepare("UPDATE channel_webhooks SET name = ?, channel_id = ? WHERE id = ?")
      .bind(name, channelId, row.id)
      .run();
    return json(
      await serializeWebhook({ ...row, name, channel_id: channelId }, context, mayHoldToken(row, bot)),
    );
  }

  return webhookError(405, 0, "405: Method Not Allowed");
}

/** True when `/webhooks/{id}/{token}` names one of Hoffle's channel webhooks. */
export async function isChannelWebhook(
  db: D1Database,
  webhookId: string | undefined,
  token: string | undefined,
): Promise<boolean> {
  if (!webhookId || !token) return false;
  const row = await getWebhook(db, webhookId);
  return Boolean(row && tokensMatch(row.token, token));
}

/** A message as the versioned surface answers it: snowflake ids throughout. */
async function serializeStored(
  context: WebhookRouteContext,
  stored: StoredMessage,
): Promise<Record<string, unknown>> {
  const located = stored.channel_id ? await channelWithGuild(context.db, stored.channel_id) : null;
  const channelSnowflake = stored.thread_id
    ? await snowflakeFor("channel", stored.thread_id)
    : await snowflakeFor("channel", stored.channel_id || "", located?.channel.created_at);
  const guildSnowflake = located?.server
    ? await snowflakeFor("guild", located.server.id, located.server.created_at)
    : null;
  return serializeMessage(stored, {
    channelSnowflake,
    guildSnowflake,
    origin: context.origin,
    basePath: context.basePath,
  });
}

/**
 * `thread_id` on Discord is the thread channel's snowflake. A Hoffle thread is
 * keyed by its root message, which is what executeWebhook checks.
 */
async function threadRoot(db: D1Database, snowflake: string | null): Promise<string | null | false> {
  if (!snowflake) return null;
  const native = await nativeFor("channel", snowflake);
  if (!native) return false;
  const thread = (await loadThread(db, native)) ?? (await nativeThread(db, native));
  if (!thread) return false;
  return thread.anchor_message_id || thread.id;
}

/**
 * Everything under `/webhooks/{id}/{token}`: execute, describe, delete, and
 * the message routes. `parse` reads JSON or multipart (with files).
 */
export async function webhookTokenRoutes(
  context: WebhookRouteContext,
  segments: string[],
  parse: (request: Request) => Promise<{ body: Record<string, unknown>; files: File[] }>,
): Promise<Response> {
  const { db, request } = context;
  const [webhookId, token, sub, messageRef] = segments;
  const row = webhookId ? await getWebhook(db, webhookId) : null;
  if (!row || !token || !tokensMatch(row.token, token)) {
    return webhookError(404, 10015, "Unknown Webhook");
  }
  const url = new URL(request.url);
  // The URL is the whole credential for posting, as on Discord. Speaking as a
  // linked person through a bridge webhook also takes the bridge's bot token.
  const bridgeCaller =
    row.source === BRIDGE_WEBHOOK_SOURCE && request.headers.has("authorization")
      ? isBridgeBot(await authenticateBot(request).catch(() => null))
      : false;

  if (!sub) {
    if (request.method === "GET") return json(await serializeWebhook(row, context, true));
    if (request.method === "DELETE") {
      await db.prepare("DELETE FROM channel_webhooks WHERE id = ?").bind(row.id).run();
      return new Response(null, { status: 204 });
    }
    if (request.method !== "POST") return webhookError(405, 0, "405: Method Not Allowed");

    const { body, files } = await parse(request);
    const root = await threadRoot(db, url.searchParams.get("thread_id"));
    if (root === false) return webhookError(400, 10003, "Unknown Channel");
    const reference = body.message_reference as { message_id?: unknown } | undefined;
    const replyTo =
      typeof reference?.message_id === "string" ? await nativeFor("message", reference.message_id) : null;
    return executeWebhook(db, row.id, row.token, body, {
      wait: url.searchParams.get("wait") === "true",
      threadId: root,
      replyTo,
      files,
      origin: context.origin,
      basePath: context.basePath,
      respond: (stored) => serializeStored(context, stored),
      bridgeCaller,
    });
  }

  if (sub !== "messages" || !messageRef) return webhookError(404, 0, "404: Not Found");
  const nativeId = await nativeFor("message", messageRef);
  const message = nativeId ? await webhookMessage(db, row, nativeId, { bridgeCaller }) : null;
  if (!message) return webhookError(404, 10008, "Unknown Message");

  if (request.method === "GET") return json(await serializeStored(context, message));
  if (request.method === "DELETE") {
    await deleteWebhookMessage(db, row, message);
    return new Response(null, { status: 204 });
  }
  if (request.method === "PATCH") {
    const { body, files } = await parse(request);
    const result = await editWebhookMessage(db, row, message, body, {
      files,
      origin: context.origin,
      basePath: context.basePath,
    });
    if (result instanceof Response) return result;
    return json(await serializeStored(context, result));
  }
  return webhookError(405, 0, "405: Method Not Allowed");
}
