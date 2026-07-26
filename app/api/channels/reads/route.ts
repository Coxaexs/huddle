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

  const [reads, lastMessages, mentions, dmMemberships] = await Promise.all([
    db
      .prepare("SELECT channel_id, read_at FROM channel_reads WHERE user_id = ?")
      .bind(user.id)
      .all(),
    db
      .prepare(
        `SELECT channel_id, MAX(created_at) AS last_at
           FROM messages
          WHERE channel_id IS NOT NULL AND deleted_at IS NULL
          GROUP BY channel_id`,
      )
      .all(),
    db
      .prepare(
        "SELECT channel_id, created_at FROM mentions WHERE user_id = ?",
      )
      .bind(user.id)
      .all(),
    db
      .prepare("SELECT channel_id FROM dm_members WHERE user_id = ?")
      .bind(user.id)
      .all(),
  ]);

  const readAt = new Map<string, string>();
  for (const row of (reads.results || []) as Array<{
    channel_id: string;
    read_at: string;
  }>) {
    readAt.set(row.channel_id, row.read_at);
  }
  const lastAt = new Map<string, string>();
  for (const row of (lastMessages.results || []) as Array<{
    channel_id: string;
    last_at: string;
  }>) {
    lastAt.set(row.channel_id, row.last_at);
  }
  const dmChannels = new Set(
    ((dmMemberships.results || []) as Array<{ channel_id: string }>).map(
      (r) => r.channel_id,
    ),
  );

  const result: Record<string, { unread: boolean; mentions: number }> = {};
  const ensure = (id: string) => (result[id] ||= { unread: false, mentions: 0 });

  for (const [channelId, last] of lastAt) {
    const seen = readAt.get(channelId);
    if (!seen || last > seen) ensure(channelId).unread = true;
  }
  for (const row of (mentions.results || []) as Array<{
    channel_id: string;
    created_at: string;
  }>) {
    const seen = readAt.get(row.channel_id);
    if (!seen || row.created_at > seen) {
      const entry = ensure(row.channel_id);
      entry.mentions += 1;
      entry.unread = true;
    }
  }

  // DM channels the user isn't a member of should never leak in.
  for (const id of Object.keys(result)) {
    if (!lastAt.has(id)) delete result[id];
  }
  void dmChannels;

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
