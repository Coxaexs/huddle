import { bindings, ensureMessagesTable, type StoredMessage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export interface PublicMessage {
  id: string;
  author: string;
  avatar: string;
  color: string;
  text: string;
  bot: boolean;
  time: string;
  image?: string;
  link?: string;
  actionLabel?: string;
  audio?: string;
}

export function publicMessage(message: StoredMessage): PublicMessage {
  return {
    id: message.id,
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
    image: message.attachment_key
      ? `/hangout/api/uploads/${encodeURIComponent(message.attachment_key)}`
      : undefined,
    link: message.link || undefined,
    actionLabel: message.action_label || undefined,
    audio: message.audio_url || undefined,
  };
}

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ messages: [] });
  await ensureMessagesTable(db);

  const channel =
    new URL(request.url).searchParams.get("channel")?.slice(0, 64) || "general";
  const result = await db
    .prepare(
      `SELECT id, author, avatar, color, content, attachment_key, is_bot, created_at,
              link, action_label, audio_url
       FROM messages
       WHERE channel = ?
       ORDER BY created_at ASC
       LIMIT 150`,
    )
    .bind(channel)
    .all();

  return Response.json({
    messages: ((result.results || []) as unknown as StoredMessage[]).map(
      publicMessage,
    ),
  });
}

interface PostBody {
  channel?: string;
  content?: string;
  attachmentKey?: string;
  author?: string;
  avatar?: string;
  color?: string;
  bot?: boolean;
  link?: string;
  actionLabel?: string;
  audio?: string;
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as PostBody;
  const channel = body.channel?.trim().slice(0, 64) || "general";
  const content = body.content?.trim().slice(0, 4000) || "";
  const attachmentKey = body.attachmentKey?.slice(0, 240) || null;
  if (!content && !attachmentKey) {
    return Response.json({ error: "A message cannot be empty." }, { status: 400 });
  }

  await ensureMessagesTable(db);

  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    author: body.author?.trim().slice(0, 40) || "Friend",
    avatar: body.avatar?.trim().slice(0, 4) || "F",
    color: body.color?.trim().slice(0, 24) || "#ffd67c",
    content: content || "Shared an image",
    attachment_key: attachmentKey,
    is_bot: body.bot ? 1 : 0,
    created_at: new Date().toISOString(),
    link: body.link?.trim().slice(0, 1000) || null,
    action_label: body.actionLabel?.trim().slice(0, 80) || null,
    audio_url: body.audio?.trim().slice(0, 8000) || null,
  };

  await db
    .prepare(
      `INSERT INTO messages
       (id, channel, author, avatar, color, content, attachment_key, is_bot, created_at, link, action_label, audio_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stored.id,
      channel,
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
    )
    .run();

  return Response.json({ message: publicMessage(stored) }, { status: 201 });
}
