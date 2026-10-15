/**
 * A daily upload budget per account. The per-minute request limit alone still
 * lets one account push over a gigabyte a minute onto the host's disk; this
 * caps what a day can add up to.
 */

import { isInstanceAdmin, type User } from "./auth";
import { isRestrictedAccount } from "./trust";

const MB = 1024 * 1024;
/** Accounts in their first day of open signup. */
export const RESTRICTED_DAILY_UPLOAD_BYTES = 50 * MB;
export const DAILY_UPLOAD_BYTES = 1024 * MB;

export function dailyUploadLimit(user: User): number | null {
  if (isInstanceAdmin(user)) return null;
  return isRestrictedAccount(user) ? RESTRICTED_DAILY_UPLOAD_BYTES : DAILY_UPLOAD_BYTES;
}

/**
 * Counts `bytes` against today's budget. Returns a ready 413 when it would go
 * over, or null to carry on. The check and the add are separate statements, so
 * two parallel uploads can overshoot by one file; that is fine for a budget.
 */
export async function consumeUploadQuota(
  db: D1Database | undefined,
  user: User,
  bytes: number,
  now: number = Date.now(),
): Promise<Response | null> {
  const limit = dailyUploadLimit(user);
  if (!db || limit === null) return null;
  const day = new Date(now).toISOString().slice(0, 10);

  const used = await db
    .prepare("SELECT bytes FROM upload_usage WHERE user_id = ? AND day = ?")
    .bind(user.id, day)
    .first<{ bytes: number }>();
  if ((used?.bytes ?? 0) + bytes > limit) {
    const megabytes = Math.round(limit / MB);
    return Response.json(
      { error: `That is over today's upload limit of ${megabytes} MB. Try again tomorrow.` },
      { status: 413 },
    );
  }
  await db
    .prepare(
      `INSERT INTO upload_usage (user_id, day, bytes) VALUES (?1, ?2, ?3)
         ON CONFLICT(user_id, day) DO UPDATE SET bytes = bytes + ?3`,
    )
    .bind(user.id, day, bytes)
    .run();
  if (!used) {
    // First upload of the day: drop budgets older than a week.
    const cutoff = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
    await db.prepare("DELETE FROM upload_usage WHERE day < ?").bind(cutoff).run().catch(() => {});
  }
  return null;
}
