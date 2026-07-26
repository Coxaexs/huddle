import { currentUser, unauthorized } from "@/lib/auth";
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
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return forbidden();
  }

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

  const top = await db
    .prepare("SELECT MAX(position) AS max FROM roles WHERE server_id = ?")
    .bind(serverId)
    .first<{ max: number | null }>();

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
      (top?.max ?? -1) + 1,
      new Date().toISOString(),
    )
    .run();

  await publishStructureChange();
  return Response.json({ servers: await listServers(db) }, { status: 201 });
}
