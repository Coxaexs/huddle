import { canSeeServer, messageAccess } from "@/lib/access";
import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema, DM_SERVER_ID } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { stripTextStyle } from "@/lib/text-style";

export const dynamic = "force-dynamic";

/** Most messages one person can keep saved. */
const SAVED_LIMIT = 500;

async function ensureSavedTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS saved_messages (
         user_id TEXT NOT NULL,
         message_id TEXT NOT NULL,
         created_at TEXT NOT NULL,
         PRIMARY KEY (user_id, message_id)
       )`,
    )
    .run();
}

/**
 * Your saved messages, newest saved first. Anything you can no longer read
 * (deleted, or a server you left) drops out of the list on its own.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ saved: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  await ensureSavedTable(db);

  const rows = await db
    .prepare(
      `SELECT s.message_id, s.created_at AS saved_at, m.channel_id, m.author, m.avatar, m.color,
              m.content, m.created_at, m.user_id, c.name AS channel_name, c.server_id,
              srv.name AS server_name
         FROM saved_messages s
         JOIN messages m ON m.id = s.message_id AND m.deleted_at IS NULL
         LEFT JOIN channels c ON c.id = m.channel_id
         LEFT JOIN servers srv ON srv.id = c.server_id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC
        LIMIT ${SAVED_LIMIT}`,
    )
    .bind(user.id)
    .all<{
      message_id: string;
      saved_at: string;
      channel_id: string | null;
      author: string;
      avatar: string;
      color: string;
      content: string;
      created_at: string;
      user_id: string | null;
      channel_name: string | null;
      server_id: string | null;
      server_name: string | null;
    }>();

  // Re-check access per server once (cheap), and per DM via membership.
  const serverOk = new Map<string, boolean>();
  const saved = [];
  for (const row of rows.results || []) {
    if (!row.channel_id || !row.server_id) continue;
    if (row.server_id === DM_SERVER_ID) {
      const member = await db
        .prepare("SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?")
        .bind(row.channel_id, user.id)
        .first();
      if (!member) continue;
    } else {
      if (!serverOk.has(row.server_id)) {
        serverOk.set(row.server_id, await canSeeServer(db, row.server_id, user));
      }
      if (!serverOk.get(row.server_id)) continue;
    }
    saved.push({
      messageId: row.message_id,
      savedAt: row.saved_at,
      channelId: row.channel_id,
      serverId: row.server_id === DM_SERVER_ID ? null : row.server_id,
      channelName: row.server_id === DM_SERVER_ID ? null : row.channel_name,
      serverName: row.server_name,
      author: row.author,
      avatar: row.avatar,
      color: row.color,
      text: stripTextStyle(row.content).slice(0, 300),
      createdAt: row.created_at,
    });
  }
  return Response.json({ saved });
}

/** Saves a message you can read. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  await ensureSavedTable(db);
  const body = (await request.json().catch(() => ({}))) as { messageId?: string };
  const messageId = body.messageId?.slice(0, 64) || "";
  const access = await messageAccess(db, messageId, user);
  if (!access.ok) return access.response;
  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM saved_messages WHERE user_id = ?")
    .bind(user.id)
    .first<{ count: number }>();
  if ((count?.count ?? 0) >= SAVED_LIMIT) {
    return Response.json({ error: "You have 500 saved messages; remove some first." }, { status: 400 });
  }
  await db
    .prepare("INSERT OR IGNORE INTO saved_messages (user_id, message_id, created_at) VALUES (?, ?, ?)")
    .bind(user.id, messageId, new Date().toISOString())
    .run();
  return Response.json({ ok: true, saved: true });
}

/** Removes a message from your saved list. */
export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSavedTable(db);
  const messageId = new URL(request.url).searchParams.get("messageId") || "";
  await db
    .prepare("DELETE FROM saved_messages WHERE user_id = ? AND message_id = ?")
    .bind(user.id, messageId)
    .run();
  return Response.json({ ok: true, saved: false });
}
