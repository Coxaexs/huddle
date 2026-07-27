import { currentUser, unauthorized } from "@/lib/auth";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Who is banned from a server, with enough profile to show a row. Gated by
 * MANAGE_SERVER, the same permission that can ban and unban.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ bans: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const serverId = new URL(request.url).searchParams.get("serverId") || "";
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json(
      { error: "You do not have permission to see the ban list." },
      { status: 403 },
    );
  }

  const rows = await db
    .prepare(
      `SELECT b.user_id, b.created_at, b.banned_by,
              u.username, u.display_name, u.avatar, u.avatar_url, u.color,
              m.username AS banned_by_name
         FROM bans b
         LEFT JOIN users u ON u.id = b.user_id
         LEFT JOIN users m ON m.id = b.banned_by
        WHERE b.server_id = ?
        ORDER BY b.created_at DESC`,
    )
    .bind(serverId)
    .all();

  return Response.json({
    bans: (
      (rows.results || []) as Array<{
        user_id: string;
        created_at: string;
        username: string | null;
        display_name: string | null;
        avatar: string | null;
        avatar_url: string | null;
        color: string | null;
        banned_by_name: string | null;
      }>
    ).map((row) => ({
      userId: row.user_id,
      username: row.username || "unknown",
      displayName: row.display_name || row.username || "Unknown member",
      avatar: row.avatar || "?",
      avatarUrl: row.avatar_url || null,
      color: row.color || "#80848e",
      bannedAt: row.created_at,
      bannedBy: row.banned_by_name || null,
    })),
  });
}
