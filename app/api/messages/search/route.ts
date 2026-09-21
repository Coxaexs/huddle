import { currentUser, unauthorized } from "@/lib/auth";
import { isDmMember } from "@/lib/dms";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export interface SearchResultItem {
  id: string;
  channelId: string | null;
  channel: string;
  author: string;
  avatar: string;
  color: string;
  content: string;
  snippet?: string;
  createdAt: string;
}

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }

  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  const channelId = url.searchParams.get("channelId")?.trim();
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "30", 10)), 100);

  if (!query) {
    return Response.json({ results: [] });
  }

  // If searching a specific DM channel, verify user is a participant
  if (channelId) {
    const isDm = await isDmMember(db, channelId, user.id);
    const channelRow = await db
      .prepare("SELECT server_id FROM channels WHERE id = ?")
      .bind(channelId)
      .first<{ server_id: string }>();

    if (channelRow?.server_id === "dm" && !isDm) {
      return Response.json({ results: [] }, { status: 403 });
    }
  }

  try {
    // Escape FTS5 special punctuation syntax to prevent query syntax errors
    const sanitizedFtsQuery = query
      .replace(/["*^]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"*`)
      .join(" ");

    let sql = `
      SELECT m.id, m.channel, m.channel_id, m.author, m.avatar, m.color, m.content, m.created_at,
             snippet(messages_fts, 3, '<mark>', '</mark>', '...', 20) AS snippet
        FROM messages_fts
        JOIN messages m ON m.id = messages_fts.id
       WHERE messages_fts MATCH ?
         AND m.deleted_at IS NULL
    `;
    const params: unknown[] = [sanitizedFtsQuery];

    if (channelId) {
      sql += " AND (m.channel_id = ? OR m.channel = ?)";
      params.push(channelId, channelId);
    }

    sql += " ORDER BY rank LIMIT ?";
    params.push(limit);

    const ftsResults = await db
      .prepare(sql)
      .bind(...params)
      .all<{
        id: string;
        channel: string;
        channel_id: string | null;
        author: string;
        avatar: string;
        color: string;
        content: string;
        created_at: string;
        snippet: string;
      }>();

    const results: SearchResultItem[] = (ftsResults.results || []).map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      channel: row.channel,
      author: row.author,
      avatar: row.avatar,
      color: row.color,
      content: row.content,
      snippet: row.snippet,
      createdAt: row.created_at,
    }));

    return Response.json({ results });
  } catch {
    // Fallback to standard LIKE search if FTS table query encounters any issue
    let likeSql = `
      SELECT id, channel, channel_id, author, avatar, color, content, created_at
        FROM messages
       WHERE content LIKE ?
         AND deleted_at IS NULL
    `;
    const likeParams: unknown[] = [`%${query}%`];

    if (channelId) {
      likeSql += " AND (channel_id = ? OR channel = ?)";
      likeParams.push(channelId, channelId);
    }

    likeSql += " ORDER BY created_at DESC LIMIT ?";
    likeParams.push(limit);

    const rows = await db
      .prepare(likeSql)
      .bind(...likeParams)
      .all<{
        id: string;
        channel: string;
        channel_id: string | null;
        author: string;
        avatar: string;
        color: string;
        content: string;
        created_at: string;
      }>();

    const results: SearchResultItem[] = (rows.results || []).map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      channel: row.channel,
      author: row.author,
      avatar: row.avatar,
      color: row.color,
      content: row.content,
      snippet: row.content.slice(0, 140),
      createdAt: row.created_at,
    }));

    return Response.json({ results });
  }
}
