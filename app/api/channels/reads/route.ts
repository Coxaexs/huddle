import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Unread + mention state for the sidebar. Returns, per channel the user can see,
 * whether there are messages since they last read it and how many of those name
 * them. Small friends' app, so a few whole-table reads are cheaper than the
 * per-channel round trips they replace.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ channels: {} });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  // Unread counts per channel: messages newer than this user's read mark (or
  // every message when they have never opened it), excluding their own.
  const [counts, mentions] = await Promise.all([
    db
      .prepare(
        `SELECT m.channel_id AS channel_id, COUNT(*) AS count
           FROM messages m
           LEFT JOIN channel_reads r
             ON r.channel_id = m.channel_id AND r.user_id = ?1
          WHERE m.channel_id IS NOT NULL
            AND m.deleted_at IS NULL
            AND (m.user_id IS NULL OR m.user_id != ?1)
            AND (r.read_at IS NULL OR m.created_at > r.read_at)
          GROUP BY m.channel_id`,
      )
      .bind(user.id)
      .all(),
    db
      .prepare(
        `SELECT mn.channel_id AS channel_id, COUNT(*) AS count
           FROM mentions mn
           LEFT JOIN channel_reads r
             ON r.channel_id = mn.channel_id AND r.user_id = ?1
          WHERE mn.user_id = ?1
            AND (r.read_at IS NULL OR mn.created_at > r.read_at)
          GROUP BY mn.channel_id`,
      )
      .bind(user.id)
      .all(),
  ]);

  const result: Record<
    string,
    { unread: boolean; count: number; mentions: number }
  > = {};
  for (const row of (counts.results || []) as Array<{
    channel_id: string;
    count: number;
  }>) {
    result[row.channel_id] = { unread: true, count: row.count, mentions: 0 };
  }
  for (const row of (mentions.results || []) as Array<{
    channel_id: string;
    count: number;
  }>) {
    const entry = (result[row.channel_id] ||= {
      unread: true,
      count: 0,
      mentions: 0,
    });
    entry.mentions = row.count;
    entry.unread = true;
  }

  return Response.json({ channels: result });
}

/** Mark a channel read up to now. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { channelId?: string };
  const channelId = body.channelId?.slice(0, 64);
  if (!channelId) return Response.json({ error: "Which channel?" }, { status: 400 });

  await db
    .prepare(
      "INSERT OR REPLACE INTO channel_reads (user_id, channel_id, read_at) VALUES (?, ?, ?)",
    )
    .bind(user.id, channelId, new Date().toISOString())
    .run();

  return Response.json({ ok: true });
}
