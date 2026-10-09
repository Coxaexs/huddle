import { currentUser, unauthorized } from "@/lib/auth";
import { publishEventsChanged } from "@/lib/hub-client";
import { limitUser } from "@/lib/rate-limit";
import {
  REMINDER_MAX_PENDING,
  ensureReminderTable,
  parseReminder,
} from "@/lib/reminders";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const REMINDER_RATE_LIMIT = { action: "remind", limit: 10, windowSeconds: 60 };

/** Your pending reminders, soonest first. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ reminders: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  await ensureReminderTable(db);
  const rows = await db
    .prepare(
      "SELECT id, text, due_at FROM reminders WHERE user_id = ? AND sent_at IS NULL ORDER BY due_at",
    )
    .bind(user.id)
    .all<{ id: string; text: string; due_at: number }>();
  return Response.json({
    reminders: (rows.results || []).map((row) => ({
      id: row.id,
      text: row.text,
      dueAt: new Date(row.due_at).toISOString(),
    })),
  });
}

/** /remind <when> <what> */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  await ensureReminderTable(db);
  const limited = await limitUser(db, REMINDER_RATE_LIMIT, user.id);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as {
    spec?: string;
    channelId?: string | null;
    timezoneOffset?: number;
  };
  const offset = Number(body.timezoneOffset);
  const parsed = parseReminder(
    String(body.spec || "").slice(0, 400),
    Date.now(),
    Number.isFinite(offset) && Math.abs(offset) <= 14 * 60 ? offset : 0,
  );
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  const pending = await db
    .prepare("SELECT COUNT(*) AS count FROM reminders WHERE user_id = ? AND sent_at IS NULL")
    .bind(user.id)
    .first<{ count: number }>();
  if ((pending?.count ?? 0) >= REMINDER_MAX_PENDING) {
    return Response.json({ error: "You already have 50 reminders waiting." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO reminders (id, user_id, channel_id, text, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      user.id,
      body.channelId?.slice(0, 64) || null,
      parsed.text,
      parsed.dueAt,
      new Date().toISOString(),
    )
    .run();
  // The hub re-arms its alarm for whichever reminder or event is next.
  await publishEventsChanged();
  return Response.json({ id, dueAt: new Date(parsed.dueAt).toISOString(), text: parsed.text }, { status: 201 });
}

/** Cancels one of your pending reminders. */
export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureReminderTable(db);
  const id = new URL(request.url).searchParams.get("id") || "";
  await db
    .prepare("DELETE FROM reminders WHERE id = ? AND user_id = ? AND sent_at IS NULL")
    .bind(id, user.id)
    .run();
  return Response.json({ ok: true });
}
