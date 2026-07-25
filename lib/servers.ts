import { DM_SERVER_ID } from "./schema";

export interface ChannelRow {
  id: string;
  server_id: string;
  name: string;
  kind: "text" | "voice" | "dm";
  topic: string;
  position: number;
  created_at: string;
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
}

export interface PublicServer {
  id: string;
  name: string;
  icon: string;
  color: string;
  channels: PublicChannel[];
}

export function publicChannel(channel: ChannelRow): PublicChannel {
  return {
    id: channel.id,
    serverId: channel.server_id,
    name: channel.name,
    kind:
      channel.kind === "voice" ? "voice" : channel.kind === "dm" ? "dm" : "text",
    topic: channel.topic || "",
  };
}

/** The whole tree in one round trip — this is a handful of rows, not a feed. */
export async function listServers(db: D1Database): Promise<PublicServer[]> {
  const [servers, channels] = await Promise.all([
    db
      .prepare(
        "SELECT id, name, icon, color, created_by, created_at, position FROM servers WHERE id != ? ORDER BY position ASC, created_at ASC",
      )
      .bind(DM_SERVER_ID)
      .all(),
    db
      .prepare(
        "SELECT id, server_id, name, kind, topic, position, created_at FROM channels WHERE server_id != ? ORDER BY position ASC, created_at ASC",
      )
      .bind(DM_SERVER_ID)
      .all(),
  ]);

  const byServer = new Map<string, PublicChannel[]>();
  for (const row of (channels.results || []) as unknown as ChannelRow[]) {
    const list = byServer.get(row.server_id) || [];
    list.push(publicChannel(row));
    byServer.set(row.server_id, list);
  }

  return ((servers.results || []) as unknown as ServerRow[]).map((server) => ({
    id: server.id,
    name: server.name,
    icon: server.icon,
    color: server.color,
    channels: byServer.get(server.id) || [],
  }));
}

export async function findChannel(
  db: D1Database,
  channelId: string,
): Promise<ChannelRow | null> {
  return db
    .prepare(
      "SELECT id, server_id, name, kind, topic, position, created_at FROM channels WHERE id = ?",
    )
    .bind(channelId)
    .first<ChannelRow>();
}
