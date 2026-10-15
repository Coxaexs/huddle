/**
 * New accounts that came in through open signup start with fewer abilities for
 * their first day, so a bot that makes accounts in bulk cannot spend them on
 * spam. People who joined with an invite (a person vouched for them) and
 * accounts that predate open signup are never restricted.
 */

import { isInstanceAdmin, type User } from "./auth";

export const NEW_ACCOUNT_HOURS = 24;

export function isRestrictedAccount(
  user: Pick<User, "id" | "is_admin" | "created_at" | "signup_source">,
  now: number = Date.now(),
): boolean {
  if (user.signup_source !== "open") return false;
  if (isInstanceAdmin(user)) return false;
  const created = Date.parse(user.created_at);
  return Number.isFinite(created) && now - created < NEW_ACCOUNT_HOURS * 3_600_000;
}
