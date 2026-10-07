import { publicMessage } from "@/app/api/messages/route";
import { channelAudience, findOrCreateDm, reopenDmForAll } from "./dms";
import { publishMessage, publishStructureChange } from "./hub-client";
import { sendPushNotifications } from "./push";
import type { StoredMessage } from "./storage";

export type RequestCategory = "feature" | "bug" | "improvement" | "other";
export type RequestStatus = "pending" | "in_progress" | "completed" | "declined";

export interface UserRequest {
  id: string;
  userId: string;
  title: string;
  category: RequestCategory;
  details: string;
  status: RequestStatus;
  responseNote?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    avatarUrl?: string | null;
    color: string;
  };
}

/** Primary target user IDs for Kiwi and Flo */
export const KIWI_USER_ID = "b4203f0e-38a7-43f1-b1b5-374116afb49d";
export const FLO_USER_ID = "ac9e8e27-6cd9-4df1-af7a-afd85a59caa0";

const KNOWN_HANDLER_IDS = new Set([KIWI_USER_ID, FLO_USER_ID]);
const KNOWN_HANDLER_USERNAMES = new Set(["kiwi", "..", "zar", "flo"]);

export interface RecipientUser {
  id: string;
  username: string;
  displayName: string;
}

/**
 * Checks if a user is authorized to manage community requests (Kiwi, Flo, or any server admin).
 */
export function isRequestHandler(user: {
  id: string;
  username?: string;
  is_admin?: number;
}): boolean {
  if (Boolean(user.is_admin)) return true;
  if (KNOWN_HANDLER_IDS.has(user.id)) return true;
  if (user.username && KNOWN_HANDLER_USERNAMES.has(user.username.toLowerCase())) {
    return true;
  }
  return false;
}

/**
 * Resolves Kiwi and Flo user records from the database.
 * Supports exact IDs and fallback username matching.
 */
export async function resolveRequestRecipients(
  db: D1Database,
): Promise<RecipientUser[]> {
  const rows = await db
    .prepare(
      `SELECT id, username, display_name
       FROM users
       WHERE id IN (?, ?)
          OR username_lower IN ('kiwi', '..', 'zar')
          OR (display_name COLLATE NOCASE = 'Flo' AND username_lower != 'flooo')`,
    )
    .bind(KIWI_USER_ID, FLO_USER_ID)
    .all<{ id: string; username: string; display_name: string }>();

  const map = new Map<string, RecipientUser>();
  for (const row of (rows.results || []) as Array<{
    id: string;
    username: string;
    display_name: string;
  }>) {
    if (row.username.toLowerCase() === "flooo") continue;
    map.set(row.id, {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
    });
  }
  return Array.from(map.values());
}

const CATEGORY_LABELS: Record<RequestCategory, string> = {
  feature: "💡 Feature Request",
  bug: "🐛 Bug Report",
  improvement: "⚡ Improvement",
  other: "💬 Request",
};

/**
 * Submits a new user request and delivers direct messages to Kiwi and Flo.
 */
export async function submitRequest(
  db: D1Database,
  requester: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    color: string;
  },
  input: {
    title: string;
    category?: string;
    details: string;
  },
): Promise<{ request: UserRequest; deliveredTo: string[] }> {
  const title = input.title.trim().slice(0, 150);
  const details = input.details.trim().slice(0, 4000);
  const category: RequestCategory = (
    ["feature", "bug", "improvement", "other"].includes(input.category || "")
      ? input.category
      : "feature"
  ) as RequestCategory;

  if (!title) throw new Error("Please enter a title for your request.");
  if (!details) throw new Error("Please describe your request details.");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO user_requests
       (id, user_id, title, category, details, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(id, requester.id, title, category, details, now, now)
    .run();

  const recipients = await resolveRequestRecipients(db);
  const deliveredTo: string[] = [];
  const tag = CATEGORY_LABELS[category] || "📋 Request";

  for (const recipient of recipients) {
    if (recipient.id === requester.id) continue;

    try {
      const channelId = await findOrCreateDm(db, requester.id, recipient.id);
      await reopenDmForAll(db, channelId);

      const messageContent =
        `📬 **${tag}: ${title}**\n\n` +
        `${details}\n\n` +
        `*— Sent by @${requester.username} via Settings > Make a Request*`;

      const messageId = crypto.randomUUID();
      const stored: StoredMessage = {
        id: messageId,
        channel: "direct message",
        channel_id: channelId,
        user_id: requester.id,
        author: requester.displayName || requester.username,
        avatar: requester.avatar || "🥝",
        color: requester.color || "#10b981",
        content: messageContent,
        attachment_key: null,
        is_bot: 0,
        created_at: now,
      };

      await db
        .prepare(
          `INSERT INTO messages
           (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key, is_bot, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        )
        .run();

      const audience = await channelAudience(db, channelId);
      await publishMessage(channelId, publicMessage(stored), audience);
      await sendPushNotifications(db, [recipient.id], {
        title: `Request from ${requester.displayName || requester.username}`,
        body: `${tag}: ${title}`,
        url: "/hangout",
        tag: `msg-${channelId}`,
      });

      deliveredTo.push(recipient.displayName || recipient.username);
    } catch (err) {
      console.error(`Failed to deliver request DM to ${recipient.id}:`, err);
    }
  }

  if (deliveredTo.length > 0) {
    void publishStructureChange().catch(() => undefined);
  }

  const request: UserRequest = {
    id,
    userId: requester.id,
    title,
    category,
    details,
    status: "pending",
    responseNote: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    user: {
      id: requester.id,
      username: requester.username,
      displayName: requester.displayName || requester.username,
      avatar: requester.avatar,
      color: requester.color,
    },
  };

  return { request, deliveredTo };
}

/**
 * Lists requests. Handlers can query all or filter by status; standard users see only their own.
 */
export async function listRequests(
  db: D1Database,
  user: { id: string; username?: string; is_admin?: number },
  options: { all?: boolean; status?: string } = {},
): Promise<UserRequest[]> {
  const handler = isRequestHandler(user);

  if (handler && options.all) {
    let sql = `
      SELECT r.id, r.user_id, r.title, r.category, r.details, r.status,
             r.response_note, r.updated_by, r.created_at, r.updated_at,
             u.username, u.display_name, u.avatar, u.avatar_url, u.color
      FROM user_requests r
      LEFT JOIN users u ON u.id = r.user_id
    `;
    const params: string[] = [];

    if (options.status && options.status !== "all") {
      sql += " WHERE r.status = ?";
      params.push(options.status);
    }
    sql += " ORDER BY r.created_at DESC";

    const rows = await db.prepare(sql).bind(...params).all<{
      id: string;
      user_id: string;
      title: string;
      category: string;
      details: string;
      status: string;
      response_note: string | null;
      updated_by: string | null;
      created_at: string;
      updated_at: string;
      username: string | null;
      display_name: string | null;
      avatar: string | null;
      avatar_url: string | null;
      color: string | null;
    }>();

    return ((rows.results || []) as Array<any>).map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      category: row.category as RequestCategory,
      details: row.details,
      status: row.status as RequestStatus,
      responseNote: row.response_note,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      user: row.username
        ? {
            id: row.user_id,
            username: row.username,
            displayName: row.display_name || row.username,
            avatar: row.avatar || "👤",
            avatarUrl: row.avatar_url,
            color: row.color || "#888",
          }
        : undefined,
    }));
  }

  // Regular user view: only their own requests
  const rows = await db
    .prepare(
      `SELECT id, user_id, title, category, details, status,
              response_note, updated_by, created_at, updated_at
       FROM user_requests
       WHERE user_id = ?
       ORDER BY created_at DESC`,
    )
    .bind(user.id)
    .all<{
      id: string;
      user_id: string;
      title: string;
      category: string;
      details: string;
      status: string;
      response_note: string | null;
      updated_by: string | null;
      created_at: string;
      updated_at: string;
    }>();

  return ((rows.results || []) as Array<any>).map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    category: row.category as RequestCategory,
    details: row.details,
    status: row.status as RequestStatus,
    responseNote: row.response_note,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Updates a request's status and response note (handler only).
 */
export async function updateRequest(
  db: D1Database,
  handlerUser: { id: string; username?: string; is_admin?: number; displayName?: string },
  requestId: string,
  updates: {
    status?: RequestStatus;
    responseNote?: string | null;
  },
): Promise<UserRequest | null> {
  if (!isRequestHandler(handlerUser)) {
    throw new Error("Only Kiwi, Flo, and admins can update requests.");
  }

  const existing = await db
    .prepare("SELECT * FROM user_requests WHERE id = ?")
    .bind(requestId)
    .first<{
      id: string;
      user_id: string;
      title: string;
      category: string;
      details: string;
      status: string;
      response_note: string | null;
      created_at: string;
    }>();

  if (!existing) return null;

  const status = updates.status || existing.status;
  const responseNote =
    updates.responseNote !== undefined ? updates.responseNote : existing.response_note;
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE user_requests
       SET status = ?, response_note = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(status, responseNote, handlerUser.id, now, requestId)
    .run();

  // If status changed or note was added, notify the requester in their DM with this handler
  if (updates.status && updates.status !== existing.status && existing.user_id !== handlerUser.id) {
    try {
      const channelId = await findOrCreateDm(db, handlerUser.id, existing.user_id);
      await reopenDmForAll(db, channelId);

      const statusLabels: Record<string, string> = {
        pending: "Pending",
        in_progress: "In Progress 🛠️",
        completed: "Completed ✅",
        declined: "Declined",
      };

      const msg =
        `ℹ️ Your request **"${existing.title}"** status has been updated to **${statusLabels[status] || status}**.` +
        (responseNote ? `\n\n*Note:* ${responseNote}` : "");

      const messageId = crypto.randomUUID();
      const stored: StoredMessage = {
        id: messageId,
        channel: "direct message",
        channel_id: channelId,
        user_id: handlerUser.id,
        author: handlerUser.displayName || handlerUser.username || "Staff",
        avatar: "⚡",
        color: "#5865f2",
        content: msg,
        attachment_key: null,
        is_bot: 0,
        created_at: now,
      };

      await db
        .prepare(
          `INSERT INTO messages
           (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key, is_bot, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        )
        .run();

      const audience = await channelAudience(db, channelId);
      await publishMessage(channelId, publicMessage(stored), audience);
    } catch (err) {
      console.warn("Failed to send status update DM:", err);
    }
  }

  return {
    id: existing.id,
    userId: existing.user_id,
    title: existing.title,
    category: existing.category as RequestCategory,
    details: existing.details,
    status: status as RequestStatus,
    responseNote,
    updatedBy: handlerUser.id,
    createdAt: existing.created_at,
    updatedAt: now,
  };
}

/**
 * Deletes a request. Can be done by handler or the author if pending.
 */
export async function deleteRequest(
  db: D1Database,
  user: { id: string; username?: string; is_admin?: number },
  requestId: string,
): Promise<boolean> {
  const handler = isRequestHandler(user);
  const existing = await db
    .prepare("SELECT user_id, status FROM user_requests WHERE id = ?")
    .bind(requestId)
    .first<{ user_id: string; status: string }>();

  if (!existing) return false;
  if (!handler && existing.user_id !== user.id) {
    throw new Error("You cannot delete someone else's request.");
  }

  await db.prepare("DELETE FROM user_requests WHERE id = ?").bind(requestId).run();
  return true;
}
