import { currentUser, unauthorized } from "@/lib/auth";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Create a channel category. Gated by MANAGE_CHANNELS. */
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
  };
  const serverId = body.serverId || "";
  if (!(await can(db, user.id, serverId, Permission.MANAGE_CHANNELS))) {
    return Response.json(
      { error: "You do not have permission to manage channels here." },
      { status: 403 },
    );
  }
  const server = await db
    .prepare("SELECT id FROM servers WHERE id = ?")
    .bind(serverId)
    .first();
  if (!server) {
    return Response.json({ error: "That server is gone." }, { status: 404 });
  }

  const name = body.name?.trim().slice(0, 40) || "New Category";
  const top = await db
    .prepare("SELECT MAX(position) AS max FROM categories WHERE server_id = ?")
    .bind(serverId)
    .first<{ max: number | null }>();

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO categories (id, server_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, serverId, name, (top?.max ?? -1) + 1, new Date().toISOString())
    .run();

  await publishStructureChange();
  return Response.json(
    { categoryId: id, servers: await listServers(db) },
    { status: 201 },
  );
}
