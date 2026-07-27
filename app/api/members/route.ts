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

  const [result, roleRows] = await Promise.all([
    db
      .prepare(
        `SELECT id, username, display_name, avatar, avatar_url, color, is_admin,
                created_at, last_seen_at, status, custom_status
           FROM users ORDER BY display_name COLLATE NOCASE ASC`,
      )
      .all(),
    db.prepare("SELECT server_id, user_id, role_id FROM member_roles").all(),
  ]);

  // Role assignments, keyed userId → serverId → roleId[]. Small friends' app, so
  // the whole join table is a few rows.
  const rolesByUser = new Map<string, Record<string, string[]>>();
  for (const row of (roleRows.results || []) as Array<{
    server_id: string;
    user_id: string;
    role_id: string;
  }>) {
    const byServer = rolesByUser.get(row.user_id) || {};
    (byServer[row.server_id] ||= []).push(row.role_id);
    rolesByUser.set(row.user_id, byServer);
  }

  return Response.json({
    members: ((result.results || []) as unknown as User[]).map((member) => ({
      id: member.id,
      username: member.username,
      displayName: member.display_name,
      avatar: member.avatar,
      avatarUrl: member.avatar_url || null,
      color: member.color,
      lastSeenAt: member.last_seen_at,
      createdAt: member.created_at,
      isAdmin: Boolean(member.is_admin),
      status: member.status || "online",
      customStatus: member.custom_status || null,
      roleIds: rolesByUser.get(member.id) || {},
    })),
  });
}
