/**
 * Server verification levels: what an account needs before it may post in a
 * server. Modelled on Discord's, minus "verified phone", which Hoffle does not
 * collect. Owners, instance admins and anyone holding a role are never held
 * back, so a moderator can let someone through by giving them a role.
 */

import type { User } from "./auth";

export const VERIFICATION_LEVELS = [0, 1, 2, 3] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

/** Low and up: the account has a verified email address. */
export const LEVEL_EMAIL = 1;
/** Medium and up: the account is at least this old. */
export const ACCOUNT_AGE_MINUTES = 5;
/** High: the account has been a member of this server at least this long. */
export const MEMBERSHIP_MINUTES = 10;

export function clampVerificationLevel(value: unknown): VerificationLevel {
  const level = Math.trunc(Number(value));
  return level >= 0 && level <= 3 ? (level as VerificationLevel) : 0;
}

export type VerificationShortfall = "email" | "account-age" | "membership-age";

/**
 * The first requirement this account still misses at `level`, or null when it
 * may post. Pure, so the rules are testable without a database.
 */
export function verificationShortfall(
  level: number,
  account: { emailVerified: boolean; createdAt: string | null; joinedAt: string | null },
  now = Date.now(),
): VerificationShortfall | null {
  if (level >= LEVEL_EMAIL && !account.emailVerified) return "email";
  const olderThan = (iso: string | null, minutes: number) => {
    const at = iso ? Date.parse(iso) : NaN;
    // An unknown date predates the column that would have recorded it.
    return !Number.isFinite(at) || now - at >= minutes * 60_000;
  };
  if (level >= 2 && !olderThan(account.createdAt, ACCOUNT_AGE_MINUTES)) return "account-age";
  if (level >= 3 && !olderThan(account.joinedAt, MEMBERSHIP_MINUTES)) return "membership-age";
  return null;
}

const SHORTFALL_TEXT: Record<VerificationShortfall, string> = {
  email: "This server needs a verified email before you can post. Add one in Settings → My Account.",
  "account-age": `This server needs accounts to be at least ${ACCOUNT_AGE_MINUTES} minutes old before they post.`,
  "membership-age": `This server needs you to be a member for ${MEMBERSHIP_MINUTES} minutes before you post.`,
};

/** A ready 403 when `user` may not post in `serverId` yet, else null. */
export async function blockIfUnverified(
  db: D1Database,
  serverId: string,
  user: User,
): Promise<Response | null> {
  if (user.is_admin) return null;
  const row = await db
    .prepare(
      `SELECT s.verification_level AS level, s.created_by AS owner, m.joined_at,
              EXISTS (SELECT 1 FROM member_roles r WHERE r.server_id = s.id AND r.user_id = ?2) AS has_role
         FROM servers s
         LEFT JOIN server_members m ON m.server_id = s.id AND m.user_id = ?2
        WHERE s.id = ?1`,
    )
    .bind(serverId, user.id)
    .first<{ level: number | null; owner: string | null; joined_at: string | null; has_role: number }>();
  if (!row || !row.level || row.owner === user.id || row.has_role) return null;
  const shortfall = verificationShortfall(row.level, {
    emailVerified: Boolean(user.email),
    createdAt: user.created_at || null,
    joinedAt: row.joined_at,
  });
  if (!shortfall) return null;
  return Response.json(
    { error: SHORTFALL_TEXT[shortfall], verification: shortfall },
    { status: 403 },
  );
}
