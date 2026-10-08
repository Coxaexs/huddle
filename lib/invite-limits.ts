/**
 * How many times one invite code may be redeemed.
 *
 * 0 means no limit. The ceiling is there so a typo cannot mint an effectively
 * unlimited code by accident; it is high enough for one code to bring in a
 * whole event.
 */
export const MAX_INVITE_USES = 1000;

/** Choices offered when making an account invite, smallest first; 0 is "no limit". */
export const INVITE_USE_CHOICES = [1, 5, 10, 25, 50, 100, 200, 500, 0] as const;

/** Any requested limit as one the server will store: a whole number in 0..MAX, 1 when missing. */
export function clampInviteUses(value: unknown): number {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number)) return 1;
  return Math.max(0, Math.min(MAX_INVITE_USES, Math.trunc(number)));
}
