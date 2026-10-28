/**
 * Bot widgets: a small card a bot keeps up to date, which members can pin to
 * their sidebar, member list or header (see lib/layout-prefs.ts).
 *
 * A widget is shaped like a message (content, embeds, components) so any
 * Discord library can build one, and pressing its buttons reaches the bot as
 * an ordinary MESSAGE_COMPONENT interaction. The bot answers the way it would
 * for a message: UpdateMessage (or a deferred update and an edit of
 * @original) changes the widget for everyone in the server.
 *
 * One row per bot, server, name and scope. The scope is a channel id when
 * the widget belongs to one room (a music player per voice room) or '' for
 * the whole server; the client shows the room's version when there is one.
 */

import { publishMessageEvent } from "./hub-client";
import type { WidgetSize } from "./layout-prefs";

export interface BotWidget {
  /** What a placement stores: `bot:<botId>:<name>`. */
  key: string;
  botId: string;
  botName: string;
  botAvatar: string;
  serverId: string;
  name: string;
  /** null: the whole server. */
  channelId: string | null;
  title: string;
  sizes: WidgetSize[];
  /** An https page the widget's "Open" button shows inside Hoffle. */
  webviewUrl: string | null;
  content: string;
  embeds: unknown[];
  components: unknown[];
  updatedAt: string;
}

interface WidgetRow {
  bot_id: string;
  server_id: string;
  name: string;
  channel_id: string;
  title: string;
  sizes: string;
  webview_url: string | null;
  content: string;
  embeds: string;
  components: string;
  updated_at: string;
  bot_name?: string | null;
  bot_avatar?: string | null;
}

export const WIDGET_NAME = /^[a-z0-9_-]{1,32}$/;
export const MAX_WIDGETS_PER_BOT = 10;
const MAX_JSON = 8000;
const ALL_SIZES: WidgetSize[] = ["small", "medium", "large"];

export function widgetKey(botId: string, name: string): string {
  return `bot:${botId}:${name}`;
}

/**
 * The stand-in message id a widget's buttons are pressed "on". It travels
 * through discord_interactions.response_message_id, which is how an
 * UpdateMessage answer finds its way back to the widget.
 */
export function widgetMessageId(serverId: string, botId: string, name: string, channelId: string | null): string {
  return ["widget", serverId, botId, name, channelId || ""].join("|");
}

export function parseWidgetMessageId(
  id: string | null | undefined,
): { serverId: string; botId: string; name: string; channelId: string | null } | null {
  if (!id || !id.startsWith("widget|")) return null;
  const [, serverId, botId, name, channelId] = id.split("|");
  if (!serverId || !botId || !name) return null;
  return { serverId, botId, name, channelId: channelId || null };
}

function parseList(value: string | null | undefined): unknown[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fromRow(row: WidgetRow): BotWidget {
  const sizes = parseList(row.sizes).filter((size): size is WidgetSize =>
    ALL_SIZES.includes(size as WidgetSize),
  );
  return {
    key: widgetKey(row.bot_id, row.name),
    botId: row.bot_id,
    botName: row.bot_name || "Bot",
    botAvatar: row.bot_avatar || "🤖",
    serverId: row.server_id,
    name: row.name,
    channelId: row.channel_id || null,
    title: row.title,
    sizes: sizes.length ? sizes : ALL_SIZES,
    webviewUrl: row.webview_url,
    content: row.content,
    embeds: parseList(row.embeds),
    components: parseList(row.components),
    updatedAt: row.updated_at,
  };
}

function httpsUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.toString().slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

export interface WidgetChanges {
  title?: string;
  sizes?: WidgetSize[];
  webviewUrl?: string | null;
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
}

/**
 * What a bot's request body asks to change, or an error to send back. Fields
 * left out keep their old value, as message edits do.
 */
export function widgetChanges(body: Record<string, unknown>): WidgetChanges | { error: string } {
  const changes: WidgetChanges = {};
  if (body.title !== undefined) changes.title = String(body.title ?? "").trim().slice(0, 60);
  if (body.sizes !== undefined) {
    if (!Array.isArray(body.sizes)) return { error: "sizes must be a list" };
    const sizes = ALL_SIZES.filter((size) => (body.sizes as unknown[]).includes(size));
    if (!sizes.length) return { error: "sizes needs at least one of small, medium, large" };
    changes.sizes = sizes;
  }
  if (body.webview_url !== undefined) {
    const url = httpsUrl(body.webview_url);
    if (url === undefined) return { error: "webview_url must be an https:// address" };
    changes.webviewUrl = url;
  }
  if (body.content !== undefined) changes.content = String(body.content ?? "").slice(0, 2000);
  if (body.embeds !== undefined) {
    changes.embeds = Array.isArray(body.embeds) ? body.embeds.slice(0, 2) : [];
    if (JSON.stringify(changes.embeds).length > MAX_JSON) return { error: "embeds are too large" };
  }
  if (body.components !== undefined) {
    changes.components = Array.isArray(body.components) ? body.components.slice(0, 5) : [];
    if (JSON.stringify(changes.components).length > MAX_JSON) return { error: "components are too large" };
  }
  return changes;
}

const SELECT = `SELECT w.*, b.name AS bot_name, b.avatar AS bot_avatar
  FROM bot_widgets w LEFT JOIN server_bots b ON b.id = w.bot_id`;

export async function getWidget(
  db: D1Database,
  serverId: string,
  botId: string,
  name: string,
  channelId: string | null,
): Promise<BotWidget | null> {
  const row = await db
    .prepare(`${SELECT} WHERE w.server_id = ? AND w.bot_id = ? AND w.name = ? AND w.channel_id = ?`)
    .bind(serverId, botId, name, channelId || "")
    .first<WidgetRow>();
  return row ? fromRow(row) : null;
}

/** Every widget in a server whose bot is switched on (or built in). */
export async function listServerWidgets(db: D1Database, serverId: string): Promise<BotWidget[]> {
  const rows = await db
    .prepare(`${SELECT} WHERE w.server_id = ? AND (b.id IS NULL OR b.enabled = 1) ORDER BY w.updated_at DESC LIMIT 100`)
    .bind(serverId)
    .all<WidgetRow>();
  return (rows.results || []).map(fromRow);
}

export async function listBotWidgets(db: D1Database, botId: string, serverId: string): Promise<BotWidget[]> {
  const rows = await db
    .prepare(`${SELECT} WHERE w.bot_id = ? AND w.server_id = ? ORDER BY w.name, w.channel_id`)
    .bind(botId, serverId)
    .all<WidgetRow>();
  return (rows.results || []).map(fromRow);
}

/**
 * Creates or changes a widget. A new one needs a title; the bot's display
 * name and avatar come from server_bots when it has a row there.
 */
export async function saveWidget(
  db: D1Database,
  bot: { id: string; name: string; avatar: string },
  serverId: string,
  name: string,
  channelId: string | null,
  changes: WidgetChanges,
): Promise<BotWidget | { error: string }> {
  const existing = await getWidget(db, serverId, bot.id, name, channelId);
  if (!existing) {
    const count = await db
      .prepare("SELECT COUNT(DISTINCT name) AS n FROM bot_widgets WHERE bot_id = ? AND server_id = ? AND name != ?")
      .bind(bot.id, serverId, name)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_WIDGETS_PER_BOT) {
      return { error: `A bot can have at most ${MAX_WIDGETS_PER_BOT} widgets per server` };
    }
  }
  // A room's copy starts from the server-wide one, so a bot can set the title
  // and sizes once and then only send each room's content.
  const base = existing ?? (channelId ? await getWidget(db, serverId, bot.id, name, null) : null);
  const title = changes.title || base?.title || name;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO bot_widgets
         (bot_id, server_id, name, channel_id, title, sizes, webview_url, content, embeds, components, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (bot_id, server_id, name, channel_id) DO UPDATE SET
         title = excluded.title, sizes = excluded.sizes, webview_url = excluded.webview_url,
         content = excluded.content, embeds = excluded.embeds, components = excluded.components,
         updated_at = excluded.updated_at`,
    )
    .bind(
      bot.id,
      serverId,
      name,
      channelId || "",
      title,
      JSON.stringify(changes.sizes ?? base?.sizes ?? ALL_SIZES),
      changes.webviewUrl !== undefined ? changes.webviewUrl : base?.webviewUrl ?? null,
      changes.content ?? existing?.content ?? "",
      JSON.stringify(changes.embeds ?? existing?.embeds ?? []),
      JSON.stringify(changes.components ?? existing?.components ?? []),
      now,
    )
    .run();
  const saved = await getWidget(db, serverId, bot.id, name, channelId);
  if (!saved) return { error: "The widget could not be saved" };
  // Bots on the master token have no server_bots row: name them after the bot.
  return { ...saved, botName: saved.botName === "Bot" ? bot.name : saved.botName, botAvatar: saved.botAvatar === "🤖" ? bot.avatar : saved.botAvatar };
}

export async function deleteWidget(
  db: D1Database,
  serverId: string,
  botId: string,
  name: string,
  channelId: string | null | "*",
): Promise<number> {
  const result = channelId === "*"
    ? await db
        .prepare("DELETE FROM bot_widgets WHERE server_id = ? AND bot_id = ? AND name = ?")
        .bind(serverId, botId, name)
        .run()
    : await db
        .prepare("DELETE FROM bot_widgets WHERE server_id = ? AND bot_id = ? AND name = ? AND channel_id = ?")
        .bind(serverId, botId, name, channelId || "")
        .run();
  return result.meta?.changes ?? 0;
}

/** Whether a widget has a button or select with this custom_id. */
export function widgetHasComponent(widget: BotWidget, customId: string): boolean {
  return widget.components.some((row) =>
    Array.isArray((row as { components?: unknown[] })?.components) &&
    (row as { components: Array<{ custom_id?: string }> }).components.some(
      (component) => component?.custom_id === customId,
    ),
  );
}

/**
 * Tells everyone in the server that a widget changed (or, with `removed`,
 * went away). Sent to the members by id: a widget is a server's, not a
 * channel's, and the hub's channel audiences don't cover that.
 */
export async function publishWidget(
  db: D1Database,
  serverId: string,
  change: { widget: BotWidget } | { removed: { key: string; channelId: string | null | "*" } },
): Promise<void> {
  const members = await db
    .prepare("SELECT user_id FROM server_members WHERE server_id = ? LIMIT 5000")
    .bind(serverId)
    .all<{ user_id: string }>();
  const audience = (members.results || []).map((row) => row.user_id);
  if (!audience.length) return;
  await publishMessageEvent(
    `widgets:${serverId}`,
    { t: "bot-widget", serverId, ...change },
    audience,
  );
}
