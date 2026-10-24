/**
 * Servers readable on the web (Server Settings > Access > Readable on the web):
 * hoffle.online/s/<vanity or id> lists their open channels, and each channel's
 * page shows its recent messages, for people and search engines alike.
 *
 * Only plain text and announcement channels that are not 18+ and have no
 * permission overwrites at all are shown; anything a server limits in any way
 * stays off the web. Thread replies and deleted messages never appear.
 */

export interface WebChannel {
  id: string;
  name: string;
  topic: string;
  kind: string;
}

export interface WebServer {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  iconUrl: string | null;
  vanity: string | null;
  memberCount: number;
  channels: WebChannel[];
}

export interface WebMessage {
  id: string;
  author: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  content: string;
  createdAt: string;
  images: string[];
}

export const WEB_PAGE_SIZE = 50;

export const webServerPath = (server: Pick<WebServer, "id" | "vanity">) =>
  `/s/${encodeURIComponent((server.vanity || server.id).toLowerCase())}`;
export const webChannelPath = (server: Pick<WebServer, "id" | "vanity">, channel: Pick<WebChannel, "name">) =>
  `${webServerPath(server)}/${encodeURIComponent(channel.name)}`;

/** A web-readable server by its vanity code or id, with the channels it shows. */
export async function loadWebServer(db: D1Database, slug: string): Promise<WebServer | null> {
  const key = decodeURIComponent(slug || "").trim();
  if (!key || key.length > 64) return null;
  const row = await db
    .prepare("SELECT * FROM servers WHERE web_public = 1 AND (id = ? OR lower(vanity_code) = lower(?)) LIMIT 1")
    .bind(key, key)
    .first<{
      id: string; name: string; description?: string | null; icon: string; color: string;
      icon_url?: string | null; vanity_code?: string | null;
    }>();
  if (!row) return null;
  const [channels, members] = await Promise.all([
    db
      .prepare(
        `SELECT c.id, c.name, c.topic, c.kind FROM channels c
          WHERE c.server_id = ? AND c.kind IN ('text', 'announcement') AND COALESCE(c.nsfw, 0) = 0
            AND NOT EXISTS (SELECT 1 FROM channel_overwrites o WHERE o.channel_id = c.id)
          ORDER BY c.position ASC, c.created_at ASC`,
      )
      .bind(row.id)
      .all<{ id: string; name: string; topic: string | null; kind: string }>(),
    db.prepare("SELECT COUNT(*) AS count FROM server_members WHERE server_id = ?").bind(row.id).first<{ count: number }>(),
  ]);
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    icon: row.icon,
    color: row.color,
    iconUrl: row.icon_url || null,
    vanity: row.vanity_code || null,
    memberCount: members?.count ?? 0,
    channels: (channels.results || []).map((c) => ({ id: c.id, name: c.name, topic: c.topic || "", kind: c.kind })),
  };
}

/** Our own uploads and the Hoffy stickers are public files; anything else stays a link. */
const OWN_IMAGE = /^\/hangout\/(api\/uploads\/[A-Za-z0-9._\/-]+|stickers\/hoffy\/[a-z-]+\.svg)$/;

function imagesOf(row: { attachment_key?: string | null; attachments?: string | null; content: string }): string[] {
  const keys: string[] = [];
  if (row.attachment_key) keys.push(row.attachment_key);
  try {
    const extra = row.attachments ? JSON.parse(row.attachments) : [];
    if (Array.isArray(extra)) keys.push(...extra.filter((k): k is string => typeof k === "string"));
  } catch {}
  // Keys are "<id>--<file name>"; the extension says whether it is a picture.
  const urls = keys
    .filter((k) => /\.(png|jpe?g|gif|webp|avif)$/i.test(k.split("--").slice(1).join("--")))
    .map((k) => `/hangout/api/uploads/${encodeURIComponent(k)}`);
  const text = row.content.trim();
  if (OWN_IMAGE.test(text)) urls.push(text);
  return urls.slice(0, 4);
}

/** A page of a channel's messages, oldest first, and where the page before it starts. */
export async function loadWebMessages(
  db: D1Database,
  channelId: string,
  before: string | null,
): Promise<{ messages: WebMessage[]; older: string | null }> {
  const rows = await db
    .prepare(
      `SELECT m.id, m.author, m.avatar, m.color, m.content, m.created_at, m.attachment_key, m.attachments,
              u.display_name AS display_name, u.avatar_url AS avatar_url
         FROM messages m LEFT JOIN users u ON u.id = m.user_id
        WHERE m.channel_id = ? AND m.deleted_at IS NULL AND m.thread_id IS NULL
          AND (? IS NULL OR m.created_at < ?)
        ORDER BY m.created_at DESC
        LIMIT ?`,
    )
    .bind(channelId, before, before, WEB_PAGE_SIZE)
    .all<{
      id: string; author: string; avatar: string; color: string; content: string; created_at: string;
      attachment_key: string | null; attachments: string | null; display_name: string | null; avatar_url: string | null;
    }>();
  const list = (rows.results || []).reverse();
  return {
    older: list.length === WEB_PAGE_SIZE ? list[0].created_at : null,
    messages: list.map((m) => {
      const images = imagesOf(m);
      return {
        id: m.id,
        author: m.display_name || m.author,
        avatar: m.avatar,
        avatarUrl: m.avatar_url || null,
        color: m.color,
        // A message that is only a picture shows as the picture.
        content: images.length && OWN_IMAGE.test(m.content.trim()) ? "" : m.content,
        createdAt: m.created_at,
        images,
      };
    }),
  };
}

/** Every web-readable server and channel, for the sitemap. */
export async function listWebPages(db: D1Database): Promise<Array<{ path: string; lastmod: string | null }>> {
  const servers = await db
    .prepare("SELECT id FROM servers WHERE web_public = 1 ORDER BY created_at ASC LIMIT 500")
    .all<{ id: string }>();
  const pages: Array<{ path: string; lastmod: string | null }> = [];
  for (const { id } of servers.results || []) {
    const server = await loadWebServer(db, id);
    if (!server) continue;
    pages.push({ path: webServerPath(server), lastmod: null });
    if (server.vanity) pages.push({ path: `/i/${encodeURIComponent(server.vanity)}`, lastmod: null });
    for (const channel of server.channels) {
      const last = await db
        .prepare("SELECT MAX(created_at) AS at FROM messages WHERE channel_id = ? AND deleted_at IS NULL")
        .bind(channel.id)
        .first<{ at: string | null }>();
      if (last?.at) pages.push({ path: webChannelPath(server, channel), lastmod: last.at.slice(0, 10) });
    }
  }
  return pages;
}
