import { authenticateBot } from "@/lib/bot-auth";
import { ensureSchema } from "@/lib/schema";
import { bindings, type StoredMessage } from "@/lib/storage";

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

  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database not connected" }, { status: 503 });
  }
  await ensureSchema(db);

  let lastCheckedTime = new Date().toISOString();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial READY event
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
          guilds: bot.serverId ? [{ id: bot.serverId }] : [],
        },
      });
      controller.enqueue(encoder.encode(`event: READY\ndata: ${readyPayload}\n\n`));

      // Poll interval for messages and events (2.5s)
      const interval = setInterval(async () => {
        try {
          const rows = await db
            .prepare(
              `SELECT id, channel_id, user_id, author, avatar, color, content,
                      attachment_key, is_bot, created_at, link, action_label,
                      audio_url, kind, payload, reply_to
               FROM messages
               WHERE created_at > ? AND deleted_at IS NULL
               ORDER BY created_at ASC LIMIT 25`
            )
            .bind(lastCheckedTime)
            .all<StoredMessage>();

          const messages = rows.results || [];
          for (const m of messages) {
            lastCheckedTime = m.created_at;
            const eventPayload = JSON.stringify({
              t: "MESSAGE_CREATE",
              d: {
                id: m.id,
                channel_id: m.channel_id,
                content: m.content,
                author: {
                  id: m.user_id || "bot",
                  username: m.author,
                  avatar: m.avatar,
                  bot: Boolean(m.is_bot),
                },
                timestamp: m.created_at,
                link: m.link,
                kind: m.kind,
              },
            });
            controller.enqueue(
              encoder.encode(`event: MESSAGE_CREATE\ndata: ${eventPayload}\n\n`)
            );
          }

          // Heartbeat comment
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // Keep stream alive on transient error
        }
      }, 2500);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
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
