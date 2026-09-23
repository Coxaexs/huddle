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
  /** Start and direct disclosed, consent-gated D&D session recordings. */
  RECORD_SESSIONS: 1 << 4,
  /** Create, edit, and assign roles below their highest role. */
  MANAGE_ROLES: 1 << 5,
  /** View the server's audit log history. */
  VIEW_AUDIT_LOG: 1 << 6,
  /** Upload or delete custom server emojis and stickers. */
  MANAGE_EMOJIS: 1 << 7,
  /** Create invite codes and links for new members. */
  CREATE_INVITES: 1 << 8,
  /** Change own nickname on this server. */
  CHANGE_NICKNAME: 1 << 9,
  /** Change nicknames of other server members. */
  MANAGE_NICKNAMES: 1 << 10,
  /** Kick members from the server. */
  KICK_MEMBERS: 1 << 11,
  /** Permanently ban members from the server. */
  BAN_MEMBERS: 1 << 12,
  /** Post messages in text channels. */
  SEND_MESSAGES: 1 << 13,
  /** Reply in message threads. */
  SEND_MESSAGES_IN_THREADS: 1 << 14,
  /** Start new public threads. */
  CREATE_PUBLIC_THREADS: 1 << 15,
  /** Show link previews for posted URLs. */
  EMBED_LINKS: 1 << 16,
  /** Upload attachments, images, and files. */
  ATTACH_FILES: 1 << 17,
  /** Add new emoji reactions to messages. */
  ADD_REACTIONS: 1 << 18,
  /** Use custom emojis from this and other servers. */
  USE_EXTERNAL_EMOJIS: 1 << 19,
  /** Mention @everyone and @here in messages. */
  MENTION_EVERYONE: 1 << 20,
  /** Delete or pin other members' messages. */
  MANAGE_MESSAGES: 1 << 21,
  /** Read past channel message history. */
  READ_MESSAGE_HISTORY: 1 << 22,
  /** Connect to voice and stage channels. */
  CONNECT: 1 << 23,
  /** Speak in voice channels. */
  SPEAK: 1 << 24,
  /** Stream webcam video or screenshare. */
  VIDEO: 1 << 25,
  /** Mute other members in voice channels. */
  MUTE_MEMBERS: 1 << 26,
  /** Deafen other members in voice channels. */
  DEAFEN_MEMBERS: 1 << 27,
  /** Move members between voice channels. */
  MOVE_MEMBERS: 1 << 28,
} as const;

export type PermissionFlag = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS = Object.values(Permission).reduce(
  (acc, val) => acc | val,
  0,
);

/** Labels + descriptions for the role editor, in display order grouped by category. */
export const PERMISSION_INFO: Array<{
  flag: PermissionFlag;
  label: string;
  description: string;
  category: "General" | "Membership" | "Text" | "Voice";
}> = [
  // General Server Permissions
  {
    flag: Permission.ADMINISTRATOR,
    label: "Administrator",
    description: "Members with this permission have every permission and bypass channel-specific restrictions. Highly dangerous.",
    category: "General",
  },
  {
    flag: Permission.MANAGE_SERVER,
    label: "Manage Server",
    description: "Edit server name, icon, banner, and general configurations.",
    category: "General",
  },
  {
    flag: Permission.MANAGE_ROLES,
    label: "Manage Roles",
    description: "Create, edit, and assign roles lower than their own highest role.",
    category: "General",
  },
  {
    flag: Permission.MANAGE_CHANNELS,
    label: "Manage Channels",
    description: "Create, edit, rename, and delete text and voice channels.",
    category: "General",
  },
  {
    flag: Permission.VIEW_AUDIT_LOG,
    label: "View Audit Log",
    description: "View the record of administrative actions and moderation events.",
    category: "General",
  },
  {
    flag: Permission.MANAGE_EMOJIS,
    label: "Manage Emojis & Stickers",
    description: "Upload, edit, and delete custom emojis and stickers for the server.",
    category: "General",
  },

  // Membership Permissions
  {
    flag: Permission.CREATE_INVITES,
    label: "Create Invites",
    description: "Generate invite codes and links to invite friends to the server.",
    category: "Membership",
  },
  {
    flag: Permission.CHANGE_NICKNAME,
    label: "Change Nickname",
    description: "Allows members to change their own nickname in this server.",
    category: "Membership",
  },
  {
    flag: Permission.MANAGE_NICKNAMES,
    label: "Manage Nicknames",
    description: "Change the nicknames of other members.",
    category: "Membership",
  },
  {
    flag: Permission.KICK_MEMBERS,
    label: "Kick Members",
    description: "Remove members from the server. They can rejoin with a valid invite.",
    category: "Membership",
  },
  {
    flag: Permission.BAN_MEMBERS,
    label: "Ban Members",
    description: "Permanently ban members and their accounts from the server.",
    category: "Membership",
  },

  // Text & Chat Permissions
  {
    flag: Permission.SEND_MESSAGES,
    label: "Send Messages",
    description: "Post messages in text channels and stage text chats.",
    category: "Text",
  },
  {
    flag: Permission.SEND_MESSAGES_IN_THREADS,
    label: "Send Messages in Threads",
    description: "Post replies within message threads.",
    category: "Text",
  },
  {
    flag: Permission.CREATE_PUBLIC_THREADS,
    label: "Create Threads",
    description: "Start new discussion threads from existing messages.",
    category: "Text",
  },
  {
    flag: Permission.EMBED_LINKS,
    label: "Embed Links",
    description: "Links posted will generate rich preview embeds.",
    category: "Text",
  },
  {
    flag: Permission.ATTACH_FILES,
    label: "Attach Files",
    description: "Upload images, files, documents, and recordings.",
    category: "Text",
  },
  {
    flag: Permission.ADD_REACTIONS,
    label: "Add Reactions",
    description: "Add emoji reactions to messages.",
    category: "Text",
  },
  {
    flag: Permission.USE_EXTERNAL_EMOJIS,
    label: "Use Custom Emojis",
    description: "Use server emojis in messages and reactions.",
    category: "Text",
  },
  {
    flag: Permission.MENTION_EVERYONE,
    label: "Mention @everyone & @here",
    description: "Notify all members in a channel with @everyone or @here.",
    category: "Text",
  },
  {
    flag: Permission.MANAGE_MESSAGES,
    label: "Manage Messages",
    description: "Delete messages sent by other members and pin important messages.",
    category: "Text",
  },
  {
    flag: Permission.READ_MESSAGE_HISTORY,
    label: "Read Message History",
    description: "View messages posted before the member joined.",
    category: "Text",
  },

  // Voice Permissions
  {
    flag: Permission.CONNECT,
    label: "Connect",
    description: "Join voice channels and listen to participants.",
    category: "Voice",
  },
  {
    flag: Permission.SPEAK,
    label: "Speak",
    description: "Talk in voice channels using microphone.",
    category: "Voice",
  },
  {
    flag: Permission.VIDEO,
    label: "Video & Screen Share",
    description: "Share camera video or broadcast computer screen in voice channels.",
    category: "Voice",
  },
  {
    flag: Permission.MUTE_MEMBERS,
    label: "Mute Members",
    description: "Server-mute other members in voice channels.",
    category: "Voice",
  },
  {
    flag: Permission.DEAFEN_MEMBERS,
    label: "Deafen Members",
    description: "Server-deafen other members in voice channels.",
    category: "Voice",
  },
  {
    flag: Permission.MOVE_MEMBERS,
    label: "Move Members",
    description: "Move members between different voice channels.",
    category: "Voice",
  },
  {
    flag: Permission.RECORD_SESSIONS,
    label: "Record D&D Sessions",
    description: "Start, pause, direct, and stop consent-gated room recordings.",
    category: "Voice",
  },
  {
    flag: Permission.MODERATE,
    label: "Moderate Messages & Voice",
    description: "General moderation capabilities across messages and voice.",
    category: "Voice",
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

/** True when the member holds at least one of `flags` in the server. */
export async function canAny(
  db: D1Database,
  userId: string,
  serverId: string,
  ...flags: PermissionFlag[]
): Promise<boolean> {
  const permissions = await effectivePermissions(db, userId, serverId);
  return flags.some((flag) => hasPermission(permissions, flag));
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
