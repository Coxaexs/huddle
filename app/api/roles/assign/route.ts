import { currentUser, unauthorized } from "@/lib/auth";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Assign or remove a role from a member. Gated by MANAGE_SERVER. */
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

  const body = (await request.json().catch(() => ({}))) as {
    serverId?: string;
    userId?: string;
    roleId?: string;
    add?: boolean;
  };
  const { serverId, userId, roleId } = body;
  if (!serverId || !userId || !roleId) {
    return Response.json({ error: "Missing fields." }, { status: 400 });
  }
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json(
      { error: "You do not have permission to do that." },
      { status: 403 },
    );
  }

  const role = await db
    .prepare("SELECT id FROM roles WHERE id = ? AND server_id = ?")
    .bind(roleId, serverId)
    .first();
  if (!role) {
    return Response.json({ error: "That role is gone." }, { status: 404 });
  }

  if (body.add === false) {
    await db
      .prepare(
        "DELETE FROM member_roles WHERE server_id = ? AND user_id = ? AND role_id = ?",
      )
      .bind(serverId, userId, roleId)
      .run();
  } else {
    await db
      .prepare(
        "INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)",
      )
      .bind(serverId, userId, roleId)
      .run();
  }

  await publishStructureChange();
  return Response.json({ ok: true });
}
