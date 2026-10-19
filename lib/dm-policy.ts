/**
 * Who may start a new conversation with someone. Existing conversations keep
 * working whatever the setting says, as on Discord: the setting decides who
 * can reach you, not who you have already talked to.
 */

export const DM_POLICIES = ["everyone", "servers", "friends"] as const;
export type DmPolicy = (typeof DM_POLICIES)[number];

export function normalizeDmPolicy(value: unknown): DmPolicy {
  return DM_POLICIES.includes(value as DmPolicy) ? (value as DmPolicy) : "everyone";
}

/** Whether a policy lets someone in, given how the two people know each other. */
export function dmPolicyAllows(
  policy: DmPolicy,
  relation: { friends: boolean; shareServer: boolean },
): boolean {
  if (policy === "everyone") return true;
  if (relation.friends) return true;
  return policy === "servers" && relation.shareServer;
}

export async function dmPolicyOf(db: D1Database, userId: string): Promise<DmPolicy> {
  const row = await db
    .prepare("SELECT dm_policy FROM users WHERE id = ?")
    .bind(userId)
    .first<{ dm_policy: string | null }>()
    .catch(() => null);
  return normalizeDmPolicy(row?.dm_policy);
}

/**
 * Whether `fromId` may open a new conversation with `toId`. Instance admins
 * always can, so moderation can still reach anyone.
 */
export async function mayStartDm(
  db: D1Database,
  from: { id: string; is_admin?: number },
  toId: string,
): Promise<boolean> {
  if (from.id === toId || from.is_admin) return true;
  const policy = await dmPolicyOf(db, toId);
  if (policy === "everyone") return true;
  const row = await db
    .prepare(
      `SELECT
         EXISTS (SELECT 1 FROM friendships
                  WHERE status = 'accepted'
                    AND ((user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1))) AS friends,
         EXISTS (SELECT 1 FROM server_members a
                   JOIN server_members b ON b.server_id = a.server_id
                  WHERE a.user_id = ?1 AND b.user_id = ?2) AS share_server`,
    )
    .bind(from.id, toId)
    .first<{ friends: number; share_server: number }>();
  return dmPolicyAllows(policy, {
    friends: Boolean(row?.friends),
    shareServer: Boolean(row?.share_server),
  });
}

/** Deliberately vague, so it doesn't tell a stranger which setting they hit. */
export const DM_POLICY_REFUSAL = "This person isn't accepting new messages from you. Try adding them as a friend.";
