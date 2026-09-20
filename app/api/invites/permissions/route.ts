import { currentUser, isFirstUserOrOwner, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface PermissionUserRow {
  id: string;
  username: string;
  display_name: string;
  avatar: string;
  avatar_url: string | null;
  color: string;
  is_admin: number;
  can_invite: number;
}

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ users: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();

  await ensureSchema(db);

  if (!(await isFirstUserOrOwner(db, user))) {
    return Response.json(
      { error: "Only the server owner can manage invite permissions." },
      { status: 403 },
    );
  }

  const result = await db
    .prepare(
      `SELECT id, username, display_name, avatar, avatar_url, color, is_admin, can_invite
         FROM users
        ORDER BY is_admin DESC, display_name COLLATE NOCASE ASC`,
    )
    .all();

  return Response.json({
    users: ((result.results || []) as unknown as PermissionUserRow[]).map(
      (u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        avatar: u.avatar,
        avatarUrl: u.avatar_url || null,
        color: u.color,
        isAdmin: Boolean(u.is_admin),
        canInvite: Boolean(u.is_admin || u.can_invite),
      }),
    ),
  });
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

  if (!(await isFirstUserOrOwner(db, user))) {
    return Response.json(
      { error: "Only the server owner can manage invite permissions." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    canInvite?: boolean;
  };

  const targetId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!targetId) {
    return Response.json({ error: "User ID is required." }, { status: 400 });
  }

  const target = await db
    .prepare("SELECT id, is_admin FROM users WHERE id = ?")
    .bind(targetId)
    .first<{ id: string; is_admin: number }>();

  if (!target) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  if (target.is_admin || target.id === user.id) {
    return Response.json(
      { error: "The server owner always has invite permissions." },
      { status: 400 },
    );
  }

  const newCanInvite = body.canInvite ? 1 : 0;
  await db
    .prepare("UPDATE users SET can_invite = ? WHERE id = ?")
    .bind(newCanInvite, targetId)
    .run();

  return Response.json({
    ok: true,
    userId: targetId,
    canInvite: Boolean(newCanInvite),
  });
}
