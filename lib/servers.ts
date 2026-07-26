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
    position: channel.position,
    categoryId: channel.category_id || null,
  };
}

/** The whole tree in one round trip — this is a handful of rows, not a feed. */
export async function listServers(db: D1Database): Promise<PublicServer[]> {
  const [servers, channels, categories, roles] = await Promise.all([
    db
      .prepare(
        "SELECT id, name, icon, color, created_by, created_at, position FROM servers WHERE id != ? ORDER BY position ASC, created_at ASC",
      )
      .bind(DM_SERVER_ID)
      .all(),
    db
      .prepare(
        "SELECT id, server_id, name, kind, topic, position, category_id, created_at FROM channels WHERE server_id != ? ORDER BY position ASC, created_at ASC",
      )
      .bind(DM_SERVER_ID)
      .all(),
    db
      .prepare(
        "SELECT id, server_id, name, position FROM categories WHERE server_id != ? ORDER BY position ASC",
      )
      .bind(DM_SERVER_ID)
      .all(),
    db
      .prepare(
        "SELECT id, server_id, name, color, permissions, position FROM roles WHERE server_id != ? ORDER BY position DESC, name ASC",
      )
      .bind(DM_SERVER_ID)
      .all(),
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
