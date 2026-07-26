/**
 * Role permissions for Huddle servers.
 *
 * Permissions are a small bitmask stored on `roles.permissions`. A member's
 * effective permissions are the OR of every role they hold in that server, plus
 * an implicit everything for the server owner (`servers.created_by`) and for any
 * global admin (`users.is_admin`, the first account). `ADMINISTRATOR` on any
 * role also implies everything.
 *
 * The four groups mirror what the UI offers when editing a role.
 */

export const Permission = {
  /** Everything. Implies all other flags. */
  ADMINISTRATOR: 1 << 0,
  /** Create, rename, delete and reorder channels and categories. */
  MANAGE_CHANNELS: 1 << 1,
  /** Delete anyone's messages; server-mute/deafen people in voice. */
  MODERATE: 1 << 2,
  /** Edit the server, manage invites and roles, kick and ban members. */
  MANAGE_SERVER: 1 << 3,
} as const;

export type PermissionFlag = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS =
  Permission.ADMINISTRATOR |
  Permission.MANAGE_CHANNELS |
  Permission.MODERATE |
  Permission.MANAGE_SERVER;

/** Labels + descriptions for the role editor, in display order. */
export const PERMISSION_INFO: Array<{
  flag: PermissionFlag;
  label: string;
  description: string;
}> = [
  {
    flag: Permission.ADMINISTRATOR,
    label: "Administrator",
    description: "Full access. Implies every permission below.",
  },
  {
    flag: Permission.MANAGE_CHANNELS,
    label: "Manage channels",
    description: "Create, rename, delete and reorder channels and categories.",
  },
  {
    flag: Permission.MODERATE,
    label: "Moderate messages & voice",
    description: "Delete anyone's messages and server-mute people in voice.",
  },
  {
    flag: Permission.MANAGE_SERVER,
    label: "Manage server & members",
    description: "Edit the server, manage invites and roles, kick and ban members.",
  },
];

/** True if `permissions` grants `flag` (administrator satisfies anything). */
export function hasPermission(permissions: number, flag: PermissionFlag): boolean {
  if (permissions & Permission.ADMINISTRATOR) return true;
  return (permissions & flag) !== 0;
}

/**
 * The bitmask a member effectively has in a server. Owner and global admins get
 * everything; otherwise it is the union of their assigned roles.
 */
export async function effectivePermissions(
  db: D1Database,
  userId: string,
  serverId: string,
): Promise<number> {
  const [user, server] = await Promise.all([
    db
      .prepare("SELECT is_admin FROM users WHERE id = ?")
      .bind(userId)
      .first<{ is_admin: number }>(),
    db
      .prepare("SELECT created_by FROM servers WHERE id = ?")
      .bind(serverId)
      .first<{ created_by: string | null }>(),
  ]);

  if (user?.is_admin) return ALL_PERMISSIONS;
  if (server?.created_by && server.created_by === userId) return ALL_PERMISSIONS;

  const rows = await db
    .prepare(
      `SELECT r.permissions AS permissions
         FROM member_roles mr
         JOIN roles r ON r.id = mr.role_id
        WHERE mr.server_id = ? AND mr.user_id = ?`,
    )
    .bind(serverId, userId)
    .all();

  let mask = 0;
  for (const row of (rows.results || []) as Array<{ permissions: number }>) {
    mask |= row.permissions;
  }
  if (mask & Permission.ADMINISTRATOR) return ALL_PERMISSIONS;
  return mask;
}

/** Convenience gate for a single flag. */
export async function can(
  db: D1Database,
  userId: string,
  serverId: string,
  flag: PermissionFlag,
): Promise<boolean> {
  return hasPermission(await effectivePermissions(db, userId, serverId), flag);
}
