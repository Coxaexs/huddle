/**
 * Timeouts: a moderator can stop a member posting, reacting, voting and
 * speaking in one server until a set time. They can still read.
 */

/** Durations offered in the menu, in minutes. */
export const TIMEOUT_CHOICES = [
  { minutes: 1, label: "60 seconds" },
  { minutes: 5, label: "5 minutes" },
  { minutes: 10, label: "10 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 60 * 24, label: "1 day" },
  { minutes: 60 * 24 * 7, label: "1 week" },
] as const;

/** Longest timeout, matching Discord's 28 days. */
export const MAX_TIMEOUT_MINUTES = 60 * 24 * 28;

/** The ISO end time when `until` is still in the future, else null. */
export function activeUntil(until: string | null | undefined, now = Date.now()): string | null {
  if (!until) return null;
  const end = Date.parse(until);
  return Number.isFinite(end) && end > now ? until : null;
}

/** When a member's timeout in the server owning `channelId` ends, if one is running. */
export async function timeoutInChannel(
  db: D1Database,
  channelId: string,
  userId: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT m.timeout_until FROM channels c
         JOIN server_members m ON m.server_id = c.server_id AND m.user_id = ?
        WHERE c.id = ?`,
    )
    .bind(userId, channelId)
    .first<{ timeout_until: string | null }>();
  return activeUntil(row?.timeout_until);
}

/** The 403 a timed-out member gets, carrying the end time for the UI. */
export function timedOutResponse(until: string): Response {
  return Response.json(
    { error: "You are timed out in this server.", timeoutUntil: until },
    { status: 403 },
  );
}

/** Convenience for routes: a ready 403 when timed out in that channel's server. */
export async function blockIfTimedOut(
  db: D1Database,
  channelId: string | null | undefined,
  userId: string,
): Promise<Response | null> {
  if (!channelId) return null;
  const until = await timeoutInChannel(db, channelId, userId);
  return until ? timedOutResponse(until) : null;
}
