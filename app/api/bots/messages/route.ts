import { publishMessage } from "@/lib/hub-client";
import { publicMessage } from "@/app/api/messages/route";
import { ensureSchema, DEFAULT_SERVER_ID } from "@/lib/schema";
import { bindings, type StoredMessage } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface BotMessageBody {
  content?: string;
  /** Channel id, or a channel name for older callers. */
  channelId?: string;
  channel?: string;
  name?: string;
  avatar?: string;
  link?: string;
  actionLabel?: string;
  audio?: string;
  kind?: string;
  payload?: unknown;
}

/** Lets an external bot (music, D&D, …) post into a Huddle channel. */
export async function POST(request: Request) {
  const runtime = bindings();
  if (!runtime.BOT_TOKEN) {
    return Response.json(
      { error: "Bot access has not been configured." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${runtime.BOT_TOKEN}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!runtime.DB) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  await ensureSchema(runtime.DB);

  const body = (await request.json()) as BotMessageBody;
  const content = body.content?.trim().slice(0, 4000);
  if (!content) {
    return Response.json({ error: "Bot message is empty." }, { status: 400 });
  }

  let channelId = body.channelId?.trim().slice(0, 64) || null;
  let channelName = body.channel?.trim().slice(0, 64) || "general";
  if (channelId) {
    const channel = await runtime.DB.prepare(
      "SELECT name FROM channels WHERE id = ?",
    )
      .bind(channelId)
      .first<{ name: string }>();
    channelName = channel?.name || channelName;
  } else {
    const channel = await runtime.DB.prepare(
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
    user_id: null,
    author: body.name?.trim().slice(0, 80) || "Bot",
    avatar: body.avatar?.trim().slice(0, 4) || "✦",
    color: "#b8a6ff",
    content,
    attachment_key: null,
    is_bot: 1,
    created_at: new Date().toISOString(),
    link: body.link?.trim().slice(0, 1000) || null,
    action_label: body.actionLabel?.trim().slice(0, 80) || null,
    audio_url: body.audio?.trim().slice(0, 8000) || null,
    kind: body.kind?.trim().slice(0, 32) || null,
    payload: body.payload ? JSON.stringify(body.payload).slice(0, 8000) : null,
  };

  await runtime.DB.prepare(
    `INSERT INTO messages
       (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key,
        is_bot, created_at, link, action_label, audio_url, kind, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?, ?, ?)`,
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
    )
    .run();

  await publishMessage(channelId || channelName, publicMessage(stored));
  return Response.json({ ok: true, id: stored.id }, { status: 201 });
}
