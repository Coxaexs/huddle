import { authenticateBot } from "@/lib/bot-auth";
import { publishMessageEvent } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; messageId: string }> },
) {
  const bot = await authenticateBot(request);
  if (!bot) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: channelId, messageId } = await props.params;
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

  const message = await db
    .prepare("SELECT id, channel_id FROM messages WHERE id = ? AND deleted_at IS NULL")
    .bind(messageId)
    .first<{ id: string; channel_id: string }>();

  if (!message) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  await db
    .prepare("UPDATE messages SET deleted_at = ? WHERE id = ?")
    .bind(now, messageId)
    .run();

  await publishMessageEvent(channel.id, {
    t: "message-delete",
    id: messageId,
    channelId: channel.id,
  });

  return new Response(null, { status: 204 });
}
