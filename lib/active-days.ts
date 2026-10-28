/**
 * One row per person per UTC day they used Hoffle (`user_active_days`), so the
 * admin Growth tab can tell who came back. `last_seen_at` only keeps the latest
 * visit, which can't answer that.
 */

/** Days this isolate has already written, so a busy tab writes once a day. */
const written = new Map<string, string>();

/** The UTC day of a moment, as YYYY-MM-DD. */
export function utcDay(at: Date | string): string {
  return (typeof at === "string" ? new Date(at) : at).toISOString().slice(0, 10);
}

/** Records that a person used Hoffle today. Never throws. */
export async function markActiveDay(db: D1Database, userId: string, at = new Date()): Promise<void> {
  const day = utcDay(at);
  if (written.get(userId) === day) return;
  written.set(userId, day);
  try {
    await db.prepare("INSERT OR IGNORE INTO user_active_days (user_id, day) VALUES (?, ?)").bind(userId, day).run();
  } catch {
    written.delete(userId);
  }
}

/** For tests: forget which days were written. */
export function resetActiveDayCache(): void {
  written.clear();
}
