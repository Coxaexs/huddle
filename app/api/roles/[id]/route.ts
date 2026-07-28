import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission, ALL_PERMISSIONS } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function forbidden(): Response {
  return Response.json(
    { error: "You do not have permission to do that." },
    { status: 403 },
  );
}

async function loadRole(db: D1Database, id: string) {
  return db
    .prepare(
      "SELECT id, server_id, name, color, permissions, position FROM roles WHERE id = ?",
    )
    .bind(id)
    .first<{
      id: string;
      server_id: string;
      name: string;
      color: string;
      permissions: number;
      position: number;
    }>();
}

/** Edit a role's name, colour, permissions or position. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const role = await loadRole(db, id);
  if (!role) {
    return Response.json({ error: "That role is gone." }, { status: 404 });
  }
  if (!(await can(db, user.id, role.server_id, Permission.MANAGE_SERVER))) {
    return forbidden();
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    color?: string;
    permissions?: number;
    position?: number;
  };
  const name = body.name?.trim().slice(0, 40) || role.name;
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color || "")
    ? (body.color as string)
    : role.color;
  const permissions =
    body.permissions === undefined
      ? role.permissions
      : Number(body.permissions) & ALL_PERMISSIONS;
  const position =
    body.position === undefined ? role.position : Number(body.position);

  await db
    .prepare(
      "UPDATE roles SET name = ?, color = ?, permissions = ?, position = ? WHERE id = ?",
    )
    .bind(name, color, permissions, position, id)
    .run();

  await recordAudit(db, {
    serverId: role.server_id,
    actor: user,
    action: "role.update",
    targetName: name,
  });
  await publishStructureChange();
  return Response.json({ servers: await listServers(db, user.id) });
}

/** Delete a role and drop every assignment of it. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const role = await loadRole(db, id);
  if (!role) {
    return Response.json({ error: "That role is gone." }, { status: 404 });
  }
  if (!(await can(db, user.id, role.server_id, Permission.MANAGE_SERVER))) {
    return forbidden();
  }

  await db.batch([
    db.prepare("DELETE FROM member_roles WHERE role_id = ?").bind(id),
    db.prepare("DELETE FROM roles WHERE id = ?").bind(id),
  ]);

  await recordAudit(db, {
    serverId: role.server_id,
    actor: user,
    action: "role.delete",
    targetName: role.name,
  });
  await publishStructureChange();
  return Response.json({ servers: await listServers(db, user.id) });
}
