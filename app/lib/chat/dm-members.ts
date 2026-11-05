import { memberFromPublicUser, type Member, type PublicUser } from "@/lib/users";
import type { DmSummary } from "./types";

/**
 * Who is in the open conversation, for the member list and @-mentions: you,
 * then the other person, or everyone in a group. Notes to self is just you.
 * Everyone keeps their full profile, so their cards match the server ones.
 */
export function dmMemberList(
  user: PublicUser,
  activeDm: DmSummary | null,
  now = new Date().toISOString(),
): Member[] {
  const me = memberFromPublicUser(user, now);
  if (!activeDm) return [me];
  if (activeDm.group) {
    return activeDm.group.members.map((member) => (member.id === user.id ? me : member));
  }
  if (activeDm.user.id === user.id) return [me];
  return [me, { ...activeDm.user, lastSeenAt: activeDm.user.lastSeenAt || now }];
}
