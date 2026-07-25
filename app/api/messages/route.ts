import { currentUser, unauthorized } from "@/lib/auth";
import { publishMessage } from "@/lib/hub-client";
import { ensureSchema, DEFAULT_SERVER_ID } from "@/lib/schema";
import { bindings, type StoredMessage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export interface PublicMessage {
  id: string;
  channelId: string | null;
  userId: string | null;
  author: string;
  avatar: string;
  color: string;
  text: string;
  bot: boolean;
  time: string;
  createdAt: string;
  image?: string;
  link?: string;
  actionLabel?: string;
  audio?: string;
  /** Rich cards (currently "nowplaying") render instead of plain text. */
  kind?: string;
  payload?: unknown;
}

export function publicMessage(message: StoredMessage): PublicMessage {
  let payload: unknown;
  if (message.payload) {
    try {
      payload = JSON.parse(message.payload);
    } catch {
      payload = undefined;
    }
  }

  return {
    id: message.id,
    channelId: message.channel_id || null,
    userId: message.user_id || null,
    author: message.author,
    avatar: message.avatar,
    color: message.color,
    text: message.content,
    bot: Boolean(message.is_bot),
    time: new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(new Date(message.created_at)),
    createdAt: message.created_at,
    image: message.attachment_key
      ? `/hangout/api/uploads/${encodeURIComponent(message.attachment_key)}`
      : undefined,
    link: message.link || undefined,
    actionLabel: message.action_label || undefined,
    audio: message.audio_url || undefined,
    kind: message.kind || undefined,
    payload,
  };
}

/**
 * Reads a channel's history. `channelId` is the modern form; `channel` (a name)
 * is still accepted because bots address channels by name.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ messages: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const params = new URL(request.url).searchParams;
  const channelId = params.get("channelId")?.slice(0, 64);
  const channelName = params.get("channel")?.slice(0, 64);

  const columns = `id, channel_id, user_id, author, avatar, color, content, attachment_key,
                   is_bot, created_at, link, action_label, audio_url, kind, payload`;
  const result = channelId
    ? await db
        .prepare(
          `SELECT ${columns} FROM messages WHERE channel_id = ? ORDER BY created_at ASC LIMIT 200`,
        )
        .bind(channelId)
        .all()
    : await db
        .prepare(
          `SELECT ${columns} FROM messages WHERE channel = ? AND channel_id IS NULL ORDER BY created_at ASC LIMIT 200`,
        )
        .bind(channelName || "general")
        .all();

  return Response.json({
    messages: ((result.results || []) as unknown as StoredMessage[]).map(
      publicMessage,
    ),
  });
}

interface PostBody {
  channelId?: string;
  channel?: string;
  content?: string;
  attachmentKey?: string;
  link?: string;
  actionLabel?: string;
  audio?: string;
  kind?: string;
  payload?: unknown;
  /** Apps answer in-channel as a bot; this is a private Huddle, so any
   *  signed-in member may do it (that is what /roll and /watch use). */
  asBot?: boolean;
  botName?: string;
  botAvatar?: string;
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json()) as PostBody;
  const content = body.content?.trim().slice(0, 4000) || "";
  const attachmentKey = body.attachmentKey?.slice(0, 240) || null;
  if (!content && !attachmentKey) {
    return Response.json({ error: "A message cannot be empty." }, { status: 400 });
  }

  // Resolve the channel, falling back to the home server's #general.
  let channelId = body.channelId?.slice(0, 64) || null;
  let channelName = body.channel?.slice(0, 64) || "general";
  if (channelId) {
    const channel = await db
      .prepare("SELECT name FROM channels WHERE id = ? AND kind = 'text'")
      .bind(channelId)
      .first<{ name: string }>();
    if (!channel) {
      return Response.json({ error: "That channel is gone." }, { status: 404 });
    }
    channelName = channel.name;
  } else {
    const channel = await db
      .prepare(
        "SELECT id FROM channels WHERE server_id = ? AND kind = 'text' AND name = ?",
      )
      .bind(DEFAULT_SERVER_ID, channelName)
      .first<{ id: string }>();
    channelId = channel?.id || null;
  }

  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    channel: channelName,
    channel_id: channelId,
    user_id: body.asBot ? null : user.id,
    author: body.asBot
      ? body.botName?.trim().slice(0, 80) || "Huddle Bot"
      : user.display_name,
    avatar: body.asBot
      ? body.botAvatar?.trim().slice(0, 4) || "✦"
      : user.avatar,
    color: body.asBot ? "#b8a6ff" : user.color,
    content: content || "Shared an image",
    attachment_key: attachmentKey,
    is_bot: body.asBot ? 1 : 0,
    created_at: new Date().toISOString(),
    link: body.link?.trim().slice(0, 1000) || null,
    action_label: body.actionLabel?.trim().slice(0, 80) || null,
    audio_url: body.audio?.trim().slice(0, 8000) || null,
    kind: body.kind?.trim().slice(0, 32) || null,
    payload: body.payload ? JSON.stringify(body.payload).slice(0, 8000) : null,
  };

  await db
    .prepare(
      `INSERT INTO messages
       (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key,
        is_bot, created_at, link, action_label, audio_url, kind, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      stored.attachment_key,
      stored.is_bot,
      stored.created_at,
      stored.link,
      stored.action_label,
      stored.audio_url,
      stored.kind,
      stored.payload,
    )
    .run();

  const message = publicMessage(stored);
  await publishMessage(channelId || channelName, message);
  return Response.json({ message }, { status: 201 });
}
