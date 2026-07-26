import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Full-text-ish message search across a server's text channels (DMs excluded —
 * they need their own scoping). Simple LIKE, newest first, capped.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ results: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const params = new URL(request.url).searchParams;
  const serverId = params.get("serverId")?.slice(0, 64) || "";
  const q = params.get("q")?.trim().slice(0, 80) || "";
  if (q.length < 2) return Response.json({ results: [] });

  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .prepare(
      `SELECT m.id, m.channel_id, m.author, m.content, m.created_at, c.name AS channel_name
         FROM messages m
         JOIN channels c ON c.id = m.channel_id
        WHERE c.server_id = ? AND c.kind = 'text'
          AND m.deleted_at IS NULL
          AND m.content LIKE ? ESCAPE '\\'
        ORDER BY m.created_at DESC
        LIMIT 50`,
    )
    .bind(serverId, like)
    .all();

  return Response.json({
    results: (
      (rows.results || []) as Array<{
        id: string;
        channel_id: string;
        author: string;
        content: string;
        created_at: string;
        channel_name: string;
      }>
    ).map((r) => ({
      id: r.id,
      channelId: r.channel_id,
      channelName: r.channel_name,
      author: r.author,
      snippet: r.content.slice(0, 160),
      createdAt: r.created_at,
    })),
  });
}
