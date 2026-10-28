/**
 * The bot side of widgets (lib/bot-widgets.ts), next to the commands routes:
 *
 *   GET    /applications/{app}/guilds/{guild}/widgets
 *   PUT    /applications/{app}/guilds/{guild}/widgets/{name}   create or replace
 *   PATCH  /applications/{app}/guilds/{guild}/widgets/{name}   change some fields
 *   DELETE /applications/{app}/guilds/{guild}/widgets/{name}
 *
 * A bot that belongs to one server may leave out `guilds/{guild}`. The body
 * is a message (content, embeds, components) plus `title`, `sizes` and
 * `webview_url`; `channel_id` (a query parameter or body field) scopes the
 * widget to one room.
 */

import {
  deleteWidget,
  listBotWidgets,
  publishWidget,
  saveWidget,
  widgetChanges,
  widgetKey,
  WIDGET_NAME,
  type BotWidget,
} from "../bot-widgets";
import { discordError, ErrorCode, type RestContext } from "./rest";
import { nativeFor, snowflakeFor } from "./snowflake";

const json = (data: unknown, status = 200) => Response.json(data, { status });

export function isWidgetRoute(segments: string[]): boolean {
  return segments[1] === "widgets" || (segments[1] === "guilds" && segments[3] === "widgets");
}

async function serializeWidget(widget: BotWidget): Promise<Record<string, unknown>> {
  return {
    name: widget.name,
    title: widget.title,
    sizes: widget.sizes,
    webview_url: widget.webviewUrl,
    channel_id: widget.channelId ? await snowflakeFor("channel", widget.channelId) : null,
    content: widget.content,
    embeds: widget.embeds,
    components: widget.components,
    updated_at: widget.updatedAt,
  };
}

export async function handleWidgetRoutes(context: RestContext, segments: string[]): Promise<Response> {
  const { db, bot, request, url } = context;

  let serverId = bot.serverId;
  let index = 1;
  if (segments[1] === "guilds") {
    const guildNative = segments[2] ? await nativeFor("guild", segments[2]) : null;
    if (!guildNative) return discordError(404, ErrorCode.UnknownGuild, "Unknown Guild");
    // A server's own bot may only touch its own server.
    if (bot.serverId && bot.serverId !== guildNative) {
      return discordError(403, ErrorCode.MissingAccess, "Missing Access");
    }
    serverId = guildNative;
    index = 3;
  }
  if (!serverId) {
    return discordError(400, ErrorCode.GeneralError, "Say which guild: /applications/{id}/guilds/{guild}/widgets");
  }

  const name = segments[index + 1];
  if (!name) {
    if (request.method !== "GET") return discordError(405, ErrorCode.GeneralError, "405: Method Not Allowed");
    return json(await Promise.all((await listBotWidgets(db, bot.id, serverId)).map(serializeWidget)));
  }
  if (!WIDGET_NAME.test(name)) {
    return discordError(400, ErrorCode.InvalidFormBody, "Widget names are 1-32 of a-z, 0-9, _ and -");
  }

  const body = request.method === "PUT" || request.method === "PATCH"
    ? ((await request.json().catch(() => ({}))) as Record<string, unknown>)
    : {};
  const channelRef = String(body.channel_id ?? url.searchParams.get("channel_id") ?? "").trim();
  let channelId: string | null = null;
  if (channelRef) {
    channelId = await nativeFor("channel", channelRef);
    const inServer = channelId
      ? await db.prepare("SELECT 1 FROM channels WHERE id = ? AND server_id = ?").bind(channelId, serverId).first()
      : null;
    if (!inServer) return discordError(404, ErrorCode.UnknownChannel, "Unknown Channel");
  }

  if (request.method === "DELETE") {
    // Without channel_id every copy goes: the server's and each room's.
    const removed = await deleteWidget(db, serverId, bot.id, name, channelId ?? "*");
    if (removed) {
      await publishWidget(db, serverId, { removed: { key: widgetKey(bot.id, name), channelId: channelId ?? "*" } });
    }
    return new Response(null, { status: 204 });
  }

  if (request.method === "PUT" || request.method === "PATCH") {
    const changes = widgetChanges(
      request.method === "PUT"
        // PUT replaces the whole message: what it leaves out is cleared.
        ? { content: "", embeds: [], components: [], ...body }
        : body,
    );
    if ("error" in changes) return discordError(400, ErrorCode.InvalidFormBody, changes.error);
    const saved = await saveWidget(db, bot, serverId, name, channelId, changes);
    if ("error" in saved) return discordError(400, ErrorCode.InvalidFormBody, saved.error);
    await publishWidget(db, serverId, { widget: saved });
    return json(await serializeWidget(saved));
  }

  if (request.method === "GET") {
    const all = await listBotWidgets(db, bot.id, serverId);
    const found = all.find((widget) => widget.name === name && widget.channelId === channelId);
    if (!found) return discordError(404, ErrorCode.GeneralError, "Unknown Widget");
    return json(await serializeWidget(found));
  }

  return discordError(405, ErrorCode.GeneralError, "405: Method Not Allowed");
}
