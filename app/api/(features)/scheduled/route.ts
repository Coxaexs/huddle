import { channelAccess } from "@/lib/access";
import { currentUser, unauthorized } from "@/lib/auth";
import { publishEventsChanged } from "@/lib/hub-client";
import { limitUser } from "@/lib/rate-limit";
import {
  SCHEDULE_MAX_PENDING,
  ensureScheduledTable,
  parseScheduled,
} from "@/lib/scheduled";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const SCHEDULE_RATE_LIMIT = { action: "schedule", limit: 10, windowSeconds: 60 };

/** Your scheduled messages that have not gone out yet, soonest first. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ scheduled: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  await ensureScheduledTable(db);
  const rows = await db
    .prepare(
      `SELECT s.id, s.channel_id, s.text, s.due_at, c.name AS channel_name
         FROM scheduled_messages s LEFT JOIN channels c ON c.id = s.channel_id
        WHERE s.user_id = ? AND s.sent_at IS NULL ORDER BY s.due_at`,
    )
    .bind(user.id)
    .all<{ id: string; channel_id: string; text: string; due_at: number; channel_name: string | null }>();
  return Response.json({
    scheduled: (rows.results || []).map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      text: row.text,
      dueAt: new Date(row.due_at).toISOString(),
    })),
  });
}

/** /schedule <when> <message> */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  await ensureScheduledTable(db);
  const limited = await limitUser(db, SCHEDULE_RATE_LIMIT, user.id);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as {
    spec?: string;
    channelId?: string;
    threadId?: string | null;
    timezoneOffset?: number;
  };
  // Checked now for a quick answer, and again when it is posted.
  const access = await channelAccess(db, String(body.channelId || ""), user);
  if (!access.ok) return access.response;

  const offset = Number(body.timezoneOffset);
  const parsed = parseScheduled(
    String(body.spec || "").slice(0, 2200),
    Date.now(),
    Number.isFinite(offset) && Math.abs(offset) <= 14 * 60 ? offset : 0,
  );
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  const pending = await db
    .prepare("SELECT COUNT(*) AS count FROM scheduled_messages WHERE user_id = ? AND sent_at IS NULL")
    .bind(user.id)
    .first<{ count: number }>();
  if ((pending?.count ?? 0) >= SCHEDULE_MAX_PENDING) {
    return Response.json(
      { error: `You already have ${SCHEDULE_MAX_PENDING} scheduled messages waiting.` },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO scheduled_messages (id, user_id, channel_id, thread_id, text, due_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      user.id,
      access.channel.id,
      body.threadId?.slice(0, 64) || null,
      parsed.text,
      parsed.dueAt,
      new Date().toISOString(),
    )
    .run();
  // The hub re-arms its alarm for whatever is due next.
  await publishEventsChanged();
  return Response.json(
    { id, dueAt: new Date(parsed.dueAt).toISOString(), text: parsed.text },
    { status: 201 },
  );
}

/** Cancels one of your scheduled messages. */
export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureScheduledTable(db);
  const id = new URL(request.url).searchParams.get("id") || "";
  const result = await db
    .prepare("DELETE FROM scheduled_messages WHERE id = ? AND user_id = ? AND sent_at IS NULL")
    .bind(id, user.id)
    .run();
  return Response.json({ ok: Boolean(result.meta.changes) });
}
