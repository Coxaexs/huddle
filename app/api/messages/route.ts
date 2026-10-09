import { currentUser, unauthorized } from "@/lib/auth";
import { enforceAutomod } from "@/lib/automod";
import { canSeeServer, channelAccess, messageAccess } from "@/lib/access";
import { channelAudience, isDmMember, reopenDmForAll } from "@/lib/dms";
import { channelKindInfo, textChannelKindsSql } from "@/lib/channel-kinds";
import { isBlockedBetween } from "@/lib/friends";
import { GUESTBOOK_CHANNEL_ID, GUESTBOOK_SERVER_ID } from "@/lib/guestbook";
import { dispatchMessage } from "@/lib/discord/dispatch";
import { hubState, publishMessage } from "@/lib/hub-client";
import { sendPushNotifications } from "@/lib/push";
import { handleMatchesName } from "@/lib/mention-handles";
import { can, Permission } from "@/lib/permissions";
import { limitUser, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { ensureSchema, DEFAULT_SERVER_ID } from "@/lib/schema";
import { bindings, type StoredMessage } from "@/lib/storage";
import { blockIfTimedOut } from "@/lib/timeouts";
import { stripTextStyle } from "@/lib/text-style";

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
  reactions?: Array<{
    emoji: string;
    count: number;
    mine: boolean;
    /** Who reacted, for hover tooltips. */
    users?: Array<{
      id: string;
      username: string;
      displayName: string;
      avatar: string;
      avatarUrl?: string | null;
      color: string;
    }>;
  }>;
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
  for (const match of text.matchAll(/(?:^|\s)@([a-zA-Z0-9._-]{2,32})/g)) {
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

  // DMs are for their participants, server channels for that server's
  // members (not banned). A thread is checked through its root message.
  if (threadId) {
    const access = await messageAccess(db, threadId, user, { includeDeleted: true });
    if (!access.ok) return access.response;
  } else if (channelId) {
    const access = await channelAccess(db, channelId, user);
    if (!access.ok) return access.response;
  } else if (!(await canSeeServer(db, DEFAULT_SERVER_ID, user))) {
    return unauthorized();
  }

  const columns = `id, channel_id, user_id, author, avatar, color, content, attachment_key,
                   is_bot, created_at, link, action_label, audio_url, kind, payload, pinned_at,
                   reply_to, edited_at, attachments, thread_id, command_text, command_by`;
  const pinnedOnly = params.get("pinned") === "1";

  // Paging: `before` loads the page older than a message, `around` loads a
  // window centred on one (search results, mentions and pins jump there).
  const beforeId = params.get("before")?.slice(0, 64) || null;
  const aroundId = params.get("around")?.slice(0, 64) || null;
  const anchorId = beforeId || aroundId;
  let anchor: { created_at: string } | null = null;
  if (anchorId && channelId && !threadId) {
    anchor = await db
      .prepare("SELECT created_at FROM messages WHERE id = ? AND channel_id = ?")
      .bind(anchorId, channelId)
      .first<{ created_at: string }>();
    if (!anchor) return Response.json({ messages: [], hasMore: false });
  }

  const scope = threadId
    ? { where: "thread_id = ? AND deleted_at IS NULL", bind: [threadId] as string[] }
    : channelId
      ? {
          where: `channel_id = ? AND deleted_at IS NULL AND thread_id IS NULL ${pinnedOnly ? "AND pinned_at IS NOT NULL" : ""}`,
          bind: [channelId] as string[],
        }
      : {
          where: "channel = ? AND channel_id IS NULL AND deleted_at IS NULL",
          bind: [channelName || "general"] as string[],
        };

  // Take the *newest* page and flip it back into reading order. Selecting
  // ASC would return the oldest 200, so once a channel passed that many
  // messages every new one became invisible after a reload.
  let rows: StoredMessage[];
  let hasMore = false;
  let hasNewer = false;
  if (anchor && aroundId) {
    const half = Math.floor(HISTORY_LIMIT / 2);
    const [older, newer] = await Promise.all([
      db
        .prepare(
          `SELECT ${columns} FROM messages WHERE ${scope.where} AND created_at <= ?
            ORDER BY created_at DESC LIMIT ${half + 1}`,
        )
        .bind(...scope.bind, anchor.created_at)
        .all(),
      db
        .prepare(
          `SELECT ${columns} FROM messages WHERE ${scope.where} AND created_at > ?
            ORDER BY created_at ASC LIMIT ${half + 1}`,
        )
        .bind(...scope.bind, anchor.created_at)
        .all(),
    ]);
    const olderRows = (older.results || []) as unknown as StoredMessage[];
    const newerRows = (newer.results || []) as unknown as StoredMessage[];
    hasMore = olderRows.length > half;
    hasNewer = newerRows.length > half;
    rows = [...olderRows.slice(0, half).reverse(), ...newerRows.slice(0, half)];
  } else {
    const result = await db
      .prepare(
        `SELECT ${columns} FROM messages WHERE ${scope.where}
          ${anchor ? "AND created_at < ?" : ""}
          ORDER BY created_at DESC LIMIT ${HISTORY_LIMIT + 1}`,
      )
      .bind(...scope.bind, ...(anchor ? [anchor.created_at] : []))
      .all();
    const page = (result.results || []) as unknown as StoredMessage[];
    hasMore = page.length > HISTORY_LIMIT;
    rows = page.slice(0, HISTORY_LIMIT).reverse();
  }

  const stored = rows;
  const messages = stored.map(publicMessage);
  await decorateMessages(db, user.id, stored, messages);

  return Response.json({ messages, hasMore, hasNewer });
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
    queryByIds<{
      message_id: string;
      emoji: string;
      user_id: string;
      username: string;
      display_name: string;
      avatar: string;
      avatar_url: string | null;
      color: string;
    }>(
      db,
      `SELECT r.message_id, r.emoji, r.user_id,
              u.username, u.display_name, u.avatar, u.avatar_url, u.color
         FROM reactions r
         JOIN users u ON u.id = r.user_id
        WHERE r.message_id IN`,
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

  // Aggregate reactions per message + emoji, keeping the list of who reacted.
  const byMessage = new Map<
    string,
    Map<
      string,
      {
        count: number;
        mine: boolean;
        users: Array<{
          id: string;
          username: string;
          displayName: string;
          avatar: string;
          avatarUrl?: string | null;
          color: string;
        }>;
      }
    >
  >();
  for (const row of reactionRows) {
    const emojis = byMessage.get(row.message_id) || new Map();
    const entry = emojis.get(row.emoji) || {
      count: 0,
      mine: false,
      users: [],
    };
    entry.count += 1;
    if (row.user_id === userId) entry.mine = true;
    entry.users.push({
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      avatarUrl: row.avatar_url,
      color: row.color,
    });
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
    }>(db, "SELECT id, author, content FROM messages WHERE deleted_at IS NULL AND id IN", missing);
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
        users: v.users,
      }));
    }
    const mentions = mentionsByMessage.get(message.id);
    if (mentions) message.mentions = mentions;
    const threadCount = threadCounts.get(message.id);
    if (threadCount) message.threadCount = threadCount;
    if (message.replyTo) {
      const parent = inPage.get(message.replyTo) || fetched.get(message.replyTo);
      message.replyPreview = parent
        ? { author: parent.author, text: stripTextStyle(parent.content).slice(0, 120) }
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
  const limited = await limitUser(db, WRITE_RATE_LIMITS.message, user.id);
  if (limited) return limited;

  const body = (await request.json()) as PostBody;
  const content = body.content?.trim() || "";
  const refused = refusedPost(body);
  if (refused) return Response.json({ error: refused }, { status: 400 });
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
  const hasPayloadForward = Boolean(
    body.payload &&
      typeof body.payload === "object" &&
      "forwardedFrom" in (body.payload as Record<string, unknown>),
  );
  if (!content && !attachmentKey && !hasPayloadForward) {
    return Response.json({ error: "A message cannot be empty." }, { status: 400 });
  }
  // A server mute covers text-to-speech: no /tts message, so nobody's browser
  // spends anything reading one aloud.
  if (body.payload && typeof body.payload === "object" && "tts" in (body.payload as Record<string, unknown>)) {
    const serverMuted = await db
      .prepare("SELECT 1 FROM server_mutes WHERE target_id = ?")
      .bind(user.id)
      .first();
    if (serverMuted) {
      return Response.json(
        { error: "A moderator muted you, so /tts is off too." },
        { status: 403 },
      );
    }
  }

  // Resolve the channel, falling back to the home server's #general.
  let channelId = body.channelId?.slice(0, 64) || null;
  let channelName = body.channel?.slice(0, 64) || "general";
  let audience: string[] | null = null;
  let serverId: string | null = null;
  if (channelId) {
    const channel = await db
      .prepare(
        `SELECT name, kind, server_id FROM channels WHERE id = ? AND kind IN (${textChannelKindsSql()})`,
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
      if (audience) {
        const others = audience.filter((id) => id !== user.id);
        for (const otherId of others) {
          if (await isBlockedBetween(db, user.id, otherId)) {
            return Response.json(
              { error: "You cannot message this user." },
              { status: 403 },
            );
          }
        }
      }
      // A new message brings a closed conversation back into both lists.
      await reopenDmForAll(db, channelId);
    } else {
      // Only members post, and banned members cannot post at all.
      if (!(await canSeeServer(db, channel.server_id, user))) {
        return Response.json(
          { error: "You are not a member of this server." },
          { status: 403 },
        );
      }
      const timedOut = await blockIfTimedOut(db, channelId, user.id);
      if (timedOut) return timedOut;

      // The hoffle.online guestbook takes visitors through /api/guestbook;
      // through here, only its moderators may post.
      if (channel.server_id === GUESTBOOK_SERVER_ID) {
        const member = await db
          .prepare("SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?")
          .bind(GUESTBOOK_SERVER_ID, user.id)
          .first();
        if (!member) return unauthorized();
      }

      // An announcement channel is a read-only feed for everyone without
      // MANAGE_MESSAGES, which is what separates it from a text channel.
      // Threads under an announcement are where members discuss it, so
      // replies there stay open to everyone.
      if (channelKindInfo(channel.kind).moderatorOnlyPosting && !body.threadId) {
        const mayPost = await can(db, user.id, serverId, Permission.MANAGE_MESSAGES);
        if (!mayPost) {
          return Response.json(
            { error: "Only moderators can post announcements here." },
            { status: 403 },
          );
        }
      }
    }
    channelName = channel.name;
  } else {
    if (!(await canSeeServer(db, DEFAULT_SERVER_ID, user))) return unauthorized();
    const channel = await db
      .prepare(
        "SELECT id FROM channels WHERE server_id = ? AND kind = 'text' AND name = ?",
      )
      .bind(DEFAULT_SERVER_ID, channelName)
      .first<{ id: string }>();
    channelId = channel?.id || null;
  }

  // A reply or thread reply must point into this same channel, so a stray id
  // cannot pull another conversation's text into a preview.
  let replyTo = body.replyTo?.slice(0, 64) || null;
  if (replyTo && channelId) {
    const parent = await db
      .prepare("SELECT 1 FROM messages WHERE id = ? AND channel_id = ? AND deleted_at IS NULL")
      .bind(replyTo, channelId)
      .first();
    if (!parent) replyTo = null;
  }
  const threadId = body.threadId?.slice(0, 64) || null;
  if (threadId) {
    const root = channelId
      ? await db
          .prepare("SELECT 1 FROM messages WHERE id = ? AND channel_id = ? AND thread_id IS NULL")
          .bind(threadId, channelId)
          .first()
      : null;
    if (!root) {
      return Response.json({ error: "That thread is gone." }, { status: 404 });
    }
  }
  // A forwarded card is rebuilt from the original message, which the sender
  // must be able to read; nothing about it is taken from the client.
  let payload = body.payload;
  if (hasPayloadForward) {
    const forwarded = await forwardedCard(
      db,
      (body.payload as { forwardedFrom?: { id?: unknown } }).forwardedFrom?.id,
      user,
    );
    if (!forwarded) {
      return Response.json({ error: "That message can't be forwarded." }, { status: 403 });
    }
    payload = { ...(body.payload as Record<string, unknown>), forwardedFrom: forwarded };
  }

  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    channel: channelName,
    channel_id: channelId,
    user_id: body.asBot ? null : user.id,
    author: body.asBot ? botName(body.botName) : user.display_name,
    avatar: body.asBot
      ? body.botAvatar?.trim().slice(0, 4) || "✦"
      : user.avatar,
    color: body.asBot ? "#b8a6ff" : user.color,
    content:
      content ||
      (hasPayloadForward
        ? "Forwarded a message"
        : attachmentKey?.toLowerCase().endsWith(".pdf")
          ? "Shared a PDF document"
          : "Shared an image"),
    attachment_key: attachmentKey,
    is_bot: body.asBot ? 1 : 0,
    created_at: new Date().toISOString(),
    link: safeLink(body.link),
    action_label: body.actionLabel?.trim().slice(0, 80) || null,
    audio_url: safeAudio(body.audio),
    kind: body.kind?.trim().slice(0, 32) || null,
    payload: payload ? JSON.stringify(stripServerOnly(payload)).slice(0, 8000) : null,
    reply_to: replyTo,
    attachments: extraKeys.length ? JSON.stringify(extraKeys) : null,
    thread_id: threadId,
    // Command attribution only makes sense on a bot answer, and it always
    // names the person who really sent it.
    command_text: body.asBot ? body.commandText?.trim().slice(0, 200) || null : null,
    command_by: body.asBot ? user.display_name : null,
    sender_id: user.id,
  };

  // Resolve @mentions before writing anything: automod needs the count, and a
  // refused message must leave no row behind. A handle can be a username or a
  // role name; a role expands to its members.
  const handles = content ? parseMentionHandles(content) : [];
  let mentionedIds: string[] = [];
  if (handles.length && channelId) {
    const placeholders = handles.map(() => "?").join(",");
    const [userRows, roleRows] = await Promise.all([
      // Only people who can see this channel can be mentioned (and pushed).
      serverId && !audience
        ? db
            .prepare(
              `SELECT u.id FROM users u
                 JOIN server_members m ON m.user_id = u.id AND m.server_id = ?
                WHERE u.username_lower IN (${placeholders})`,
            )
            .bind(serverId, ...handles)
            .all()
        : db
            .prepare(`SELECT id FROM users WHERE username_lower IN (${placeholders})`)
            .bind(...handles)
            .all(),
      // Role names can hold spaces, so they're matched by handle in JS
      // ("Game Master" is written @Game-Master).
      serverId
        ? db
            .prepare(
              `SELECT mr.user_id AS id, r.name AS name
                 FROM roles r
                 JOIN member_roles mr ON mr.role_id = r.id
                WHERE r.server_id = ?`,
            )
            .bind(serverId)
            .all()
        : Promise.resolve({ results: [] as Array<{ id: string; name: string }> }),
    ]);
    const roleMemberIds = ((roleRows.results || []) as Array<{ id: string; name: string }>)
      .filter((row) => handles.some((handle) => handleMatchesName(handle, row.name)))
      .map((row) => row.id);
    // @everyone pings every member of the server; @here only those online.
    // Both need MENTION_EVERYONE, and mean nothing in DMs.
    const wantsEveryone = handles.includes("everyone");
    const wantsHere = handles.includes("here");
    let broadcastIds: string[] = [];
    if (
      (wantsEveryone || wantsHere) &&
      serverId &&
      !audience &&
      (await can(db, user.id, serverId, Permission.MENTION_EVERYONE))
    ) {
      const members = await db
        .prepare("SELECT user_id FROM server_members WHERE server_id = ?")
        .bind(serverId)
        .all<{ user_id: string }>();
      broadcastIds = (members.results || []).map((row) => row.user_id);
      if (!wantsEveryone) {
        const online = new Set((await hubState())?.online || []);
        broadcastIds = broadcastIds.filter((id) => online.has(id));
      }
    }
    mentionedIds = [
      ...new Set([
        ...(userRows.results || []).map((r) => (r as { id: string }).id),
        ...roleMemberIds,
        ...broadcastIds,
      ]),
    ].filter((id) => id !== user.id && (!audience || audience.includes(id)));
  }

  // ---- Automod ------------------------------------------------------------
  // Skipped for DMs (a server's rules must not police a private conversation)
  // and for anyone who can moderate — otherwise the first thing a keyword rule
  // does is lock an admin out of their own server. Bot-flagged posts come from
  // a member's browser, so they still get the keyword and mention rules.
  if (serverId && !audience) {
    const refused = await enforceAutomod(db, {
      serverId,
      channelId,
      userId: user.id,
      text: stored.content,
      mentionCount: mentionedIds.length,
      asBot: Boolean(body.asBot),
      mayModerate: () => can(db, user.id, serverId!, Permission.MODERATE),
    });
    if (refused) return refused;
  }

  await db
    .prepare(
      `INSERT INTO messages
       (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key,
        is_bot, created_at, link, action_label, audio_url, kind, payload, reply_to, attachments,
        thread_id, command_text, command_by, sender_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      stored.sender_id,
    )
    .run();

  const message = publicMessage(stored);

  // Record the mentions resolved before the insert. Doing it here keeps the
  // write after the message row exists, so an automod refusal above cannot
  // leave orphaned mention rows behind.
  if (mentionedIds.length && channelId) {
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

  // Resolve the reply preview for the pushed event, if any.
  if (stored.reply_to) {
    const parent = await db
      .prepare("SELECT author, content FROM messages WHERE id = ?")
      .bind(stored.reply_to)
      .first<{ author: string; content: string }>();
    if (parent) {
      message.replyPreview = {
        author: parent.author,
        text: stripTextStyle(parent.content).slice(0, 120),
      };
    }
  }

  await publishMessage(channelId || channelName, message, audience);

  // Connected Discord bots see the same message. This runs after the hub
  // publish so a slow or absent gateway never delays the sender's own tabs.
  void dispatchMessage("MESSAGE_CREATE", stored, {
    origin: new URL(request.url).origin,
  });

  const pushTargets = new Set<string>();
  if (message.mentions) {
    for (const id of message.mentions) pushTargets.add(id);
  }
  if (audience) {
    for (const id of audience) {
      if (id !== user.id) pushTargets.add(id);
    }
  }
  if (pushTargets.size > 0) {
    // Awaited: a Worker may drop un-awaited work once the response is sent,
    // which silently lost these notifications. sendPushNotifications never throws.
    await sendPushNotifications(db, Array.from(pushTargets), {
      title: stripTextStyle(stored.author),
      body: stored.content ? stripTextStyle(stored.content).slice(0, 120) : "Shared an attachment",
      url: `/hangout`,
      tag: `msg-${stored.channel_id || stored.channel}`,
    });
  }

  return Response.json({ message }, { status: 201 });
}

/** The names a signed-in member's browser may post bot answers under. */
const BOT_NAMES = new Set(["Music + Watch", "D&D Bot", "Huddle Bot"]);

function botName(raw: string | undefined): string {
  const name = raw?.trim() || "";
  return BOT_NAMES.has(name) ? name : "Huddle Bot";
}

/**
 * Kinds the server creates itself (games, polls, AI answers, system notices)
 * cannot be posted from a browser, or anyone could fake one.
 */
function refusedPost(body: PostBody): string | null {
  const kind = body.kind?.trim() || "";
  if (kind === "game" || kind === "poll" || kind === "ai" || kind.startsWith("system")) {
    return "That kind of message can't be posted directly.";
  }
  return null;
}

/** Only web links and Hoffle's own pages make it onto a message button. */
function safeLink(raw: string | undefined): string | null {
  const value = raw?.trim().slice(0, 1000) || "";
  if (!value) return null;
  if (value.startsWith("/hangout/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Audio plays from our own uploads only. An outside URL would be fetched by
 * every reader's browser, handing their IP address to whoever posted it.
 */
function safeAudio(raw: string | undefined): string | null {
  const value = raw?.trim().slice(0, 1000) || "";
  return /^\/hangout\/api\/uploads\/[^/?#]+$/.test(value) ? value : null;
}

/** Drops payload fields only the server may set (the verified-roll mark). */
function stripServerOnly(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const copy = { ...(payload as Record<string, unknown>) };
  delete copy.verified;
  return copy;
}

/** A forwarded card built from the stored original, if `user` may read it. */
async function forwardedCard(
  db: D1Database,
  rawId: unknown,
  user: { id: string; is_admin?: number },
): Promise<Record<string, unknown> | null> {
  if (typeof rawId !== "string" || !rawId) return null;
  const original = await db
    .prepare(
      `SELECT m.id, m.channel_id, m.user_id, m.author, m.avatar, m.color, m.content,
              m.attachment_key, m.attachments, m.is_bot, m.created_at,
              u.username, u.avatar_url
         FROM messages m
         LEFT JOIN users u ON u.id = m.user_id
        WHERE m.id = ? AND m.deleted_at IS NULL`,
    )
    .bind(rawId.slice(0, 64))
    .first<StoredMessage & { username: string | null; avatar_url: string | null }>();
  if (!original?.channel_id) return null;
  const access = await channelAccess(db, original.channel_id, user);
  if (!access.ok) return null;
  const server = access.channel.isDm
    ? null
    : await db
        .prepare("SELECT name FROM servers WHERE id = ?")
        .bind(access.channel.serverId)
        .first<{ name: string }>();
  const shown = publicMessage({ ...original, channel: "" });
  return {
    id: original.id,
    author: original.author,
    userId: original.user_id || null,
    username: original.username || undefined,
    avatar: original.avatar,
    avatarUrl: original.avatar_url || null,
    color: original.color,
    text: original.content,
    image: shown.image,
    images: shown.images,
    file: shown.file,
    channelName: access.channel.isDm ? undefined : access.channel.name,
    serverName: server?.name,
    createdAt: original.created_at,
  };
}
