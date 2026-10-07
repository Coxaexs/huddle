import { authenticateBot } from "@/lib/bot-auth";
import type { PublicMessage } from "@/app/api/messages/route";
import { listenToServer } from "@/lib/hub-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Support both header and query param token
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  let bot = null;

  if (queryToken) {
    const customReq = new Request(request.url, {
      headers: { Authorization: `Bot ${queryToken}` },
    });
    bot = await authenticateBot(customReq);
  } else {
    bot = await authenticateBot(request);
  }

  if (!bot) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A bot only ever sees its own server; without one there is nothing to send.
  const serverId = bot.serverId;
  if (!serverId) {
    return Response.json({ error: "Bot is not in a server" }, { status: 403 });
  }
  const socket = await listenToServer(serverId);
  if (!socket) {
    return Response.json({ error: "Realtime hub unavailable" }, { status: 503 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client went away.
        }
      };

      const readyPayload = JSON.stringify({
        t: "READY",
        d: {
          v: 1,
          user: {
            id: bot.id,
            username: bot.name,
            avatar: bot.avatar,
            bot: true,
          },
          guilds: [{ id: serverId }],
        },
      });
      send(`event: READY\ndata: ${readyPayload}\n\n`);

      // Messages arrive pushed from the hub, already scoped to this server.
      socket.addEventListener("message", (event) => {
        let data: { t?: string; channelId?: string; message?: PublicMessage };
        try {
          data = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const m = data.message;
        if (data.t !== "message" || !m) return;
        const eventPayload = JSON.stringify({
          t: "MESSAGE_CREATE",
          d: {
            id: m.id,
            channel_id: m.channelId || data.channelId,
            content: m.text,
            author: {
              id: m.userId || "bot",
              username: m.author,
              avatar: m.avatar,
              bot: Boolean(m.bot),
            },
            timestamp: m.createdAt,
            link: m.link,
            kind: m.kind,
          },
        });
        send(`event: MESSAGE_CREATE\ndata: ${eventPayload}\n\n`);
      });

      // Keeps proxies from closing an idle stream; no database work involved.
      const heartbeat = setInterval(() => send(`: ping\n\n`), 25_000);

      const close = () => {
        clearInterval(heartbeat);
        try {
          socket.close();
        } catch {
          // ignore
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
      };
      socket.addEventListener("close", close);
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
