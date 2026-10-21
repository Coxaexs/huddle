/**
 * How many times one invite code may be redeemed.
 *
 * A new code always has a limit: 1 to MAX_INVITE_USES, so a typo or a client
 * sending 0 cannot mint a code that never runs out. Older codes stored with 0
 * ("no limit") still work, they just cannot be made any more; the redeem
 * paths keep treating 0 as unlimited for those rows.
 */
export const MAX_INVITE_USES = 1000;

/**
 * Server invites made in one click (the invite dialog, Server Settings) are
 * for a whole group chat. Asking for 0 got 1 use, so the second friend to tap
 * a group's link found it expired.
 */
export const GROUP_INVITE_USES = 100;

/** Choices offered when making an account invite, smallest first. */
export const INVITE_USE_CHOICES = [1, 5, 10, 25, 50, 100, 200, 500, 1000] as const;

/** Any requested limit as one the server will store: a whole number in 1..MAX, 1 when missing. */
export function clampInviteUses(value: unknown): number {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(MAX_INVITE_USES, Math.trunc(number)));
}
