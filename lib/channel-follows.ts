import type { D1Database } from "@cloudflare/workers-types";
import { publishMessage } from "./hub-client";
import type { StoredMessage } from "./storage";

/**
 * Following an announcement channel, as on Discord: someone who manages a
 * channel elsewhere follows the announcement channel into it, and every post
 * there from then on is copied across, signed with the source server's name
 * and channel. Copies never ping anyone in the following server.
 */
export const MAX_FOLLOWS_INTO_CHANNEL = 10;

/** Channels that can receive followed posts. */
export const FOLLOW_TARGET_KINDS = new Set(["text", "announcement"]);

export interface FollowSource {
  channelId: string;
  channelName: string;
  serverId: string;
  serverName: string;
  serverAvatar: string;
  serverColor: string;
  serverIconUrl?: string | null;
}

/** What a follower sees under the copy, and where it links back to. */
export interface FollowedFrom {
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  messageId: string;
}

function parsePayload(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The copy of `original` that lands in a following channel: the same text,
 * files and embeds, signed "Server #channel". Nothing in it pings: mentions
 * are not resolved for copies, and it is marked silent.
 */
export function followCopy(
  source: FollowSource,
  original: StoredMessage,
  target: { id: string; name: string },
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): StoredMessage {
  const from = parsePayload(original.payload);
  const followedFrom: FollowedFrom = {
    serverId: source.serverId,
    serverName: source.serverName,
    channelId: source.channelId,
    channelName: source.channelName,
    messageId: original.id,
  };
  const avatarUrl =
    source.serverIconUrl && /^\/hangout\/api\/uploads\/[^/?#]+$/.test(source.serverIconUrl) ? source.serverIconUrl : null;
  const payload: Record<string, unknown> = {
    followedFrom,
    silent: true,
    ...(Array.isArray(from.embeds) && from.embeds.length ? { embeds: from.embeds, components: [] } : {}),
    ...(from.imageAlts && typeof from.imageAlts === "object" ? { imageAlts: from.imageAlts } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
  return {
    id,
    channel: target.name,
    channel_id: target.id,
    user_id: null,
    author: `${source.serverName} #${source.channelName}`.slice(0, 80),
    avatar: source.serverAvatar || "📣",
    color: source.serverColor || "#b8a6ff",
    content: original.content,
    attachment_key: original.attachment_key,
    attachments: original.attachments ?? null,
    is_bot: 1,
    created_at: now,
    link: original.link ?? null,
    action_label: original.action_label ?? null,
    audio_url: original.audio_url ?? null,
    kind: null,
    payload: JSON.stringify(payload).slice(0, 8000),
    reply_to: null,
    thread_id: null,
  };
}

/** Where an announcement channel's posts go. */
export async function followTargets(
  db: D1Database,
  sourceChannelId: string,
): Promise<Array<{ id: string; name: string; server_id: string; server_name: string }>> {
  const rows = await db
    .prepare(
      `SELECT c.id, c.name, c.server_id, s.name AS server_name
         FROM channel_follows f
         JOIN channels c ON c.id = f.target_channel_id
         JOIN servers s ON s.id = c.server_id
        WHERE f.source_channel_id = ?
        ORDER BY s.name COLLATE NOCASE, c.name COLLATE NOCASE`,
    )
    .bind(sourceChannelId)
    .all<{ id: string; name: string; server_id: string; server_name: string }>();
  return rows.results || [];
}

export async function addFollow(
  db: D1Database,
  sourceChannelId: string,
  targetChannelId: string,
  userId: string,
): Promise<"added" | "already" | "full"> {
  const existing = await db
    .prepare("SELECT 1 FROM channel_follows WHERE source_channel_id = ? AND target_channel_id = ?")
    .bind(sourceChannelId, targetChannelId)
    .first();
  if (existing) return "already";
  // Follows of channels deleted since do not count against the limit.
  const count = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM channel_follows f JOIN channels c ON c.id = f.source_channel_id
        WHERE f.target_channel_id = ?`,
    )
    .bind(targetChannelId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_FOLLOWS_INTO_CHANNEL) return "full";
  await db
    .prepare(
      "INSERT INTO channel_follows (source_channel_id, target_channel_id, created_by, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(sourceChannelId, targetChannelId, userId, new Date().toISOString())
    .run();
  return "added";
}

export async function removeFollow(db: D1Database, sourceChannelId: string, targetChannelId: string): Promise<void> {
  await db
    .prepare("DELETE FROM channel_follows WHERE source_channel_id = ? AND target_channel_id = ?")
    .bind(sourceChannelId, targetChannelId)
    .run();
}

/**
 * Copies a new announcement into every channel following it. Returns how many
 * copies went out. A channel deleted since it followed is simply skipped.
 */
export async function deliverToFollowers(
  db: D1Database,
  sourceChannelId: string,
  original: StoredMessage,
  options: { publish?: typeof publishMessage } = {},
): Promise<number> {
  const source = await db
    .prepare(
      `SELECT c.id AS channel_id, c.name AS channel_name, s.id AS server_id, s.name AS server_name,
              s.icon AS server_icon, s.color AS server_color, s.icon_url AS server_icon_url
         FROM channels c JOIN servers s ON s.id = c.server_id
        WHERE c.id = ? AND c.kind = 'announcement'`,
    )
    .bind(sourceChannelId)
    .first<{
      channel_id: string;
      channel_name: string;
      server_id: string;
      server_name: string;
      server_icon: string | null;
      server_color: string | null;
      server_icon_url: string | null;
    }>();
  if (!source) return 0;
  const targets = await followTargets(db, sourceChannelId);
  if (!targets.length) return 0;
  const { publicMessage } = await import("../app/api/messages/route");
  const publish = options.publish ?? publishMessage;
  let sent = 0;
  for (const target of targets) {
    // Following yourself into the same channel would echo forever.
    if (target.id === sourceChannelId) continue;
    const copy = followCopy(
      {
        channelId: source.channel_id,
        channelName: source.channel_name,
        serverId: source.server_id,
        serverName: source.server_name,
        serverAvatar: source.server_icon || "",
        serverColor: source.server_color || "",
        serverIconUrl: source.server_icon_url,
      },
      original,
      target,
    );
    await db
      .prepare(
        `INSERT INTO messages
           (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key,
            attachments, is_bot, created_at, link, action_label, audio_url, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        copy.id,
        copy.channel,
        copy.channel_id,
        copy.user_id,
        copy.author,
        copy.avatar,
        copy.color,
        copy.content,
        copy.attachment_key,
        copy.attachments ?? null,
        copy.is_bot,
        copy.created_at,
        copy.link ?? null,
        copy.action_label ?? null,
        copy.audio_url ?? null,
        copy.payload,
      )
      .run();
    await publish(target.id, publicMessage(copy));
    sent += 1;
  }
  return sent;
}
