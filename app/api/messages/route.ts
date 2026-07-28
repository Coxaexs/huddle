import { currentUser, unauthorized } from "@/lib/auth";
import { channelAudience, isDmMember } from "@/lib/dms";
import { publishMessage } from "@/lib/hub-client";
import { ensureSchema, DEFAULT_SERVER_ID } from "@/lib/schema";
import { bindings, type StoredMessage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** How many messages a channel (or thread) loads at once. */
const HISTORY_LIMIT = 200;

export interface PublicMessage {
  id: string;
  channelId: string | null;
  userId: string | null;
  author: string;
  avatar: string;
  color: string;
  text: string;
  bot: boolean;
  time: string;
  createdAt: string;
  image?: string;
  /** Additional image attachments beyond `image`. */
  images?: string[];
  file?: { url: string; name: string; type: "pdf" };
  link?: string;
  actionLabel?: string;
  audio?: string;
  /** Rich cards (currently "nowplaying") render instead of plain text. */
  kind?: string;
  payload?: unknown;
  pinned?: boolean;
  editedAt?: string;
  /** Id of the message this one replies to, plus a small preview of it. */
  replyTo?: string;
  replyPreview?: { author: string; text: string } | null;
  /** Emoji reactions, aggregated. `mine` is set per requesting user. */
  reactions?: Array<{ emoji: string; count: number; mine: boolean }>;
  /** User ids named in this message, for highlighting and unread badges. */
  mentions?: string[];
  /** Set on thread replies. */
  threadId?: string;
  /** On a thread's root message: how many replies it has. */
  threadCount?: number;
  /** On a bot answer to a slash command: the command run and who ran it. */
  commandText?: string;
  commandBy?: string;
}

export function publicMessage(message: StoredMessage): PublicMessage {
  let payload: unknown;
  if (message.payload) {
    try {
      payload = JSON.parse(message.payload);
    } catch {
      payload = undefined;
    }
  }

  const attachmentUrl = message.attachment_key
    ? `/hangout/api/uploads/${encodeURIComponent(message.attachment_key)}`
    : undefined;
  const isPdf = Boolean(message.attachment_key?.toLowerCase().endsWith(".pdf"));
  const attachmentName =
    message.attachment_key?.split("--").slice(1).join("--") || "document.pdf";

  return {
    id: message.id,
    channelId: message.channel_id || null,
    userId: message.user_id || null,
    author: message.author,
    avatar: message.avatar,
    color: message.color,
    text: message.content,
    bot: Boolean(message.is_bot),
    time: new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(new Date(message.created_at)),
    createdAt: message.created_at,
    image: attachmentUrl && !isPdf ? attachmentUrl : undefined,
    file:
      attachmentUrl && isPdf
        ? { url: attachmentUrl, name: attachmentName, type: "pdf" }
        : undefined,
    link: message.link || undefined,
    actionLabel: message.action_label || undefined,
    audio: message.audio_url || undefined,
    kind: message.kind || undefined,
    payload,
    pinned: Boolean(message.pinned_at),
    editedAt: message.edited_at || undefined,
    replyTo: message.reply_to || undefined,
    images: extraAttachments(message.attachments),
    threadId: message.thread_id || undefined,
    commandText: message.command_text || undefined,
    commandBy: message.command_by || undefined,
  };
}

/** Parses the extra-attachments JSON column into public URLs. */
function extraAttachments(raw: string | null | undefined): string[] | undefined {
  if (!raw) return undefined;
  try {
    const keys = JSON.parse(raw) as unknown;
    if (!Array.isArray(keys)) return undefined;
    const urls = keys
      .filter((key): key is string => typeof key === "string")
      .map((key) => `/hangout/api/uploads/${encodeURIComponent(key)}`);
    return urls.length ? urls : undefined;
  } catch {
    return undefined;
  }
}

/** Parses `@username` tokens from message text (used for mentions). */
export function parseMentionHandles(text: string): string[] {
  const handles = new Set<string>();
  for (const match of text.matchAll(/(?:^|\s)@([a-zA-Z0-9._-]{2,24})/g)) {
    handles.add(match[1].toLowerCase());
  }
  return [...handles];
}

/**
 * Reads a channel's history. `channelId` is the modern form; `channel` (a name)
 * is still accepted because bots address channels by name.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ messages: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const params = new URL(request.url).searchParams;
  const channelId = params.get("channelId")?.slice(0, 64);
  const channelName = params.get("channel")?.slice(0, 64);
  const threadId = params.get("threadId")?.slice(0, 64);

  // A DM is only readable by its two participants; every other channel is
  // open to everyone in this Huddle.
  if (channelId) {
    const audience = await channelAudience(db, channelId);
    if (audience && !audience.includes(user.id)) return unauthorized();
  }

  const columns = `id, channel_id, user_id, author, avatar, color, content, attachment_key,
                   is_bot, created_at, link, action_label, audio_url, kind, payload, pinned_at,
                   reply_to, edited_at, attachments, thread_id, command_text, command_by`;
  const pinnedOnly = params.get("pinned") === "1";
  // Take the *newest* page and flip it back into reading order. Selecting
  // ASC would return the oldest 200, so once a channel passed that many
  // messages every new one became invisible after a reload.
  const result = threadId
    ? await db
        .prepare(
          `SELECT ${columns} FROM messages
            WHERE thread_id = ? AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT ${HISTORY_LIMIT}`,
        )
        .bind(threadId)
        .all()
    : channelId
    ? await db
        .prepare(
          `SELECT ${columns} FROM messages
            WHERE channel_id = ? AND deleted_at IS NULL AND thread_id IS NULL
              ${pinnedOnly ? "AND pinned_at IS NOT NULL" : ""}
            ORDER BY created_at DESC LIMIT ${HISTORY_LIMIT}`,
        )
        .bind(channelId)
        .all()
    : await db
        .prepare(
          `SELECT ${columns} FROM messages
            WHERE channel = ? AND channel_id IS NULL AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT ${HISTORY_LIMIT}`,
        )
        .bind(channelName || "general")
        .all();

  const stored = ((result.results || []) as unknown as StoredMessage[]).reverse();
  const messages = stored.map(publicMessage);
  await decorateMessages(db, user.id, stored, messages);

  return Response.json({ messages });
}

/**
 * Runs `${sql} (?, ?, …)` over `ids`, chunked to stay under D1's ~100 bound
 * variable limit, and concatenates the rows.
 */
async function queryByIds<T>(
  db: D1Database,
  sql: string,
  ids: string[],
  suffix = "",
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await db
      .prepare(`${sql} (${chunk.map(() => "?").join(",")}) ${suffix}`)
      .bind(...chunk)
      .all();
    out.push(...((rows.results || []) as T[]));
  }
  return out;
}

/**
 * Attaches reactions, reply previews and mentions to a page of messages in a
 * few batch queries rather than one per row.
 */
async function decorateMessages(
  db: D1Database,
  userId: string,
  stored: StoredMessage[],
  messages: PublicMessage[],
): Promise<void> {
  if (!messages.length) return;
  const ids = messages.map((m) => m.id);

  const [reactionRows, mentionRows, threadRows] = await Promise.all([
    queryByIds<{ message_id: string; emoji: string; user_id: string }>(
      db,
      "SELECT message_id, emoji, user_id FROM reactions WHERE message_id IN",
      ids,
    ),
    queryByIds<{ message_id: string; user_id: string }>(
      db,
      "SELECT message_id, user_id FROM mentions WHERE message_id IN",
      ids,
    ),
    queryByIds<{ thread_id: string; count: number }>(
      db,
      `SELECT thread_id, COUNT(*) AS count FROM messages
        WHERE deleted_at IS NULL AND thread_id IN`,
      ids,
      "GROUP BY thread_id",
    ),
  ]);
  const threadCounts = new Map(threadRows.map((r) => [r.thread_id, r.count]));

  // Aggregate reactions per message + emoji.
  const byMessage = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const row of reactionRows) {
    const emojis = byMessage.get(row.message_id) || new Map();
    const entry = emojis.get(row.emoji) || { count: 0, mine: false };
    entry.count += 1;
    if (row.user_id === userId) entry.mine = true;
    emojis.set(row.emoji, entry);
    byMessage.set(row.message_id, emojis);
  }
  const mentionsByMessage = new Map<string, string[]>();
  for (const row of mentionRows) {
    const list = mentionsByMessage.get(row.message_id) || [];
    list.push(row.user_id);
    mentionsByMessage.set(row.message_id, list);
  }

  // Reply previews: resolve parents (mostly present in this same page).
  const inPage = new Map(stored.map((m) => [m.id, m]));
  const missing = [
    ...new Set(
      messages
        .map((m) => m.replyTo)
        .filter((id): id is string => Boolean(id) && !inPage.has(id as string)),
    ),
  ];
  const fetched = new Map<string, { author: string; content: string }>();
  if (missing.length) {
    const rows = await queryByIds<{
      id: string;
      author: string;
      content: string;
    }>(db, "SELECT id, author, content FROM messages WHERE id IN", missing);
    for (const row of rows) {
      fetched.set(row.id, { author: row.author, content: row.content });
    }
  }

  for (const message of messages) {
    const emojis = byMessage.get(message.id);
    if (emojis) {
      message.reactions = [...emojis.entries()].map(([emoji, v]) => ({
        emoji,
        count: v.count,
        mine: v.mine,
      }));
    }
    const mentions = mentionsByMessage.get(message.id);
    if (mentions) message.mentions = mentions;
    const threadCount = threadCounts.get(message.id);
    if (threadCount) message.threadCount = threadCount;
    if (message.replyTo) {
      const parent = inPage.get(message.replyTo) || fetched.get(message.replyTo);
      message.replyPreview = parent
        ? { author: parent.author, text: parent.content.slice(0, 120) }
        : null;
    }
  }
}

interface PostBody {
  channelId?: string;
  channel?: string;
  content?: string;
  attachmentKey?: string;
  link?: string;
  actionLabel?: string;
  audio?: string;
  kind?: string;
  payload?: unknown;
  /** Id of a message in the same channel this one replies to. */
  replyTo?: string;
  /** Extra uploaded keys beyond `attachmentKey`. */
  attachmentKeys?: string[];
  /** Posting into a thread: the id of the message that started it. */
  threadId?: string;
  /** Apps answer in-channel as a bot; this is a private Huddle, so any
   *  signed-in member may do it (that is what /roll and /watch use). */
  asBot?: boolean;
  botName?: string;
  botAvatar?: string;
  /** When a bot message answers a slash command: the command and who ran it. */
  commandText?: string;
  commandBy?: string;
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json()) as PostBody;
  const content = body.content?.trim().slice(0, 4000) || "";
  // The first key stays in attachment_key; any extras go to the JSON column,
  // so existing rows and older clients keep rendering the same way.
  const allKeys = [
    ...(body.attachmentKey ? [body.attachmentKey] : []),
    ...(Array.isArray(body.attachmentKeys) ? body.attachmentKeys : []),
  ]
    .filter((key): key is string => typeof key === "string" && key.length > 0)
    .slice(0, 10)
    .map((key) => key.slice(0, 240));
  const attachmentKey = allKeys[0] || null;
  const extraKeys = allKeys.slice(1);
  if (!content && !attachmentKey) {
    return Response.json({ error: "A message cannot be empty." }, { status: 400 });
  }

  // Resolve the channel, falling back to the home server's #general.
  let channelId = body.channelId?.slice(0, 64) || null;
  let channelName = body.channel?.slice(0, 64) || "general";
  let audience: string[] | null = null;
  let serverId: string | null = null;
  if (channelId) {
    const channel = await db
      .prepare(
        "SELECT name, kind, server_id FROM channels WHERE id = ? AND kind IN ('text', 'dm')",
      )
      .bind(channelId)
      .first<{ name: string; kind: string; server_id: string }>();
    if (!channel) {
      return Response.json({ error: "That channel is gone." }, { status: 404 });
    }
    serverId = channel.server_id;
    if (channel.kind === "dm") {
      if (!(await isDmMember(db, channelId, user.id))) return unauthorized();
      audience = await channelAudience(db, channelId);
    } else {
      // Banned members cannot post in the server they were banned from.
      const banned = await db
        .prepare("SELECT user_id FROM bans WHERE server_id = ? AND user_id = ?")
        .bind(channel.server_id, user.id)
        .first();
      if (banned) {
        return Response.json(
          { error: "You are banned from this server." },
          { status: 403 },
        );
      }
    }
    channelName = channel.name;
  } else {
    const channel = await db
      .prepare(
        "SELECT id FROM channels WHERE server_id = ? AND kind = 'text' AND name = ?",
      )
      .bind(DEFAULT_SERVER_ID, channelName)
      .first<{ id: string }>();
    channelId = channel?.id || null;
  }

  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    channel: channelName,
    channel_id: channelId,
    user_id: body.asBot ? null : user.id,
    author: body.asBot
      ? body.botName?.trim().slice(0, 80) || "Huddle Bot"
      : user.display_name,
    avatar: body.asBot
      ? body.botAvatar?.trim().slice(0, 4) || "✦"
      : user.avatar,
    color: body.asBot ? "#b8a6ff" : user.color,
    content:
      content ||
      (attachmentKey?.toLowerCase().endsWith(".pdf")
        ? "Shared a PDF document"
        : "Shared an image"),
    attachment_key: attachmentKey,
    is_bot: body.asBot ? 1 : 0,
    created_at: new Date().toISOString(),
    link: body.link?.trim().slice(0, 1000) || null,
    action_label: body.actionLabel?.trim().slice(0, 80) || null,
    audio_url: body.audio?.trim().slice(0, 8000) || null,
    kind: body.kind?.trim().slice(0, 32) || null,
    payload: body.payload ? JSON.stringify(body.payload).slice(0, 8000) : null,
    reply_to: body.replyTo?.slice(0, 64) || null,
    attachments: extraKeys.length ? JSON.stringify(extraKeys) : null,
    thread_id: body.threadId?.slice(0, 64) || null,
    // Command attribution only makes sense on a bot answer.
    command_text: body.asBot ? body.commandText?.trim().slice(0, 200) || null : null,
    command_by: body.asBot ? body.commandBy?.trim().slice(0, 80) || null : null,
  };

  await db
    .prepare(
      `INSERT INTO messages
       (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key,
        is_bot, created_at, link, action_label, audio_url, kind, payload, reply_to, attachments,
        thread_id, command_text, command_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      stored.attachment_key,
      stored.is_bot,
      stored.created_at,
      stored.link,
      stored.action_label,
      stored.audio_url,
      stored.kind,
      stored.payload,
      stored.reply_to,
      stored.attachments,
      stored.thread_id,
      stored.command_text,
      stored.command_by,
    )
    .run();

  const message = publicMessage(stored);

  // Resolve @mentions to real members and record them (drives unread badges).
  // A handle can be a username or a role name; a role expands to its members.
  const handles = content ? parseMentionHandles(content) : [];
  if (handles.length && channelId) {
    const placeholders = handles.map(() => "?").join(",");
    const [userRows, roleRows] = await Promise.all([
      db
        .prepare(`SELECT id FROM users WHERE username_lower IN (${placeholders})`)
        .bind(...handles)
        .all(),
      serverId
        ? db
            .prepare(
              `SELECT mr.user_id AS id
                 FROM roles r
                 JOIN member_roles mr ON mr.role_id = r.id
                WHERE r.server_id = ? AND LOWER(r.name) IN (${placeholders})`,
            )
            .bind(serverId, ...handles)
            .all()
        : Promise.resolve({ results: [] as Array<{ id: string }> }),
    ]);
    const mentionedIds = [
      ...new Set(
        [...(userRows.results || []), ...(roleRows.results || [])].map(
          (r) => (r as { id: string }).id,
        ),
      ),
    ].filter((id) => id !== user.id);
    if (mentionedIds.length) {
      await db.batch(
        mentionedIds.map((id) =>
          db
            .prepare(
              "INSERT OR IGNORE INTO mentions (message_id, user_id, channel_id, created_at) VALUES (?, ?, ?, ?)",
            )
            .bind(stored.id, id, channelId, stored.created_at),
        ),
      );
      message.mentions = mentionedIds;
    }
  }

  // Resolve the reply preview for the pushed event, if any.
  if (stored.reply_to) {
    const parent = await db
      .prepare("SELECT author, content FROM messages WHERE id = ?")
      .bind(stored.reply_to)
      .first<{ author: string; content: string }>();
    if (parent) {
      message.replyPreview = {
        author: parent.author,
        text: parent.content.slice(0, 120),
      };
    }
  }

  await publishMessage(channelId || channelName, message, audience);
  return Response.json({ message }, { status: 201 });
}
