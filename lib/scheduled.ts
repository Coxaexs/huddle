/**
 * /schedule: messages written now and posted later, as you.
 *
 * Stored here and posted by the hub's alarm (the same one that sends
 * reminders) through postMessageAs, so a scheduled message passes exactly the
 * checks a typed one does at the moment it goes out: if you have left the
 * server, been banned or timed out by then, it is not posted and your Notes
 * say why.
 */
import { postMessageAs, type PostOptions } from "../app/api/messages/route";
import { userColumns, type User } from "./auth";
import { noteToSelf, parseReminder } from "./reminders";

export const SCHEDULE_MAX_PENDING = 25;
export const SCHEDULE_TEXT_LIMIT = 2000;
export const SCHEDULE_USAGE = "Try /schedule 20:00 Doors are open!, or /schedule 2h see you all soon.";

/** "<when> <message>", the same times /remind understands. */
export function parseScheduled(spec: string, now: number, timezoneOffset = 0) {
  return parseReminder(spec, now, timezoneOffset, {
    maxText: SCHEDULE_TEXT_LIMIT,
    usage: SCHEDULE_USAGE,
  });
}

export async function ensureScheduledTable(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS scheduled_messages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        thread_id TEXT,
        text TEXT NOT NULL,
        due_at INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        sent_at TEXT,
        message_id TEXT,
        error TEXT
      )`),
    db.prepare("CREATE INDEX IF NOT EXISTS scheduled_due_idx ON scheduled_messages(sent_at, due_at)"),
  ]);
}

/** When the next unsent scheduled message falls due, or null. */
export async function nextScheduledAlarm(db: D1Database): Promise<number | null> {
  await ensureScheduledTable(db);
  const row = await db
    .prepare("SELECT MIN(due_at) AS due FROM scheduled_messages WHERE sent_at IS NULL")
    .first<{ due: number | null }>();
  return row?.due ?? null;
}

/**
 * Posts every scheduled message that is due. Failures land in the writer's
 * Notes; those notes are returned so the hub can show them live.
 */
export async function deliverDueScheduled(
  db: D1Database,
  options: PostOptions,
  now = Date.now(),
): Promise<Array<{ userId: string; channelId: string; message: Record<string, unknown> }>> {
  await ensureScheduledTable(db);
  const due = await db
    .prepare(
      `SELECT s.id, s.user_id, s.channel_id, s.thread_id, s.text, c.name AS channel_name
         FROM scheduled_messages s LEFT JOIN channels c ON c.id = s.channel_id
        WHERE s.sent_at IS NULL AND s.due_at <= ? ORDER BY s.due_at LIMIT 50`,
    )
    .bind(now)
    .all<{
      id: string;
      user_id: string;
      channel_id: string;
      thread_id: string | null;
      text: string;
      channel_name: string | null;
    }>();
  const notes: Array<{ userId: string; channelId: string; message: Record<string, unknown> }> = [];
  for (const item of due.results || []) {
    // Claim it first, so a second alarm firing at once cannot post it twice.
    const claimed = await db
      .prepare("UPDATE scheduled_messages SET sent_at = ? WHERE id = ? AND sent_at IS NULL")
      .bind(new Date(now).toISOString(), item.id)
      .run();
    if (!claimed.meta.changes) continue;

    const user = await db
      .prepare(`SELECT ${userColumns()} FROM users WHERE id = ?`)
      .bind(item.user_id)
      .first<User>();
    if (!user) continue;

    let error: string | null = null;
    let messageId: string | null = null;
    try {
      const response = await postMessageAs(
        db,
        user,
        { channelId: item.channel_id, threadId: item.thread_id || undefined, content: item.text },
        options,
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: { id?: string };
      };
      if (response.ok) messageId = data.message?.id || null;
      else error = data.error || `It was refused (${response.status}).`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Something went wrong.";
    }
    await db
      .prepare("UPDATE scheduled_messages SET message_id = ?, error = ? WHERE id = ?")
      .bind(messageId, error, item.id)
      .run();
    if (error) {
      const where = item.channel_name ? ` to #${item.channel_name}` : "";
      const note = await noteToSelf(
        db,
        item.user_id,
        `⏰ Your scheduled message${where} was not sent: ${error}\n> ${item.text.slice(0, 300)}`,
        now,
      ).catch(() => null);
      if (note) notes.push({ userId: item.user_id, ...note });
    }
  }
  return notes;
}
