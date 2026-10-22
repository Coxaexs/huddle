/**
 * Per-channel permissions: overwrites for @everyone, for a role, or for one
 * member, laid over a member's server-wide permissions the way Discord does it
 * (@everyone first, then all of their roles together, then the member).
 *
 * A channel with no overwrites works exactly as it always did: every member of
 * the server sees it and may use it. CHANNEL_DEFAULTS is that "may use it".
 * Hoffle never gated these server-wide, so they start on and only an overwrite
 * takes one away. The server owner, global admins and ADMINISTRATOR are never
 * limited by overwrites.
 */
import { ALL_PERMISSIONS, Permission, type PermissionFlag } from "./permissions";

export type OverwriteTarget = "everyone" | "role" | "member";

export interface ChannelOverwrite {
  targetType: OverwriteTarget;
  /** "" for @everyone, otherwise a role id or a user id. */
  targetId: string;
  allow: number;
  deny: number;
}

/** What every member may do in a channel until an overwrite says otherwise. */
export const CHANNEL_DEFAULTS =
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.SEND_MESSAGES_IN_THREADS |
  Permission.CREATE_PUBLIC_THREADS |
  Permission.EMBED_LINKS |
  Permission.ATTACH_FILES |
  Permission.ADD_REACTIONS |
  Permission.USE_EXTERNAL_EMOJIS |
  Permission.READ_MESSAGE_HISTORY |
  Permission.CONNECT |
  Permission.SPEAK |
  Permission.VIDEO;

/** The permissions an overwrite may set, in the order the channel editor lists them. */
export const OVERWRITE_FLAGS: readonly PermissionFlag[] = [
  Permission.VIEW_CHANNEL,
  Permission.SEND_MESSAGES,
  Permission.ATTACH_FILES,
  Permission.ADD_REACTIONS,
  Permission.MENTION_EVERYONE,
  Permission.MANAGE_MESSAGES,
  Permission.CONNECT,
  Permission.SPEAK,
  Permission.VIDEO,
];
export const OVERWRITE_MASK = OVERWRITE_FLAGS.reduce((all, flag) => all | flag, 0);

/** A member's server-wide standing, which channel permissions start from. */
export interface MemberAccess {
  /** Server owner, global admin, or ADMINISTRATOR through a role. */
  unlimited: boolean;
  mask: number;
  roleIds: ReadonlySet<string>;
}

/** A member's permissions in a channel with these overwrites. */
export function applyOverwrites(
  access: MemberAccess,
  overwrites: readonly ChannelOverwrite[],
  userId: string,
): number {
  if (access.unlimited || access.mask & Permission.ADMINISTRATOR) return ALL_PERMISSIONS;
  let permissions = access.mask | CHANNEL_DEFAULTS;
  const everyone = overwrites.find((o) => o.targetType === "everyone");
  if (everyone) permissions = (permissions & ~everyone.deny) | everyone.allow;
  // A member's roles count together: any allow beats any deny between roles.
  let allow = 0;
  let deny = 0;
  for (const o of overwrites) {
    if (o.targetType === "role" && access.roleIds.has(o.targetId)) {
      allow |= o.allow;
      deny |= o.deny;
    }
  }
  permissions = (permissions & ~deny) | allow;
  const own = overwrites.find((o) => o.targetType === "member" && o.targetId === userId);
  if (own) permissions = (permissions & ~own.deny) | own.allow;
  return permissions;
}

export function mayView(permissions: number): boolean {
  return (permissions & Permission.VIEW_CHANNEL) !== 0;
}

/** True when @everyone cannot see the channel (the channel list shows a lock). */
export function isPrivateChannel(overwrites: readonly ChannelOverwrite[]): boolean {
  return overwrites.some((o) => o.targetType === "everyone" && (o.deny & Permission.VIEW_CHANNEL) !== 0);
}

/**
 * Cleans overwrites sent by a client: known targets only, overwritable bits
 * only, an allow and a deny never both set, and empty rows dropped.
 */
export function sanitizeOverwrites(
  input: unknown,
  known: { roleIds: ReadonlySet<string>; memberIds: ReadonlySet<string> },
): ChannelOverwrite[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ChannelOverwrite[] = [];
  for (const raw of input.slice(0, 100)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const targetType = row.targetType;
    const targetId = typeof row.targetId === "string" ? row.targetId : "";
    if (targetType === "everyone") {
      if (targetId) continue;
    } else if (targetType === "role") {
      if (!known.roleIds.has(targetId)) continue;
    } else if (targetType === "member") {
      if (!known.memberIds.has(targetId)) continue;
    } else {
      continue;
    }
    const key = `${targetType}:${targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const allow = (Number(row.allow) || 0) & OVERWRITE_MASK;
    const deny = (Number(row.deny) || 0) & OVERWRITE_MASK & ~allow;
    if (!allow && !deny) continue;
    out.push({ targetType, targetId, allow, deny });
  }
  return out;
}

// ── database ──────────────────────────────────────────────────────────

interface OverwriteRow {
  channel_id: string;
  target_type: string;
  target_id: string;
  allow: number;
  deny: number;
}

function toOverwrite(row: OverwriteRow): ChannelOverwrite {
  return {
    targetType: row.target_type as OverwriteTarget,
    targetId: row.target_id,
    allow: Number(row.allow) || 0,
    deny: Number(row.deny) || 0,
  };
}

/**
 * Runs an overwrite query. Before the migration that creates the table there
 * can be no overwrites, so "no such table" reads as none; any other failure
 * is thrown, and callers treat that as no access.
 */
async function overwriteRows(statement: D1PreparedStatement): Promise<OverwriteRow[]> {
  try {
    return (await statement.all<OverwriteRow>()).results || [];
  } catch (error) {
    if (/no such table/i.test(error instanceof Error ? error.message : String(error))) return [];
    throw error;
  }
}

/** Overwrites by channel id; channels without any are left out of the map. */
export async function loadOverwrites(
  db: D1Database,
  channelIds: readonly string[],
): Promise<Map<string, ChannelOverwrite[]>> {
  const out = new Map<string, ChannelOverwrite[]>();
  const ids = [...new Set(channelIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await overwriteRows(
      db
        .prepare(
          `SELECT channel_id, target_type, target_id, allow, deny FROM channel_overwrites
            WHERE channel_id IN (${chunk.map(() => "?").join(",")})`,
        )
        .bind(...chunk),
    );
    for (const row of rows) {
      const list = out.get(row.channel_id) || [];
      list.push(toOverwrite(row));
      out.set(row.channel_id, list);
    }
  }
  return out;
}

/** Overwrites for every channel of these servers. */
export async function loadServerOverwrites(
  db: D1Database,
  serverIds: readonly string[],
): Promise<Map<string, ChannelOverwrite[]>> {
  const out = new Map<string, ChannelOverwrite[]>();
  const ids = [...new Set(serverIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await overwriteRows(
      db
        .prepare(
          `SELECT channel_id, target_type, target_id, allow, deny FROM channel_overwrites
            WHERE server_id IN (${chunk.map(() => "?").join(",")})`,
        )
        .bind(...chunk),
    );
    for (const row of rows) {
      const list = out.get(row.channel_id) || [];
      list.push(toOverwrite(row));
      out.set(row.channel_id, list);
    }
  }
  return out;
}

/** Server-wide standing for several members of one server, in three queries. */
export async function memberAccessMany(
  db: D1Database,
  serverId: string,
  userIds: readonly string[],
): Promise<Map<string, MemberAccess>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, MemberAccess>();
  if (!ids.length) return out;
  const server = await db
    .prepare("SELECT * FROM servers WHERE id = ?")
    .bind(serverId)
    .first<{ created_by: string | null; everyone_permissions?: number }>();
  const everyone = Number(server?.everyone_permissions) || 0;
  const admins = new Set<string>();
  const roles = new Map<string, { ids: Set<string>; mask: number }>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const marks = chunk.map(() => "?").join(",");
    const [users, rows] = await Promise.all([
      db.prepare(`SELECT id FROM users WHERE is_admin = 1 AND id IN (${marks})`).bind(...chunk).all<{ id: string }>(),
      db
        .prepare(
          `SELECT mr.user_id AS user_id, r.id AS role_id, r.permissions AS permissions
             FROM member_roles mr JOIN roles r ON r.id = mr.role_id
            WHERE mr.server_id = ? AND mr.user_id IN (${marks})`,
        )
        .bind(serverId, ...chunk)
        .all<{ user_id: string; role_id: string; permissions: number }>(),
    ]);
    for (const row of users.results || []) admins.add(row.id);
    for (const row of rows.results || []) {
      const entry = roles.get(row.user_id) || { ids: new Set<string>(), mask: 0 };
      entry.ids.add(row.role_id);
      entry.mask |= Number(row.permissions) || 0;
      roles.set(row.user_id, entry);
    }
  }
  for (const id of ids) {
    const held = roles.get(id);
    const mask = everyone | (held?.mask || 0);
    out.set(id, {
      unlimited: admins.has(id) || (Boolean(server?.created_by) && server?.created_by === id) || (mask & Permission.ADMINISTRATOR) !== 0,
      mask,
      roleIds: held?.ids || new Set(),
    });
  }
  return out;
}

/**
 * A member's permissions in one server channel, or null when the channel has
 * no overwrites (CHANNEL_DEFAULTS then, and server-wide rights from can()).
 * Costs one query for an ordinary channel.
 */
export async function channelOverwritePermissions(
  db: D1Database,
  userId: string,
  channelId: string,
  serverId: string,
): Promise<number | null> {
  const overwrites = (await loadOverwrites(db, [channelId])).get(channelId);
  if (!overwrites?.length) return null;
  const access = (await memberAccessMany(db, serverId, [userId])).get(userId)!;
  return applyOverwrites(access, overwrites, userId);
}

/** Every channel in this member's servers that channel permissions hide from them. */
export async function hiddenChannelIds(db: D1Database, userId: string): Promise<Set<string>> {
  const rows = await db
    .prepare(
      `SELECT DISTINCT o.channel_id AS channel_id, o.server_id AS server_id
         FROM channel_overwrites o
         JOIN server_members sm ON sm.server_id = o.server_id AND sm.user_id = ?`,
    )
    .bind(userId)
    .all<{ channel_id: string; server_id: string }>();
  const gated = rows.results || [];
  const hidden = new Set<string>();
  if (!gated.length) return hidden;
  const visible = await viewableChannelIds(
    db,
    userId,
    gated.map((row) => ({ id: row.channel_id, serverId: row.server_id })),
  );
  for (const row of gated) if (!visible.has(row.channel_id)) hidden.add(row.channel_id);
  return hidden;
}

/** Of `userIds`, the ones who can see the channel: all of them when it has no overwrites. */
export async function channelViewers(
  db: D1Database,
  channelId: string,
  serverId: string,
  userIds: readonly string[],
): Promise<string[]> {
  const overwrites = (await loadOverwrites(db, [channelId])).get(channelId);
  if (!overwrites?.length) return [...userIds];
  const access = await memberAccessMany(db, serverId, userIds);
  return userIds.filter((id) => {
    const mine = access.get(id);
    return mine ? mayView(applyOverwrites(mine, overwrites, id)) : false;
  });
}

/** Of these server channels, the ids `userId` can see. */
export async function viewableChannelIds(
  db: D1Database,
  userId: string,
  channels: ReadonlyArray<{ id: string; serverId: string }>,
): Promise<Set<string>> {
  const overwrites = await loadOverwrites(db, channels.map((c) => c.id));
  const visible = new Set<string>();
  const accessByServer = new Map<string, MemberAccess>();
  for (const channel of channels) {
    const list = overwrites.get(channel.id);
    if (!list?.length) {
      visible.add(channel.id);
      continue;
    }
    let access = accessByServer.get(channel.serverId);
    if (!access) {
      access = (await memberAccessMany(db, channel.serverId, [userId])).get(userId)!;
      accessByServer.set(channel.serverId, access);
    }
    if (mayView(applyOverwrites(access, list, userId))) visible.add(channel.id);
  }
  return visible;
}

/** Replaces a channel's overwrites. */
export function replaceOverwritesStatements(
  db: D1Database,
  channelId: string,
  serverId: string,
  overwrites: readonly ChannelOverwrite[],
): D1PreparedStatement[] {
  return [
    db.prepare("DELETE FROM channel_overwrites WHERE channel_id = ?").bind(channelId),
    ...overwrites.map((o) =>
      db
        .prepare(
          "INSERT INTO channel_overwrites (channel_id, server_id, target_type, target_id, allow, deny) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(channelId, serverId, o.targetType, o.targetId, o.allow, o.deny),
    ),
  ];
}
