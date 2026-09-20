import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ users: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();

  await ensureSchema(db);

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 25));

  if (!q) {
    return Response.json({ users: [] });
  }

  const searchPattern = `%${q}%`;

  // People the caller already knows — friends and DM partners — match on any
  // substring of their name/username. Everyone else only matches when the full
  // username or display name is typed, so a stray letter doesn't surface the
  // whole Huddle.
  const knownSubquery = `(
    SELECT ?2
    UNION
    SELECT friend_id FROM friendships WHERE user_id = ?2 AND status = 'accepted'
    UNION
    SELECT user_id FROM friendships WHERE friend_id = ?2 AND status = 'accepted'
    UNION
    SELECT user_id FROM dm_members
      WHERE channel_id IN (SELECT channel_id FROM dm_members WHERE user_id = ?2)
  )`;

  // Search users table with indexed username_lower. Known people use a
  // substring match; strangers require an exact username or display name.
  const userRows = await db
    .prepare(
      `SELECT id, username, display_name, avatar, avatar_url, color, status, custom_status, last_seen_at
         FROM users
        WHERE (username_lower LIKE ?1 OR LOWER(display_name) LIKE ?1)
          AND (
            id IN ${knownSubquery}
            OR username_lower = ?3
            OR LOWER(display_name) = ?3
          )
        ORDER BY
          CASE WHEN username_lower = ?4 THEN 0
               WHEN username_lower LIKE ?5 THEN 1
               ELSE 2 END,
          display_name COLLATE NOCASE ASC
        LIMIT ?6`,
    )
    .bind(searchPattern, user.id, q, q, `${q}%`, limit)
    .all<{
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

  const foundUsers = userRows.results || [];
  if (foundUsers.length === 0) {
    return Response.json({ users: [] });
  }

  // Fetch relationships between caller and found users
  const userIds = foundUsers.map((u) => u.id).filter((id) => id !== user.id);
  const relationshipMap = new Map<string, { status: string; isSender: boolean }>();

  if (userIds.length > 0) {
    const inPlaceholders = userIds.map(() => "?").join(",");
    const relRows = await db
      .prepare(
        `SELECT user_id, friend_id, status
           FROM friendships
          WHERE (user_id = ? AND friend_id IN (${inPlaceholders}))
             OR (friend_id = ? AND user_id IN (${inPlaceholders}))`,
      )
      .bind(user.id, ...userIds, user.id, ...userIds)
      .all<{ user_id: string; friend_id: string; status: string }>();

    for (const rel of relRows.results || []) {
      const otherId = rel.user_id === user.id ? rel.friend_id : rel.user_id;
      relationshipMap.set(otherId, {
        status: rel.status,
        isSender: rel.user_id === user.id,
      });
    }
  }

  const users = foundUsers.map((u) => {
    const isSelf = u.id === user.id;
    const rel = relationshipMap.get(u.id);

    return {
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      avatar: u.avatar,
      avatarUrl: u.avatar_url,
      color: u.color,
      status: u.status || "offline",
      customStatus: u.custom_status,
      lastSeenAt: u.last_seen_at,
      isSelf,
      relationship: isSelf
        ? "self"
        : !rel
        ? "none"
        : rel.status === "accepted"
        ? "friend"
        : rel.status === "pending"
        ? rel.isSender
          ? "outgoing"
          : "incoming"
        : "blocked",
    };
  });

  return Response.json({ users });
}
