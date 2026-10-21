import { hubState } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { listServers, type PublicServer } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

// The music bot polls this every second while anyone is in voice. Servers and
// channels rarely change, so the list is kept for a few seconds instead of
// reading every server, channel, category and role again on each poll (most of
// Hoffle's CPU while it was otherwise idle). Voice members and players come
// fresh from the hub every time.
const SERVER_LIST_TTL_MS = 10_000;
let serverList: { at: number; servers: Promise<PublicServer[]> } | null = null;

function serversForBot(db: D1Database): Promise<PublicServer[]> {
  const now = Date.now();
  if (!serverList || now - serverList.at >= SERVER_LIST_TTL_MS) {
    const servers = listServers(db, null);
    // A failed read must not be served from the cache for the next 10 s.
    servers.catch(() => {
      if (serverList?.servers === servers) serverList = null;
    });
    serverList = { at: now, servers };
  }
  return serverList.servers;
}

/** Tests only: forget the cached server list. */
export function resetBotServerCache() {
  serverList = null;
}

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
    serversForBot(runtime.DB),
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
