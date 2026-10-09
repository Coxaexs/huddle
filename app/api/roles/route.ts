import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { ALL_PERMISSIONS, roleAuthority, roleRefusal } from "@/lib/permissions";
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

/** Create a role in a server. Gated by MANAGE_SERVER. */
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
    name?: string;
    color?: string;
    permissions?: number;
  };
  const serverId = body.serverId || "";
  const authority = await roleAuthority(db, user.id, serverId);
  if (!authority.canManage) return forbidden();

  const server = await db
    .prepare("SELECT id FROM servers WHERE id = ?")
    .bind(serverId)
    .first();
  if (!server) {
    return Response.json({ error: "That server is gone." }, { status: 404 });
  }

  const name = body.name?.trim().slice(0, 40) || "new role";
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color || "")
    ? (body.color as string)
    : "#99aab5";
  const permissions = (Number(body.permissions) || 0) & ALL_PERMISSIONS;
  const refused = roleRefusal(authority, { permissions });
  if (refused) return Response.json({ error: refused }, { status: 403 });

  const top = await db
    .prepare("SELECT MAX(position) AS max FROM roles WHERE server_id = ?")
    .bind(serverId)
    .first<{ max: number | null }>();
  // Someone with a ceiling creates roles just under their own highest one
  // (shifting the rest up), so they can still edit what they made.
  let position = (top?.max ?? -1) + 1;
  if (!authority.unlimited) {
    position = Math.max(0, authority.top);
    await db
      .prepare("UPDATE roles SET position = position + 1 WHERE server_id = ? AND position >= ?")
      .bind(serverId, position)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO roles (id, server_id, name, color, permissions, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      serverId,
      name,
      color,
      permissions,
      position,
      new Date().toISOString(),
    )
    .run();

  await recordAudit(db, {
    serverId,
    actor: user,
    action: "role.create",
    targetName: name,
  });
  await publishStructureChange(serverId);
  return Response.json({ servers: await listServers(db, user.id) }, { status: 201 });
}
