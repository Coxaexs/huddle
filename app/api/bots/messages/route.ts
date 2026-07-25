import { bindings, ensureMessagesTable } from "@/lib/storage";

interface BotMessageBody {
  content?: string;
  channel?: string;
  name?: string;
  avatar?: string;
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

  const body = (await request.json()) as BotMessageBody;
  const content = body.content?.trim().slice(0, 4000);
  if (!content) {
    return Response.json({ error: "Bot message is empty." }, { status: 400 });
  }

  const message = {
    id: crypto.randomUUID(),
    channel: body.channel?.trim().slice(0, 64) || "general",
    author: body.name?.trim().slice(0, 80) || "Bot",
    avatar: body.avatar?.trim().slice(0, 4) || "✦",
    color: "#b8a6ff",
    content,
    createdAt: new Date().toISOString(),
  };

  await ensureMessagesTable(runtime.DB);
  await runtime.DB.prepare(
    `INSERT INTO messages
       (id, channel, author, avatar, color, content, attachment_key, is_bot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?)`,
  )
    .bind(
      message.id,
      message.channel,
      message.author,
      message.avatar,
      message.color,
      message.content,
      message.createdAt,
    )
    .run();

  return Response.json({ ok: true, id: message.id }, { status: 201 });
}
