import { currentUser, unauthorized } from "@/lib/auth";
import { DM_SERVER_ID, ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { isSafeProfileImage } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Everyone `?1` is friends with, whichever side sent the request. */
const FRIENDS_OF = (param: string) => `(
  SELECT friend_id FROM friendships WHERE user_id = ${param} AND status = 'accepted'
  UNION
  SELECT user_id FROM friendships WHERE friend_id = ${param} AND status = 'accepted'
)`;

/** Servers and friends you share with someone, for their profile card. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ servers: [], friends: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: targetId } = await context.params;
  if (!targetId || targetId === user.id) return Response.json({ servers: [], friends: [] });

  // Nothing is shared across a block, in either direction.
  const blocked = await db
    .prepare(
      `SELECT 1 FROM friendships
        WHERE status = 'blocked'
          AND ((user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1))`,
    )
    .bind(user.id, targetId)
    .first();
  if (blocked) return Response.json({ servers: [], friends: [] });

  const [servers, friends] = await Promise.all([
    db
      .prepare(
        `SELECT s.id, s.name, s.icon, s.icon_url, s.color
           FROM server_members mine
           JOIN server_members theirs ON theirs.server_id = mine.server_id AND theirs.user_id = ?2
           JOIN servers s ON s.id = mine.server_id
          WHERE mine.user_id = ?1 AND s.id != ?3
          ORDER BY s.position, s.name COLLATE NOCASE`,
      )
      .bind(user.id, targetId, DM_SERVER_ID)
      .all<{ id: string; name: string; icon: string; icon_url: string | null; color: string }>(),
    db
      .prepare(
        `SELECT id, username, display_name, avatar, avatar_url, color
           FROM users
          WHERE id IN ${FRIENDS_OF("?1")}
            AND id IN ${FRIENDS_OF("?2")}
            AND id NOT IN (?1, ?2)
          ORDER BY display_name COLLATE NOCASE
          LIMIT 50`,
      )
      .bind(user.id, targetId)
      .all<{
        id: string;
        username: string;
        display_name: string;
        avatar: string;
        avatar_url: string | null;
        color: string;
      }>(),
  ]);

  return Response.json({
    servers: (servers.results || []).map((server) => ({
      id: server.id,
      name: server.name,
      icon: server.icon,
      iconUrl: server.icon_url || null,
      color: server.color,
    })),
    friends: (friends.results || []).map((friend) => ({
      id: friend.id,
      username: friend.username,
      displayName: friend.display_name,
      avatar: friend.avatar,
      avatarUrl: isSafeProfileImage(friend.avatar_url) ? friend.avatar_url : null,
      color: friend.color,
    })),
  });
}
