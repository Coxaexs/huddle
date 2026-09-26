import { currentUser, unauthorized } from "@/lib/auth";
import { isDmMember } from "@/lib/dms";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import {
  buildMessageFilters,
  isEmptyQuery,
  parseSearchQuery,
} from "@/lib/search-query";

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
  const raw = url.searchParams.get("q")?.trim();
  const channelId = url.searchParams.get("channelId")?.trim();
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "30", 10)), 100);

  if (!raw) {
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

  const query = parseSearchQuery(raw);
  // `from:` on its own parses to empty text but is still a real search, so the
  // emptiness check has to consider the filters too.
  if (isEmptyQuery(query)) {
    return Response.json({ results: [] });
  }

  // Both paths below share these predicates, so `has:image` cannot mean one
  // thing when FTS answers and another when the LIKE fallback does.
  const filters = buildMessageFilters(query);
  const filterSql = filters.clauses.length
    ? ` AND ${filters.clauses.join(" AND ")}`
    : "";

  // FTS needs actual words to match on. A filters-only query skips straight to
  // the scan, where the filters are the whole search.
  if (query.text) {
    const ranked = await ftsSearch(
      db,
      query.text,
      channelId,
      filterSql,
      filters.params,
      limit,
    );
    if (ranked) return Response.json({ results: ranked });
  }

  const scanned = await likeSearch(
    db,
    query.text,
    channelId,
    filterSql,
    filters.params,
    limit,
  );
  return Response.json({ results: scanned });
}

interface SearchRow {
  id: string;
  channel: string;
  channel_id: string | null;
  author: string;
  avatar: string;
  color: string;
  content: string;
  created_at: string;
  snippet?: string;
}

function toResult(row: SearchRow, snippet?: string): SearchResultItem {
  return {
    id: row.id,
    channelId: row.channel_id,
    channel: row.channel,
    author: row.author,
    avatar: row.avatar,
    color: row.color,
    content: row.content,
    snippet: snippet ?? row.snippet ?? row.content.slice(0, 140),
    createdAt: row.created_at,
  };
}

/**
 * Ranked full-text search via FTS5, or null when FTS cannot answer.
 *
 * Returning null (rather than throwing) is what lets the caller fall back: an
 * FTS expression SQLite cannot parse, or a database where the index was never
 * built, must not fail the request when a plain scan can still answer it.
 */
async function ftsSearch(
  db: D1Database,
  text: string,
  channelId: string | null | undefined,
  filterSql: string,
  filterParams: unknown[],
  limit: number,
): Promise<SearchResultItem[] | null> {
  try {
    // Escape FTS5 special punctuation syntax to prevent query syntax errors
    const match = text
      .replace(/["*^]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"*`)
      .join(" ");
    if (!match) return null;

    let sql = `
      SELECT m.id, m.channel, m.channel_id, m.author, m.avatar, m.color, m.content, m.created_at,
             snippet(messages_fts, 3, '<mark>', '</mark>', '...', 20) AS snippet
        FROM messages_fts
        JOIN messages m ON m.id = messages_fts.id
       WHERE messages_fts MATCH ?
         AND m.deleted_at IS NULL`;
    const params: unknown[] = [match];

    if (channelId) {
      sql += " AND (m.channel_id = ? OR m.channel = ?)";
      params.push(channelId, channelId);
    }

    sql += filterSql;
    params.push(...filterParams);
    sql += " ORDER BY rank LIMIT ?";
    params.push(limit);

    const rows = await db.prepare(sql).bind(...params).all<SearchRow>();
    return (rows.results || []).map((row) => toResult(row));
  } catch {
    return null;
  }
}

/**
 * Unranked fallback scan.
 *
 * `text` is the operator-stripped query, not the raw input: matching the raw
 * string would search for the literal text `from:alice`.
 */
async function likeSearch(
  db: D1Database,
  text: string,
  channelId: string | null | undefined,
  filterSql: string,
  filterParams: unknown[],
  limit: number,
): Promise<SearchResultItem[]> {
  let sql = `
      SELECT m.id, m.channel, m.channel_id, m.author, m.avatar, m.color, m.content, m.created_at
        FROM messages m
       WHERE m.deleted_at IS NULL`;
  const params: unknown[] = [];

  if (text) {
    sql += " AND m.content LIKE ?";
    params.push(`%${text}%`);
  }

  if (channelId) {
    sql += " AND (m.channel_id = ? OR m.channel = ?)";
    params.push(channelId, channelId);
  }

  sql += filterSql;
  params.push(...filterParams);
  sql += " ORDER BY m.created_at DESC LIMIT ?";
  params.push(limit);

  const rows = await db.prepare(sql).bind(...params).all<SearchRow>();
  return (rows.results || []).map((row) => toResult(row));
}

