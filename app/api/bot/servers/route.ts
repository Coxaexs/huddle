import { hubState } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The view the music bot's dashboard needs: Huddle servers presented the same
 * way Discord guilds are, with their voice rooms, who is in them, and what is
 * playing.
 */
export async function GET(request: Request) {
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

  const [servers, state] = await Promise.all([
    listServers(runtime.DB, null),
    hubState(),
  ]);

  return Response.json({
    platform: "huddle",
    serverNow: state?.serverNow ?? Date.now(),
    online: state?.online || [],
    servers: servers.map((server) => ({
      id: server.id,
      name: server.name,
      icon: server.icon,
      textChannels: server.channels
        .filter((channel) => channel.kind === "text")
        .map((channel) => ({ id: channel.id, name: channel.name })),
      voiceChannels: server.channels
        .filter((channel) => channel.kind === "voice")
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          members: (state?.voice?.[channel.id] || []).map((member) => ({
            id: member.id,
            name: member.displayName,
            bot: Boolean(member.bot),
          })),
          player: state?.players?.[channel.id] || null,
        })),
      // A room counts as "connected" when the bot is actually playing there.
      connected: server.channels.some(
        (channel) =>
          channel.kind === "voice" && state?.players?.[channel.id]?.track,
      ),
    })),
  });
}
