import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { roleAuthority } from "@/lib/permissions";
import { reorderRefusal } from "@/lib/role-order";
import { ensureSchema } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Put a server's roles in a new order. `order` lists every role id, highest
 * first. Someone who is not the owner can only rearrange the roles below
 * their own highest one; the roles at or above it must stay where they are.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as { serverId?: string; order?: unknown };
  const serverId = body.serverId || "";
  const order = Array.isArray(body.order) ? body.order.filter((id): id is string => typeof id === "string") : [];
  const authority = await roleAuthority(db, user.id, serverId);
  if (!authority.canManage) {
    return Response.json({ error: "You do not have permission to manage roles." }, { status: 403 });
  }
  const current = await db
    .prepare("SELECT id, position FROM roles WHERE server_id = ? ORDER BY position DESC, name ASC")
    .bind(serverId)
    .all<{ id: string; position: number }>();
  const roles = current.results || [];
  const refused = reorderRefusal(roles, order, authority);
  if (refused) return Response.json({ error: refused }, { status: refused.startsWith("You") ? 403 : 400 });

  await db.batch(
    order.map((id, index) =>
      db.prepare("UPDATE roles SET position = ? WHERE id = ? AND server_id = ?").bind(order.length - 1 - index, id, serverId),
    ),
  );
  await recordAudit(db, { serverId, actor: user, action: "role.update", targetName: "role order" });
  await publishStructureChange(serverId);
  return Response.json({ servers: await listServers(db, user.id) });
}
