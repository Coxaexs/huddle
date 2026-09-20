import { authenticateBot } from "@/lib/bot-auth";
import { ensureSchema } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const bot = await authenticateBot(request);
  if (!bot) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database not connected" }, { status: 503 });
  }
  await ensureSchema(db);

  let servers = await listServers(db, null);
  if (bot.serverId) {
    servers = servers.filter((s) => s.id === bot.serverId);
  }

  const result = servers.map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    icon_url: s.iconUrl || null,
    owner_id: s.ownerId,
    channels: s.channels.map((c) => ({
      id: c.id,
      guild_id: s.id,
      name: c.name,
      type: c.kind === "voice" ? 2 : 0,
      topic: c.topic,
      position: c.position,
      category_id: c.categoryId,
    })),
  }));

  return Response.json(result);
}
