import { currentUser, unauthorized } from "@/lib/auth";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Persist a drag-and-drop reorder. Channels carry a category and position;
 * categories carry a position. Everything is scoped to one server and gated by
 * MANAGE_CHANNELS.
 */
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
    channels?: Array<{ id: string; categoryId: string | null; position: number }>;
    categories?: Array<{ id: string; position: number }>;
  };
  const serverId = body.serverId || "";
  if (!(await can(db, user.id, serverId, Permission.MANAGE_CHANNELS))) {
    return Response.json(
      { error: "You do not have permission to manage channels here." },
      { status: 403 },
    );
  }

  const statements = [];
  for (const item of body.channels || []) {
    statements.push(
      db
        .prepare(
          "UPDATE channels SET category_id = ?, position = ? WHERE id = ? AND server_id = ?",
        )
        .bind(item.categoryId || null, Number(item.position) || 0, item.id, serverId),
    );
  }
  for (const item of body.categories || []) {
    statements.push(
      db
        .prepare("UPDATE categories SET position = ? WHERE id = ? AND server_id = ?")
        .bind(Number(item.position) || 0, item.id, serverId),
    );
  }
  if (statements.length) await db.batch(statements);

  await publishStructureChange();
  return Response.json({ servers: await listServers(db, user.id) });
}
