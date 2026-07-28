import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Full-text message search across a server's text channels with filter support:
 * - from:username
 * - in:channelname
 * - has:link / has:url
 * - has:file / has:image
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ results: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const params = new URL(request.url).searchParams;
  const serverId = params.get("serverId")?.slice(0, 64) || "";
  let q = params.get("q")?.trim().slice(0, 100) || "";
  if (q.length < 2) return Response.json({ results: [] });

  let authorFilter = "";
  let channelFilter = "";
  let hasLink = false;
  let hasFile = false;

  const fromMatch = q.match(/from:(\S+)/i);
  if (fromMatch) {
    authorFilter = fromMatch[1];
    q = q.replace(fromMatch[0], "").trim();
  }

  const inMatch = q.match(/in:(\S+)/i);
  if (inMatch) {
    channelFilter = inMatch[1];
    q = q.replace(inMatch[0], "").trim();
  }

  if (/has:(link|url)/i.test(q)) {
    hasLink = true;
    q = q.replace(/has:(link|url)/gi, "").trim();
  }

  if (/has:(file|image|attachment)/i.test(q)) {
    hasFile = true;
    q = q.replace(/has:(file|image|attachment)/gi, "").trim();
  }

  let sql = `SELECT m.id, m.channel_id, m.author, m.content, m.created_at, c.name AS channel_name
               FROM messages m
               JOIN channels c ON c.id = m.channel_id
              WHERE c.server_id = ? AND c.kind = 'text'
                AND m.deleted_at IS NULL`;

  const bindParams: string[] = [serverId];

  if (q.length > 0) {
    sql += ` AND m.content LIKE ? ESCAPE '\\'`;
    bindParams.push(`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  }

  if (authorFilter) {
    sql += ` AND m.author LIKE ? ESCAPE '\\'`;
    bindParams.push(`%${authorFilter.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  }

  if (channelFilter) {
    sql += ` AND c.name LIKE ? ESCAPE '\\'`;
    bindParams.push(`%${channelFilter.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  }

  if (hasLink) {
    sql += ` AND (m.content LIKE '%http://%' OR m.content LIKE '%https://%')`;
  }

  if (hasFile) {
    sql += ` AND (m.attachments IS NOT NULL AND m.attachments != '[]' AND m.attachments != '')`;
  }

  sql += ` ORDER BY m.created_at DESC LIMIT 50`;

  const rows = await db.prepare(sql).bind(...bindParams).all();

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
