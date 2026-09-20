import { authenticateBot } from "@/lib/bot-auth";
import { ensureSchema } from "@/lib/schema";
import type { ChannelRow } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const bot = await authenticateBot(request);
  if (!bot) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await props.params;
  if (bot.serverId && bot.serverId !== id) {
    return Response.json({ error: "Access denied to this guild" }, { status: 403 });
  }

  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database not connected" }, { status: 503 });
  }
  await ensureSchema(db);

  const server = await db
    .prepare("SELECT id FROM servers WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();

  if (!server) {
    return Response.json({ error: "Guild not found" }, { status: 404 });
  }

  const rows = await db
    .prepare(
      "SELECT id, server_id, name, kind, topic, position, category_id, created_at FROM channels WHERE server_id = ? ORDER BY position ASC"
    )
    .bind(id)
    .all<ChannelRow>();

  const channels = (rows.results || []).map((c) => ({
    id: c.id,
    guild_id: c.server_id,
    name: c.name,
    type: c.kind === "voice" ? 2 : 0,
    topic: c.topic,
    position: c.position,
    category_id: c.category_id,
  }));

  return Response.json(channels);
}
