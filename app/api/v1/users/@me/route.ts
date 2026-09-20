import { authenticateBot } from "@/lib/bot-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const bot = await authenticateBot(request);
  if (!bot) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({
    id: bot.id,
    username: bot.name,
    discriminator: "0000",
    avatar: bot.avatar,
    bot: true,
    system: bot.isMaster,
    server_id: bot.serverId,
    kind: bot.kind,
  });
}
