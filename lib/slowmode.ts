/**
 * Channel slowmode: after posting in a channel, a member waits this many
 * seconds before posting there again. Thread replies are not counted, and
 * anyone who can manage messages or channels is exempt, as on Discord.
 */

/** Longest cooldown the channel settings accept, in seconds. */
export const MAX_SLOWMODE_SECONDS = 300;

/** Whole seconds still to wait after a post at `lastIso`; 0 when free to post. */
export function slowmodeRemaining(
  lastIso: string | null | undefined,
  seconds: number,
  now = Date.now(),
): number {
  if (!seconds || !lastIso) return 0;
  const last = Date.parse(lastIso);
  if (!Number.isFinite(last)) return 0;
  return Math.max(0, Math.ceil((last + seconds * 1000 - now) / 1000));
}

/**
 * Seconds `userId` must still wait before posting in `channelId`. Deleted
 * messages still count, so deleting a post cannot skip the cooldown.
 */
export async function slowmodeWait(
  db: D1Database,
  channelId: string,
  userId: string,
  seconds: number,
): Promise<number> {
  if (!seconds) return 0;
  const last = await db
    .prepare(
      `SELECT created_at FROM messages
        WHERE user_id = ? AND channel_id = ? AND thread_id IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(userId, channelId)
    .first<{ created_at: string }>();
  return slowmodeRemaining(last?.created_at, seconds);
}

/** The 429 a member in cooldown gets, with the wait for the UI. */
export function slowmodeResponse(wait: number): Response {
  return Response.json(
    {
      error: `Slowmode is on in this channel. You can send another message in ${wait}s.`,
      slowmodeWait: wait,
    },
    { status: 429, headers: { "Retry-After": String(wait) } },
  );
}
