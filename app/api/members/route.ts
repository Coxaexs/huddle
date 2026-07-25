import { currentUser, unauthorized, type User } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Everyone in this Huddle. Live presence arrives separately over the socket. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ members: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const result = await db
    .prepare(
      `SELECT id, username, display_name, avatar, avatar_url, color, is_admin,
              created_at, last_seen_at
         FROM users ORDER BY display_name COLLATE NOCASE ASC`,
    )
    .all();

  return Response.json({
    members: ((result.results || []) as unknown as User[]).map((member) => ({
      id: member.id,
      username: member.username,
      displayName: member.display_name,
      avatar: member.avatar,
      avatarUrl: member.avatar_url || null,
      color: member.color,
      lastSeenAt: member.last_seen_at,
    })),
  });
}
