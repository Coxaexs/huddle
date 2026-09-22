import { authenticateBot } from "@/lib/bot-auth";
import { dispatchMessage } from "@/lib/discord/dispatch";
import { publishMessage } from "@/lib/hub-client";
import { publicMessage } from "@/app/api/messages/route";
import { ensureSchema, DEFAULT_SERVER_ID } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings, type StoredMessage } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number | string;
  fields?: EmbedField[];
  footer?: { text?: string };
}

interface SendMessageBody {
  content?: string;
  username?: string;
  name?: string;
  avatar_url?: string;
  avatar?: string;
  embeds?: DiscordEmbed[];
  link?: string;
  action_label?: string;
  actionLabel?: string;
  audio_url?: string;
  audio?: string;
  kind?: string;
  payload?: unknown;
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const bot = await authenticateBot(request);
  if (!bot) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: channelId } = await props.params;
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database not connected" }, { status: 503 });
  }
  await ensureSchema(db);

  const channel = await findChannel(db, channelId);
  if (!channel) {
    return Response.json({ error: "Channel not found" }, { status: 404 });
  }
  if (bot.serverId && channel.server_id !== bot.serverId) {
    return Response.json({ error: "Access denied to this channel" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);
  const before = url.searchParams.get("before");

  let query = `
    SELECT id, channel_id, channel, user_id, author, avatar, color, content,
           attachment_key, is_bot, created_at, link, action_label, audio_url,
           kind, payload, reply_to, edited_at
    FROM messages
    WHERE channel_id = ? AND deleted_at IS NULL
  `;
  const params: unknown[] = [channel.id];

  if (before) {
    query += " AND created_at < (SELECT created_at FROM messages WHERE id = ? LIMIT 1)";
    params.push(before);
  }

  query += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  const rows = await db.prepare(query).bind(...params).all<StoredMessage>();
  const messages = (rows.results || []).map((m) => ({
    id: m.id,
    channel_id: m.channel_id || channel.id,
    guild_id: channel.server_id,
    content: m.content,
    author: {
      id: m.user_id || "bot",
      username: m.author,
      avatar: m.avatar,
      color: m.color,
      bot: Boolean(m.is_bot),
    },
    timestamp: m.created_at,
    attachments: m.attachment_key
      ? [{ id: m.attachment_key, url: `/hangout/api/uploads/${encodeURIComponent(m.attachment_key)}` }]
      : [],
    link: m.link,
    kind: m.kind,
    payload: m.payload ? JSON.parse(m.payload) : null,
  }));

  return Response.json(messages);
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const bot = await authenticateBot(request);
  if (!bot) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: channelId } = await props.params;
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database not connected" }, { status: 503 });
  }
  await ensureSchema(db);

  const channel = await findChannel(db, channelId);
  if (!channel) {
    return Response.json({ error: "Channel not found" }, { status: 404 });
  }
  if (bot.serverId && channel.server_id !== bot.serverId) {
    return Response.json({ error: "Access denied to this channel" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as SendMessageBody;
  let content = (body.content || "").trim();

  // If discord-style embeds are sent without explicit content, format them nicely
  if (!content && body.embeds && body.embeds.length > 0) {
    const embed = body.embeds[0];
    const parts = [];
    if (embed.title) parts.push(`**${embed.title}**`);
    if (embed.description) parts.push(embed.description);
    if (embed.fields) {
      for (const field of embed.fields) {
        parts.push(`**${field.name}**\n${field.value}`);
      }
    }
    if (embed.footer?.text) parts.push(`_${embed.footer.text}_`);
    content = parts.join("\n\n");
  }

  if (!content) {
    return Response.json({ error: "Message content cannot be empty" }, { status: 400 });
  }

  const authorName = body.username?.trim() || body.name?.trim() || bot.name;
  const avatar = body.avatar?.trim() || bot.avatar || "🤖";
  const link = body.link?.trim() || body.embeds?.[0]?.url?.trim() || null;
  const actionLabel = body.actionLabel?.trim() || body.action_label?.trim() || null;
  const audioUrl = body.audio?.trim() || body.audio_url?.trim() || null;
  const kind = body.kind?.trim() || null;
  const payload = body.payload ? JSON.stringify(body.payload) : body.embeds ? JSON.stringify(body.embeds) : null;

  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    channel: channel.name,
    channel_id: channel.id,
    user_id: null,
    author: authorName.slice(0, 80),
    avatar: avatar.slice(0, 4) || "🤖",
    color: "#b8a6ff",
    content: content.slice(0, 4000),
    attachment_key: null,
    is_bot: 1,
    created_at: new Date().toISOString(),
    link: link ? link.slice(0, 1000) : null,
    action_label: actionLabel ? actionLabel.slice(0, 80) : null,
    audio_url: audioUrl ? audioUrl.slice(0, 8000) : null,
    kind: kind ? kind.slice(0, 32) : null,
    payload: payload ? payload.slice(0, 8000) : null,
    command_text: null,
    command_by: null,
  };

  await db.prepare(
    `INSERT INTO messages
       (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key,
        is_bot, created_at, link, action_label, audio_url, kind, payload, command_text, command_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      stored.link,
      stored.action_label,
      stored.audio_url,
      stored.kind,
      stored.payload,
      stored.command_text,
      stored.command_by,
    )
    .run();

  await publishMessage(channel.id, publicMessage(stored));

  // Bots on the gateway see messages posted through the older REST APIs too,
  // so a bot's view of a channel does not depend on which API wrote to it.
  void dispatchMessage("MESSAGE_CREATE", stored, {
    origin: new URL(request.url).origin,
  });

  return Response.json(
    {
      id: stored.id,
      channel_id: channel.id,
      guild_id: channel.server_id,
      content: stored.content,
      author: {
        id: bot.id,
        username: stored.author,
        avatar: stored.avatar,
        bot: true,
      },
      timestamp: stored.created_at,
      embeds: body.embeds || [],
    },
    { status: 201 }
  );
}
