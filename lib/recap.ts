/**
 * Server recaps: a week of a server in one bot message (busiest channels,
 * chattiest people, the most-reacted message, favourite emoji, new faces).
 *
 * On demand with /recap, or weekly with /recap weekly, which the hub's alarm
 * posts into the channel it was switched on in.
 */
import type { PostOptions } from "../app/api/messages/route";
import { publishMessage } from "./hub-client";
import { textChannelKindsSql } from "./channel-kinds";

export const RECAP_WEEK_MS = 7 * 86_400_000;

export async function ensureRecapTable(db: D1Database): Promise<void> {
  await db
    .prepare(`CREATE TABLE IF NOT EXISTS server_recaps (
        server_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        next_at INTEGER NOT NULL,
        created_by TEXT
      )`)
    .run();
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The recap text for a server since `since` (ms), or null if it was silent. */
export async function buildRecap(db: D1Database, serverId: string, since: number): Promise<string | null> {
  const from = new Date(since).toISOString();
  const inServer = `m.channel_id IN (SELECT id FROM channels WHERE server_id = ?1 AND kind IN (${textChannelKindsSql()}))
     AND m.created_at > ?2 AND m.deleted_at IS NULL AND m.is_bot = 0 AND m.user_id IS NOT NULL`;
  const [totals, channels, people, reacted, emoji, joined] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS messages, COUNT(DISTINCT m.user_id) AS people FROM messages m WHERE ${inServer}`)
      .bind(serverId, from)
      .first<{ messages: number; people: number }>(),
    db
      .prepare(
        `SELECT c.name, COUNT(*) AS count FROM messages m JOIN channels c ON c.id = m.channel_id
          WHERE ${inServer} GROUP BY m.channel_id ORDER BY count DESC LIMIT 3`,
      )
      .bind(serverId, from)
      .all<{ name: string; count: number }>(),
    db
      .prepare(
        `SELECT COALESCE(u.display_name, m.author) AS name, COUNT(*) AS count
           FROM messages m LEFT JOIN users u ON u.id = m.user_id
          WHERE ${inServer} GROUP BY m.user_id ORDER BY count DESC LIMIT 3`,
      )
      .bind(serverId, from)
      .all<{ name: string; count: number }>(),
    db
      .prepare(
        `SELECT m.content, COALESCE(u.display_name, m.author) AS name, COUNT(*) AS count
           FROM reactions r JOIN messages m ON m.id = r.message_id LEFT JOIN users u ON u.id = m.user_id
          WHERE ${inServer} GROUP BY r.message_id ORDER BY count DESC LIMIT 1`,
      )
      .bind(serverId, from)
      .first<{ content: string; name: string; count: number }>(),
    db
      .prepare(
        `SELECT r.emoji, COUNT(*) AS count FROM reactions r JOIN messages m ON m.id = r.message_id
          WHERE ${inServer} GROUP BY r.emoji ORDER BY count DESC LIMIT 5`,
      )
      .bind(serverId, from)
      .all<{ emoji: string; count: number }>(),
    db
      .prepare("SELECT COUNT(*) AS count FROM server_members WHERE server_id = ? AND joined_at > ?")
      .bind(serverId, from)
      .first<{ count: number }>(),
  ]);

  if (!totals?.messages) return null;
  const medals = ["🥇", "🥈", "🥉"];
  const lines = [
    `📊 **Weekly recap** · ${plural(totals.messages, "message")} from ${plural(totals.people, "person").replace("persons", "people")}`,
  ];
  const channelList = channels.results || [];
  if (channelList.length) {
    lines.push(`**Busiest channels:** ${channelList.map((row) => `#${row.name} (${row.count})`).join(", ")}`);
  }
  const peopleList = people.results || [];
  if (peopleList.length) {
    lines.push(
      `**Most talkative:** ${peopleList.map((row, index) => `${medals[index]} ${row.name} (${row.count})`).join("  ")}`,
    );
  }
  if (reacted?.count) {
    const snippet = reacted.content.replace(/\s+/g, " ").trim();
    lines.push(
      `**Most loved message:** ${reacted.name}: “${snippet.length > 120 ? `${snippet.slice(0, 117)}…` : snippet}” (${plural(reacted.count, "reaction")})`,
    );
  }
  const emojiList = emoji.results || [];
  if (emojiList.length) {
    lines.push(`**Favourite reactions:** ${emojiList.map((row) => `${row.emoji} ×${row.count}`).join("  ")}`);
  }
  if (joined?.count) lines.push(`**New faces:** ${plural(joined.count, "member")} joined 👋`);
  return lines.join("\n");
}

/** Posts a recap into a channel as Huddle Bot; returns false if there was nothing to say. */
export async function postRecap(
  db: D1Database,
  serverId: string,
  channelId: string,
  options: Pick<PostOptions, "publish"> = {},
  now = Date.now(),
): Promise<boolean> {
  const text = await buildRecap(db, serverId, now - RECAP_WEEK_MS);
  if (!text) return false;
  const channel = await db.prepare("SELECT name FROM channels WHERE id = ?").bind(channelId).first<{ name: string }>();
  if (!channel) return false;
  const message = {
    id: crypto.randomUUID(),
    channelId,
    userId: null,
    author: "Huddle Bot",
    avatar: "✦",
    color: "#b8a6ff",
    text,
    bot: true,
    createdAt: new Date(now).toISOString(),
    time: "",
  };
  await db
    .prepare(
      `INSERT INTO messages
       (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key, is_bot, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, 1, ?)`,
    )
    .bind(message.id, channel.name, channelId, message.author, message.avatar, message.color, text, message.createdAt)
    .run();
  await (options.publish ?? publishMessage)(channelId, message, null);
  return true;
}

export async function nextRecapAlarm(db: D1Database): Promise<number | null> {
  await ensureRecapTable(db);
  const row = await db.prepare("SELECT MIN(next_at) AS due FROM server_recaps").first<{ due: number | null }>();
  return row?.due ?? null;
}

/** Posts every weekly recap that is due and books the next one. */
export async function deliverDueRecaps(
  db: D1Database,
  options: Pick<PostOptions, "publish">,
  now = Date.now(),
): Promise<void> {
  await ensureRecapTable(db);
  const due = await db
    .prepare("SELECT server_id, channel_id, next_at FROM server_recaps WHERE next_at <= ?")
    .bind(now)
    .all<{ server_id: string; channel_id: string; next_at: number }>();
  for (const row of due.results || []) {
    // Claim by moving next_at on; a second alarm sees nothing due.
    let next = row.next_at + RECAP_WEEK_MS;
    while (next <= now) next += RECAP_WEEK_MS;
    const claimed = await db
      .prepare("UPDATE server_recaps SET next_at = ? WHERE server_id = ? AND next_at = ?")
      .bind(next, row.server_id, row.next_at)
      .run();
    if (!claimed.meta.changes) continue;
    await postRecap(db, row.server_id, row.channel_id, options, now).catch(() => false);
  }
}
