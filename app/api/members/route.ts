import { currentUser, memberFromRow, unauthorized, userColumns, type MemberRow } from "@/lib/auth";
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

  // Scope the roster to a server's real members. If no serverId is provided,
  // return an empty list rather than exposing all users in the system.
  const url = new URL(request.url);
  const serverId = url.searchParams.get("serverId") || null;
  if (!serverId) {
    return Response.json({ members: [] });
  }

  // Ensure caller is a member of the requested server (or an admin).
  const isMember = await db
    .prepare("SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?")
    .bind(serverId, user.id)
    .first();
  if (!isMember && !user.is_admin) {
    return Response.json({ members: [] }, { status: 403 });
  }

  const q = (url.searchParams.get("q") || url.searchParams.get("query") || "").trim().toLowerCase();
  // Escape LIKE wildcards so "_" and "%" in a search match themselves.
  const searchPattern = q ? `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
  const memberSelect = `SELECT ${userColumns("u")},
                               m.nickname, m.timeout_until, m.joined_at, m.invite_code,
                               i.created_by AS invite_creator_id,
                               inv_creator.display_name AS invite_creator_name,
                               inv_creator.username AS invite_creator_username
                          FROM users u
                          JOIN server_members m ON m.user_id = u.id AND m.server_id = ?1
                          LEFT JOIN invites i ON i.code = m.invite_code
                          LEFT JOIN users inv_creator ON inv_creator.id = i.created_by`;

  const [result, roleRows] = await Promise.all([
    searchPattern
      ? db
          .prepare(
            `${memberSelect}
              WHERE u.username_lower LIKE ?2 ESCAPE '\\'
                 OR LOWER(u.display_name) LIKE ?2 ESCAPE '\\'
                 OR LOWER(m.nickname) LIKE ?2 ESCAPE '\\'
              ORDER BY COALESCE(m.nickname, u.display_name) COLLATE NOCASE ASC`,
          )
          .bind(serverId, searchPattern)
          .all<MemberRow>()
      : db
          .prepare(`${memberSelect} ORDER BY COALESCE(m.nickname, u.display_name) COLLATE NOCASE ASC`)
          .bind(serverId)
          .all<MemberRow>(),
    db
      .prepare("SELECT server_id, user_id, role_id FROM member_roles WHERE server_id = ?")
      .bind(serverId)
      .all<{ server_id: string; user_id: string; role_id: string }>(),
  ]);

  // Role assignments, keyed userId → serverId → roleId[].
  const rolesByUser = new Map<string, Record<string, string[]>>();
  for (const row of roleRows.results || []) {
    const byServer = rolesByUser.get(row.user_id) || {};
    (byServer[row.server_id] ||= []).push(row.role_id);
    rolesByUser.set(row.user_id, byServer);
  }

  return Response.json({
    members: (result.results || []).map((row) =>
      memberFromRow(row, user.id, rolesByUser.get(row.id) || {}),
    ),
  });
}
