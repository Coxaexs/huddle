import { publicMessage } from "@/app/api/messages/route";
import { channelAudience } from "./dms";
import { publishMessage } from "./hub-client";
import type { StoredMessage } from "./storage";

/**
 * Kinds of one-line notices the app posts on its own ("Ana pinned a
 * message"). They render as a centred line rather than a chat bubble.
 */
export type SystemKind =
  | "system-pin"
  | "system-group-add"
  | "system-group-leave"
  | "system-group-remove"
  | "system-group-rename"
  | "system-group-create";

/**
 * Stores and broadcasts a notice in a channel, attributed to `actor` so the
 * client can show their name and avatar. `content` is the plain-text form
 * (search, push, older clients); `payload` carries what the UI links to.
 */
export async function postSystemMessage(
  db: D1Database,
  channelId: string,
  actor: { id: string; display_name: string; avatar: string; color: string },
  kind: SystemKind,
  content: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const channel = await db
    .prepare("SELECT name FROM channels WHERE id = ?")
    .bind(channelId)
    .first<{ name: string }>();
  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    channel: channel?.name || "",
    channel_id: channelId,
    user_id: actor.id,
    author: actor.display_name,
    avatar: actor.avatar,
    color: actor.color,
    content,
    attachment_key: null,
    is_bot: 0,
    created_at: new Date().toISOString(),
    kind,
    payload: payload ? JSON.stringify(payload).slice(0, 8000) : null,
  };
  await db
    .prepare(
      `INSERT INTO messages
       (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key,
        is_bot, created_at, kind, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stored.id,
      stored.channel,
      stored.channel_id,
      stored.user_id,
      stored.author,
      stored.avatar,
      stored.color,
      stored.content,
      null,
      0,
      stored.created_at,
      stored.kind,
      stored.payload,
    )
    .run();
  await publishMessage(
    channelId,
    publicMessage(stored),
    await channelAudience(db, channelId),
  );
}
