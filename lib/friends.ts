import type { D1Database } from "@cloudflare/workers-types";
import { findOrCreateDm } from "./dms";

export interface FriendUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  status?: string | null;
  customStatus?: string | null;
  lastSeenAt?: string | null;
  dmChannelId?: string | null;
  relationshipId?: string;
  createdAt?: string;
}

export interface FriendsSummary {
  friends: FriendUser[];
  incoming: FriendUser[];
  outgoing: FriendUser[];
  blocked: FriendUser[];
}

export async function listFriends(
  db: D1Database,
  userId: string,
): Promise<FriendsSummary> {
  // Query all relationships involving this user
  const rows = await db
    .prepare(
      `SELECT f.id AS relationship_id, f.user_id, f.friend_id, f.status, f.created_at,
              u.id AS other_id, u.username, u.display_name, u.avatar, u.avatar_url,
              u.color, u.status AS user_status, u.custom_status, u.last_seen_at
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_id = ?1 THEN f.friend_id ELSE f.user_id END
        WHERE f.user_id = ?1 OR f.friend_id = ?1
        ORDER BY u.display_name COLLATE NOCASE ASC`,
    )
    .bind(userId)
    .all<{
      relationship_id: string;
      user_id: string;
      friend_id: string;
      status: string;
      created_at: string;
      other_id: string;
      username: string;
      display_name: string;
      avatar: string;
      avatar_url: string | null;
      color: string;
      user_status: string | null;
      custom_status: string | null;
      last_seen_at: string | null;
    }>();

  const results = rows.results || [];

  // Look up existing DMs for these users
  const otherUserIds = Array.from(new Set(results.map((r) => r.other_id)));
  const dmMap = new Map<string, string>();

  if (otherUserIds.length > 0) {
    const dmRows = await db
      .prepare(
        `SELECT mine.user_id AS me, theirs.user_id AS other, mine.channel_id
           FROM dm_members mine
           JOIN dm_members theirs ON theirs.channel_id = mine.channel_id
          WHERE mine.user_id = ?1`,
      )
      .bind(userId)
      .all<{ me: string; other: string; channel_id: string }>();

    for (const dm of dmRows.results || []) {
      dmMap.set(dm.other, dm.channel_id);
    }
  }

  const summary: FriendsSummary = {
    friends: [],
    incoming: [],
    outgoing: [],
    blocked: [],
  };

  for (const r of results) {
    const friend: FriendUser = {
      id: r.other_id,
      username: r.username,
      displayName: r.display_name,
      avatar: r.avatar,
      avatarUrl: r.avatar_url,
      color: r.color,
      status: r.user_status,
      customStatus: r.custom_status,
      lastSeenAt: r.last_seen_at,
      dmChannelId: dmMap.get(r.other_id) || null,
      relationshipId: r.relationship_id,
      createdAt: r.created_at,
    };

    if (r.status === "accepted") {
      summary.friends.push(friend);
    } else if (r.status === "pending") {
      if (r.user_id === userId) {
        summary.outgoing.push(friend);
      } else {
        summary.incoming.push(friend);
      }
    } else if (r.status === "blocked" && r.user_id === userId) {
      summary.blocked.push(friend);
    }
  }

  return summary;
}

export async function sendFriendRequest(
  db: D1Database,
  senderId: string,
  targetUsernameOrId: string,
): Promise<{ friend: FriendUser; autoAccepted: boolean }> {
  const query = targetUsernameOrId.trim().toLowerCase();
  if (!query) {
    throw new Error("Enter a username to send a friend request.");
  }

  // Look up target user
  const target = await db
    .prepare(
      `SELECT id, username, display_name, avatar, avatar_url, color, status, custom_status, last_seen_at
         FROM users
        WHERE username_lower = ?1 OR id = ?1`,
    )
    .bind(query)
    .first<{
      id: string;
      username: string;
      display_name: string;
      avatar: string;
      avatar_url: string | null;
      color: string;
      status: string | null;
      custom_status: string | null;
      last_seen_at: string | null;
    }>();

  if (!target) {
    throw new Error(`We couldn't find anyone named '${targetUsernameOrId}'. Check the spelling.`);
  }

  if (target.id === senderId) {
    throw new Error("You can't add yourself as a friend.");
  }

  // Check existing relationship in either direction
  const existing = await db
    .prepare(
      `SELECT id, user_id, friend_id, status
         FROM friendships
        WHERE (user_id = ?1 AND friend_id = ?2)
           OR (user_id = ?2 AND friend_id = ?1)`,
    )
    .bind(senderId, target.id)
    .first<{
      id: string;
      user_id: string;
      friend_id: string;
      status: string;
    }>();

  const now = new Date().toISOString();

  if (existing) {
    if (existing.status === "accepted") {
      throw new Error(`You and @${target.username} are already friends!`);
    }
    if (existing.status === "blocked") {
      if (existing.user_id === senderId) {
        throw new Error("You have blocked this user.");
      } else {
        throw new Error("You cannot send a friend request to this user.");
      }
    }
    if (existing.status === "pending") {
      if (existing.user_id === senderId) {
        throw new Error("You already sent a friend request to this user.");
      } else {
        // Target already sent request to us: auto-accept!
        await db
          .prepare(
            "UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?",
          )
          .bind(now, existing.id)
          .run();

        return {
          friend: {
            id: target.id,
            username: target.username,
            displayName: target.display_name,
            avatar: target.avatar,
            avatarUrl: target.avatar_url,
            color: target.color,
            status: target.status,
            customStatus: target.custom_status,
            lastSeenAt: target.last_seen_at,
            relationshipId: existing.id,
            createdAt: now,
          },
          autoAccepted: true,
        };
      }
    }
  }

  const relationshipId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO friendships (id, user_id, friend_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(relationshipId, senderId, target.id, now, now)
    .run();

  return {
    friend: {
      id: target.id,
      username: target.username,
      displayName: target.display_name,
      avatar: target.avatar,
      avatarUrl: target.avatar_url,
      color: target.color,
      status: target.status,
      customStatus: target.custom_status,
      lastSeenAt: target.last_seen_at,
      relationshipId,
      createdAt: now,
    },
    autoAccepted: false,
  };
}

export async function acceptFriendRequest(
  db: D1Database,
  currentUserId: string,
  requesterId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const res = await db
    .prepare(
      `UPDATE friendships
          SET status = 'accepted', updated_at = ?
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'`,
    )
    .bind(now, requesterId, currentUserId)
    .run();

  if (!res.meta?.changes) {
    throw new Error("No pending friend request found to accept.");
  }
}

export async function declineFriendRequest(
  db: D1Database,
  currentUserId: string,
  otherId: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM friendships
        WHERE status = 'pending'
          AND ((user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1))`,
    )
    .bind(currentUserId, otherId)
    .run();
}

export async function removeFriend(
  db: D1Database,
  currentUserId: string,
  friendId: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM friendships
        WHERE ((user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1))`,
    )
    .bind(currentUserId, friendId)
    .run();
}

export async function blockUser(
  db: D1Database,
  currentUserId: string,
  targetId: string,
): Promise<void> {
  if (currentUserId === targetId) {
    throw new Error("You cannot block yourself.");
  }
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "DELETE FROM friendships WHERE (user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1)",
      )
      .bind(currentUserId, targetId),
    db
      .prepare(
        `INSERT INTO friendships (id, user_id, friend_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'blocked', ?, ?)`,
      )
      .bind(crypto.randomUUID(), currentUserId, targetId, now, now),
  ]);
}
