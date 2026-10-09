/**
 * /remind: personal reminders.
 *
 * A reminder is stored here and delivered by the hub's alarm (the same one
 * that sends event reminders), so it arrives even when the person is offline:
 * as a message in their own Notes conversation, plus a push notification.
 */
import { findOrCreateDm, reopenDmForAll } from "./dms";
import { sendPushNotifications } from "./push";

/** Longest a reminder may wait, and how many one person may have pending. */
export const REMINDER_MAX_MS = 366 * 86_400_000;
export const REMINDER_MAX_PENDING = 50;

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 7 * 86_400_000,
};

/**
 * Parses "<when> <what>". When is a duration ("10m", "1h30m", "2d") or a
 * clock time ("18:30", "tomorrow 9:00") in the writer's own time zone, given
 * as `timezoneOffset` (minutes, as Date#getTimezoneOffset reports it).
 */
export function parseReminder(
  spec: string,
  now: number,
  timezoneOffset = 0,
): { dueAt: number; text: string } | { error: string } {
  const words = spec.trim().split(/\s+/).filter(Boolean);
  const usage = "Try /remind 20m take the pizza out, or /remind 18:30 call mum.";
  if (!words.length) return { error: usage };

  let dueAt: number | null = null;
  let used = 0;
  const duration = words[0].toLowerCase().match(/^(?:\d+[smhdw])+$/);
  if (duration) {
    let total = 0;
    for (const [, amount, unit] of words[0].toLowerCase().matchAll(/(\d+)([smhdw])/g)) {
      total += Number(amount) * UNIT_MS[unit];
    }
    dueAt = now + total;
    used = 1;
  } else {
    let tomorrow = false;
    let index = 0;
    if (words[0].toLowerCase() === "tomorrow") {
      tomorrow = true;
      index = 1;
    }
    const clock = words[index]?.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/i);
    if (clock && (clock[2] !== undefined || clock[3] !== undefined)) {
      let hours = Number(clock[1]);
      const minutes = Number(clock[2] ?? 0);
      const meridiem = clock[3]?.toLowerCase();
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      if (hours > 23 || minutes > 59) return { error: usage };
      // Work in the writer's local clock, then convert back to UTC.
      const local = new Date(now - timezoneOffset * 60_000);
      local.setUTCHours(hours, minutes, 0, 0);
      let candidate = local.getTime() + timezoneOffset * 60_000;
      if (tomorrow) candidate += 86_400_000;
      else if (candidate <= now) candidate += 86_400_000;
      dueAt = candidate;
      used = index + 1;
    }
  }

  if (dueAt === null) return { error: usage };
  const text = words.slice(used).join(" ").trim().slice(0, 300);
  if (!text) return { error: "What should I remind you about? " + usage };
  if (dueAt - now < 10_000) return { error: "Give it at least ten seconds." };
  if (dueAt - now > REMINDER_MAX_MS) return { error: "Reminders can be at most a year away." };
  return { dueAt, text };
}

export async function ensureReminderTable(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        channel_id TEXT,
        text TEXT NOT NULL,
        due_at INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        sent_at TEXT
      )`),
    db.prepare("CREATE INDEX IF NOT EXISTS reminders_due_idx ON reminders(sent_at, due_at)"),
  ]);
}

/** When the next unsent reminder falls due, or null. */
export async function nextReminderAlarm(db: D1Database): Promise<number | null> {
  await ensureReminderTable(db);
  const row = await db
    .prepare("SELECT MIN(due_at) AS due FROM reminders WHERE sent_at IS NULL")
    .first<{ due: number | null }>();
  return row?.due ?? null;
}

/**
 * Sends every reminder that is due: a message in the person's Notes and a
 * push. Returns the messages posted, so the hub can show them live.
 */
export async function deliverDueReminders(
  db: D1Database,
  now = Date.now(),
): Promise<Array<{ userId: string; channelId: string; message: Record<string, unknown> }>> {
  await ensureReminderTable(db);
  const due = await db
    .prepare(
      `SELECT r.id, r.user_id, r.channel_id, r.text, c.name AS channel_name
         FROM reminders r LEFT JOIN channels c ON c.id = r.channel_id
        WHERE r.sent_at IS NULL AND r.due_at <= ? LIMIT 100`,
    )
    .bind(now)
    .all<{ id: string; user_id: string; channel_id: string | null; text: string; channel_name: string | null }>();
  const delivered: Array<{ userId: string; channelId: string; message: Record<string, unknown> }> = [];
  for (const reminder of due.results || []) {
    // Claim it first, so a second alarm firing at once cannot send it twice.
    const claimed = await db
      .prepare("UPDATE reminders SET sent_at = ? WHERE id = ? AND sent_at IS NULL")
      .bind(new Date(now).toISOString(), reminder.id)
      .run();
    if (!claimed.meta.changes) continue;
    const notes = await findOrCreateDm(db, reminder.user_id, reminder.user_id);
    // A Notes conversation someone closed comes back for the reminder.
    await reopenDmForAll(db, notes).catch(() => undefined);
    const where =
      reminder.channel_name && reminder.channel_name !== "direct message"
        ? ` (from #${reminder.channel_name})`
        : "";
    const message = {
      id: crypto.randomUUID(),
      channelId: notes,
      userId: null,
      author: "Reminder",
      avatar: "⏰",
      color: "#f59e6e",
      text: `⏰ ${reminder.text}${where}`,
      bot: true,
      createdAt: new Date(now).toISOString(),
      time: "",
    };
    await db
      .prepare(
        `INSERT INTO messages
         (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key, is_bot, created_at, sender_id)
         VALUES (?, 'direct message', ?, NULL, ?, ?, ?, ?, NULL, 1, ?, ?)`,
      )
      .bind(
        message.id,
        notes,
        message.author,
        message.avatar,
        message.color,
        message.text,
        message.createdAt,
        reminder.user_id,
      )
      .run();
    await sendPushNotifications(db, [reminder.user_id], {
      title: "⏰ Reminder",
      body: reminder.text.slice(0, 120),
      url: "/hangout",
      tag: `reminder-${reminder.id}`,
    }).catch(() => undefined);
    delivered.push({ userId: reminder.user_id, channelId: notes, message });
  }
  return delivered;
}
