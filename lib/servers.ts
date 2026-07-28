import { DM_SERVER_ID } from "./schema";

export interface ChannelRow {
  id: string;
  server_id: string;
  name: string;
  kind: "text" | "voice" | "dm";
  topic: string;
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
}

export interface PublicChannel {
  id: string;
  serverId: string;
  name: string;
  kind: "text" | "voice" | "dm";
  topic: string;
  slowmode?: number;
  position: number;
  /** Category this channel sits under, or null when uncategorised. */
  categoryId: string | null;
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
  channels: PublicChannel[];
  categories: PublicCategory[];
  roles: PublicRole[];
}

export function publicChannel(channel: ChannelRow): PublicChannel {
  return {
    id: channel.id,
    serverId: channel.server_id,
    name: channel.name,
    kind:
      channel.kind === "voice" ? "voice" : channel.kind === "dm" ? "dm" : "text",
    topic: channel.topic || "",
    slowmode: (channel as { slowmode?: number }).slowmode || 0,
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

/** Adds a member (idempotent). */
export async function addServerMember(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)",
    )
    .bind(serverId, userId, new Date().toISOString())
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
            `SELECT s.id, s.name, s.icon, s.color, s.icon_url, s.banner_url, s.created_by, s.created_at, s.position
               FROM servers s
               JOIN server_members m ON m.server_id = s.id AND m.user_id = ?
              WHERE s.id != ?
              ORDER BY s.position ASC, s.created_at ASC`,
          )
          .bind(userId, DM_SERVER_ID)
          .all()
      : db
          .prepare(
            `SELECT id, name, icon, color, icon_url, banner_url, created_by, created_at, position
               FROM servers WHERE id != ?
              ORDER BY position ASC, created_at ASC`,
          )
          .bind(DM_SERVER_ID)
          .all(),
    scoped(
      (filter) =>
        `SELECT id, server_id, name, kind, topic, slowmode, position, category_id, created_at
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
        `SELECT id, server_id, name, color, permissions, position
           FROM roles WHERE server_id != ?1 AND ${filter}
          ORDER BY position DESC, name ASC`,
    ),
  ]);

  const channelsByServer = new Map<string, PublicChannel[]>();
  for (const row of (channels.results || []) as unknown as ChannelRow[]) {
    const list = channelsByServer.get(row.server_id) || [];
    list.push(publicChannel(row));
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
      permissions: row.permissions,
      position: row.position,
    });
    rolesByServer.set(row.server_id, list);
  }

  return ((servers.results || []) as unknown as ServerRow[]).map((server) => ({
    id: server.id,
    name: server.name,
    icon: server.icon,
    color: server.color,
    iconUrl: server.icon_url || null,
    bannerUrl: server.banner_url || null,
    ownerId: server.created_by,
    channels: channelsByServer.get(server.id) || [],
    categories: categoriesByServer.get(server.id) || [],
    roles: rolesByServer.get(server.id) || [],
  }));
}

export async function findChannel(
  db: D1Database,
  channelId: string,
): Promise<ChannelRow | null> {
  return db
    .prepare(
      "SELECT id, server_id, name, kind, topic, position, category_id, created_at FROM channels WHERE id = ?",
    )
    .bind(channelId)
    .first<ChannelRow>();
}
