import { currentUser, unauthorized } from "@/lib/auth";
import { channelAudience } from "@/lib/dms";
import { publishMessageEvent } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Toggle the caller's emoji reaction on a message. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { emoji?: string };
  // Keep it to a short emoji/token; store as-is.
  const emoji = body.emoji?.trim().slice(0, 24);
  if (!emoji) {
    return Response.json({ error: "Pick an emoji." }, { status: 400 });
  }

  const message = await db
    .prepare(
      "SELECT channel_id FROM messages WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .first<{ channel_id: string | null }>();
  if (!message) {
    return Response.json({ error: "That message is gone." }, { status: 404 });
  }

  const existing = await db
    .prepare(
      "SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
    )
    .bind(id, user.id, emoji)
    .first();

  const added = !existing;
  if (added) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(id, user.id, emoji, new Date().toISOString())
      .run();
  } else {
    await db
      .prepare(
        "DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
      )
      .bind(id, user.id, emoji)
      .run();
  }

  if (message.channel_id) {
    await publishMessageEvent(
      message.channel_id,
      { t: "reaction", messageId: id, emoji, userId: user.id, added },
      await channelAudience(db, message.channel_id),
    );
  }
  return Response.json({ ok: true, added });
}
