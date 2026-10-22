import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { ALL_PERMISSIONS, roleAuthority, roleRefusal } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Set a server's @everyone permissions: what every member holds before any
 * role. It sits below every role, so anyone who may manage roles may edit it,
 * but only with bits they hold themselves.
 */
export async function PATCH(request: Request) {
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
    permissions?: number;
  };
  if (!body.serverId || body.permissions === undefined) {
    return Response.json({ error: "Missing fields." }, { status: 400 });
  }
  const server = await db
    .prepare("SELECT id, name, everyone_permissions FROM servers WHERE id = ?")
    .bind(body.serverId)
    .first<{ id: string; name: string; everyone_permissions: number }>();
  if (!server) {
    return Response.json({ error: "That server is gone." }, { status: 404 });
  }
  const permissions = Number(body.permissions) & ALL_PERMISSIONS;
  // Only the bits being turned on need to be ones you hold: turning a bit off
  // that someone above you granted is still yours to do.
  const added = permissions & ~(server.everyone_permissions || 0);
  const refused = roleRefusal(await roleAuthority(db, user.id, server.id), {
    permissions: added,
  });
  if (refused) return Response.json({ error: refused }, { status: 403 });

  await db
    .prepare("UPDATE servers SET everyone_permissions = ? WHERE id = ?")
    .bind(permissions, server.id)
    .run();

  await recordAudit(db, {
    serverId: server.id,
    actor: user,
    action: "role.update",
    targetName: "@everyone",
  });
  await publishStructureChange(server.id);
  return Response.json({ servers: await listServers(db, user.id) });
}
