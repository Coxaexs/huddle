/**
 * Servers, channels, categories and roles as the client sees them.
 *
 * `kind` on a channel is the one field that changes behaviour elsewhere: it
 * decides whether the channel takes messages, holds a voice call, or restricts
 * posting. See `lib/channel-kinds.ts` for those rules.
 */
import { DM_SERVER_ID } from "./schema";
import { channelKindInfo, isChannelKind, type ChannelKind } from "./channel-kinds";
import { clampVoiceBitrate } from "./voice-quality";
import {
  applyOverwrites,
  isPrivateChannel,
  loadServerOverwrites,
  mayView,
  memberAccessMany,
  type ChannelOverwrite,
  type MemberAccess,
} from "./channel-permissions";

export interface ChannelRow {
  id: string;
  server_id: string;
  name: string;
  kind: ChannelKind;
  topic: string;
  slowmode?: number;
  bitrate?: number;
  /** Voice rooms: 0 switches the soundboard off. */
  soundboard?: number;
  /** Voice rooms: preferred voice server region ("auto", "nl", "de"). */
  rtc_region?: "auto" | "nl" | "de";
  /** 1 when the channel is age-restricted. */
  nsfw?: number;
  position: number;
  category_id: string | null;
  created_at: string;
}

interface CategoryRow {
  id: string;
  server_id: string;
  name: string;
  position: number;
}

interface RoleRow {
  id: string;
  server_id: string;
  name: string;
  color: string;
  icon?: string | null;
  permissions: number;
  position: number;
}

export interface ServerRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  icon_url?: string | null;
  banner_url?: string | null;
  created_by: string | null;
  created_at: string;
  position: number;
  is_public?: number;
  description?: string | null;
  disabled_modules?: string | null;
  raid_mode?: number;
  verification_level?: number;
  vanity_code?: string | null;
  everyone_permissions?: number;
}

export interface PublicChannel {
  id: string;
  serverId: string;
  name: string;
  kind: ChannelKind;
  topic: string;
  slowmode?: number;
  /** Voice channels: the most each speaker sends, in bits per second. */
  bitrate?: number;
  /** Voice channels: false when moderators switched the soundboard off. */
  soundboard?: boolean;
  /** Voice channels: preferred voice server region ("auto", "nl", "de"). */
  rtcRegion?: "auto" | "nl" | "de";
  /** Age-restricted: members confirm they are 18+ before it opens. */
  nsfw?: boolean;
  position: number;
  /** Category this channel sits under, or null when uncategorised. */
  categoryId: string | null;
  /** Hidden from @everyone: only some roles or people can see it. */
  private?: boolean;
  /**
   * This member's permissions in the channel (lib/channel-permissions.ts),
   * sent only when the channel has overwrites; otherwise CHANNEL_DEFAULTS hold.
   */
  access?: number;
}

export interface PublicCategory {
  id: string;
  name: string;
  position: number;
}

export interface PublicRole {
  id: string;
  name: string;
  color: string;
  /** An emoji, or an uploaded image path (see lib/role-icon.ts). */
  icon?: string | null;
  permissions: number;
  position: number;
}

export interface PublicServer {
  id: string;
  name: string;
  icon: string;
  color: string;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  ownerId: string | null;
  isPublic?: boolean;
  description?: string;
  disabledModules?: string[];
  raidMode?: boolean;
  /** 0 none, 1 verified email, 2 + account 5 min old, 3 + member 10 min (lib/verification-level.ts). */
  verificationLevel?: number;
  /** The server's custom invite code, if it set one. */
  vanityCode?: string | null;
  /** What every member holds before any role (@everyone). */
  everyonePermissions?: number;
  channels: PublicChannel[];
  categories: PublicCategory[];
  roles: PublicRole[];
}

export function publicChannel(channel: ChannelRow): PublicChannel {
  return {
    id: channel.id,
    serverId: channel.server_id,
    name: channel.name,
    // An unrecognized kind (a row from an older build, or one hand-edited in
    // the database) renders as a plain text channel rather than disappearing.
    kind: isChannelKind(channel.kind) ? channel.kind : "text",
    topic: channel.topic || "",
    slowmode: (channel as { slowmode?: number }).slowmode || 0,
    ...(channel.nsfw ? { nsfw: true } : {}),
    ...(channelKindInfo(channel.kind).voice
      ? {
          bitrate: clampVoiceBitrate((channel as { bitrate?: number }).bitrate),
          soundboard: (channel as { soundboard?: number }).soundboard !== 0,
          rtcRegion: ((channel as { rtc_region?: string }).rtc_region as "auto" | "nl" | "de") || "auto",
        }
      : {}),
    position: channel.position,
    categoryId: channel.category_id || null,
  };
}

/** True if the user belongs to the server. */
export async function isServerMember(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS ok FROM server_members WHERE server_id = ? AND user_id = ?",
    )
    .bind(serverId, userId)
    .first<{ ok: number }>();
  return Boolean(row);
}

/** Adds a member (idempotent, records invite code if provided). */
export async function addServerMember(
  db: D1Database,
  serverId: string,
  userId: string,
  inviteCode?: string | null,
): Promise<void> {
  const code = inviteCode?.trim().toUpperCase() || null;
  await db
    .prepare(
      `INSERT INTO server_members (server_id, user_id, joined_at, invite_code)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(server_id, user_id) DO UPDATE SET
         invite_code = COALESCE(server_members.invite_code, excluded.invite_code)`,
    )
    .bind(serverId, userId, new Date().toISOString(), code)
    .run();
  await markServerRead(db, serverId, userId);
}

/** Marks every channel in a server read for a member, up to now. A new
 *  member starts caught up instead of with the whole history unread; read
 *  marks they already have are kept. */
export async function markServerRead(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO channel_reads (user_id, channel_id, read_at)
       SELECT ?1, id, ?2 FROM channels WHERE server_id = ?3`,
    )
    .bind(userId, new Date().toISOString(), serverId)
    .run();
}

/** Removes a member and clears any roles they held in that server. */
export async function removeServerMember(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<void> {
  await db.batch([
    db
      .prepare("DELETE FROM server_members WHERE server_id = ? AND user_id = ?")
      .bind(serverId, userId),
    db
      .prepare("DELETE FROM member_roles WHERE server_id = ? AND user_id = ?")
      .bind(serverId, userId),
  ]);
}

/**
 * The whole tree in one round trip — a handful of rows, not a feed. Pass a
 * `userId` to get only the servers that member belongs to; pass `null` (the
 * bot's cross-server view) to get every server.
 */
export async function listServers(
  db: D1Database,
  userId: string | null,
): Promise<PublicServer[]> {
  // When scoped to a member, every sub-query is limited to the servers they
  // belong to. This keeps the payload (broadcast to every tab on a structure
  // change) and the rows scanned proportional to one person's servers, not the
  // whole Huddle.
  const memberFilter = userId
    ? "server_id IN (SELECT server_id FROM server_members WHERE user_id = ?2)"
    : "server_id != ?2"; // ?2 stands in for DM here; keeps bindings uniform.
  const scoped = (sql: (filter: string) => string) =>
    userId
      ? db.prepare(sql(memberFilter)).bind(DM_SERVER_ID, userId).all()
      : db.prepare(sql("server_id != ?2")).bind(DM_SERVER_ID, DM_SERVER_ID).all();

  const [servers, channels, categories, roles] = await Promise.all([
    userId
      ? db
          .prepare(
            `SELECT s.*
               FROM servers s
               JOIN server_members m ON m.server_id = s.id AND m.user_id = ?
              WHERE s.id != ?
              ORDER BY
                COALESCE((SELECT p.position FROM server_member_positions p
                           WHERE p.server_id = s.id AND p.user_id = ?), s.position) ASC,
                s.created_at ASC`,
          )
          .bind(userId, DM_SERVER_ID, userId)
          .all()
      : db
          .prepare(
            `SELECT *
               FROM servers WHERE id != ?
              ORDER BY position ASC, created_at ASC`,
          )
          .bind(DM_SERVER_ID)
          .all(),
    scoped(
      (filter) =>
        `SELECT id, server_id, name, kind, topic, slowmode, bitrate, soundboard, nsfw, position, category_id, created_at
           FROM channels WHERE server_id != ?1 AND ${filter}
          ORDER BY position ASC, created_at ASC`,
    ),
    scoped(
      (filter) =>
        `SELECT id, server_id, name, position
           FROM categories WHERE server_id != ?1 AND ${filter}
          ORDER BY position ASC`,
    ),
    scoped(
      (filter) =>
        `SELECT id, server_id, name, color, icon, permissions, position
           FROM roles WHERE server_id != ?1 AND ${filter}
          ORDER BY position DESC, name ASC`,
    ),
  ]);

  // Per-channel permissions: a member's list leaves out what they may not see,
  // and says what the rest let them do (only where a channel has overwrites).
  // Bots (no userId) see every channel, as they always did.
  const overwrites = userId
    ? await loadServerOverwrites(db, ((servers.results || []) as unknown as ServerRow[]).map((s) => s.id))
    : new Map<string, ChannelOverwrite[]>();
  const accessByServer = new Map<string, MemberAccess>();
  const channelsByServer = new Map<string, PublicChannel[]>();
  for (const row of (channels.results || []) as unknown as ChannelRow[]) {
    const channel = publicChannel(row);
    const gate = overwrites.get(row.id);
    if (userId && gate?.length) {
      let access = accessByServer.get(row.server_id);
      if (!access) {
        access = (await memberAccessMany(db, row.server_id, [userId])).get(userId)!;
        accessByServer.set(row.server_id, access);
      }
      const permissions = applyOverwrites(access, gate, userId);
      if (!mayView(permissions)) continue;
      channel.access = permissions;
      if (isPrivateChannel(gate)) channel.private = true;
    }
    const list = channelsByServer.get(row.server_id) || [];
    list.push(channel);
    channelsByServer.set(row.server_id, list);
  }

  const categoriesByServer = new Map<string, PublicCategory[]>();
  for (const row of (categories.results || []) as unknown as CategoryRow[]) {
    const list = categoriesByServer.get(row.server_id) || [];
    list.push({ id: row.id, name: row.name, position: row.position });
    categoriesByServer.set(row.server_id, list);
  }

  const rolesByServer = new Map<string, PublicRole[]>();
  for (const row of (roles.results || []) as unknown as RoleRow[]) {
    const list = rolesByServer.get(row.server_id) || [];
    list.push({
      id: row.id,
      name: row.name,
      color: row.color,
      icon: row.icon || null,
      permissions: row.permissions,
      position: row.position,
    });
    rolesByServer.set(row.server_id, list);
  }

  return ((servers.results || []) as unknown as ServerRow[]).map((server) => {
    let disabledModules: string[] = [];
    if (typeof server.disabled_modules === "string" && server.disabled_modules) {
      try {
        const parsed = JSON.parse(server.disabled_modules);
        if (Array.isArray(parsed)) disabledModules = parsed.filter((x): x is string => typeof x === "string");
      } catch {}
    }
    return {
      id: server.id,
      name: server.name,
      icon: server.icon,
      color: server.color,
      iconUrl: server.icon_url || null,
      bannerUrl: server.banner_url || null,
      ownerId: server.created_by,
      ...(server.is_public !== undefined ? { isPublic: Boolean(server.is_public) } : {}),
      ...(server.description !== undefined ? { description: server.description || "" } : {}),
      ...(server.disabled_modules !== undefined ? { disabledModules } : {}),
      ...(server.raid_mode !== undefined ? { raidMode: Boolean(server.raid_mode) } : {}),
      ...(server.verification_level !== undefined ? { verificationLevel: server.verification_level || 0 } : {}),
      ...(server.vanity_code !== undefined ? { vanityCode: server.vanity_code || null } : {}),
      ...(server.everyone_permissions !== undefined ? { everyonePermissions: server.everyone_permissions || 0 } : {}),
      channels: channelsByServer.get(server.id) || [],
      categories: categoriesByServer.get(server.id) || [],
      roles: rolesByServer.get(server.id) || [],
    };
  });
}

export async function findChannel(
  db: D1Database,
  channelId: string,
): Promise<ChannelRow | null> {
  // Every column, not a list: some callers run before ensureSchema has added
  // the newer ones (slowmode, bitrate), and naming a missing column fails the
  // whole query. Updates read their current values from here, too.
  return db
    .prepare("SELECT * FROM channels WHERE id = ?")
    .bind(channelId)
    .first<ChannelRow>();
}

/**
 * Removes a server with its channels, messages, roles, members, bans, stickers
 * and audit trail. Callers check permission and refuse the home server.
 */
export async function deleteServerData(db: D1Database, id: string): Promise<void> {
  const channels = await db
    .prepare("SELECT id FROM channels WHERE server_id = ?")
    .bind(id)
    .all();
  const channelIds = ((channels.results || []) as Array<{ id: string }>).map(
    (row) => row.id,
  );

  const statements = [
    db.prepare("DELETE FROM channels WHERE server_id = ?").bind(id),
    db.prepare("DELETE FROM categories WHERE server_id = ?").bind(id),
    db.prepare("DELETE FROM channel_overwrites WHERE server_id = ?").bind(id),
    db.prepare("DELETE FROM roles WHERE server_id = ?").bind(id),
    db.prepare("DELETE FROM member_roles WHERE server_id = ?").bind(id),
    db.prepare("DELETE FROM server_members WHERE server_id = ?").bind(id),
    db.prepare("DELETE FROM bans WHERE server_id = ?").bind(id),
    db.prepare("DELETE FROM stickers WHERE server_id = ?").bind(id),
    db.prepare("DELETE FROM audit_log WHERE server_id = ?").bind(id),
    db.prepare("DELETE FROM servers WHERE id = ?").bind(id),
  ];
  for (const channelId of channelIds) {
    statements.push(
      db.prepare("DELETE FROM messages WHERE channel_id = ?").bind(channelId),
    );
  }
  await db.batch(statements);
}
