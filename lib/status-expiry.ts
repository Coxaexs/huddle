/**
 * Custom statuses that clear themselves ("clear after 1 hour"). The time is
 * kept on the user row; the hub's alarm clears what is due and tells everyone
 * to refresh that member.
 */

/** The longest a status may be set to last before clearing: a week. */
export const MAX_STATUS_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export async function nextStatusExpiryAlarm(db: D1Database): Promise<number | null> {
  const row = await db
    .prepare("SELECT MIN(custom_status_expires_at) AS due FROM users WHERE custom_status_expires_at IS NOT NULL")
    .first<{ due: number | null }>();
  return row?.due ?? null;
}

/** Clears every status that is due and returns whose. */
export async function clearExpiredStatuses(db: D1Database, now = Date.now()): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT id FROM users WHERE custom_status_expires_at IS NOT NULL AND custom_status_expires_at <= ?")
    .bind(now)
    .all<{ id: string }>();
  if (!results?.length) return [];
  await db
    .prepare(
      "UPDATE users SET custom_status = NULL, custom_status_expires_at = NULL WHERE custom_status_expires_at IS NOT NULL AND custom_status_expires_at <= ?",
    )
    .bind(now)
    .run();
  return results.map((row) => row.id);
}
