import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema, DEFAULT_SERVER_ID } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

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
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    icon?: string;
    color?: string;
  };

  const server = await db
    .prepare("SELECT id, name, icon, color FROM servers WHERE id = ?")
    .bind(id)
    .first<{ id: string; name: string; icon: string; color: string }>();
  if (!server) {
    return Response.json({ error: "That server is gone." }, { status: 404 });
  }

  await db
    .prepare("UPDATE servers SET name = ?, icon = ?, color = ? WHERE id = ?")
    .bind(
      body.name?.trim().slice(0, 40) || server.name,
      body.icon?.trim().slice(0, 2).toUpperCase() || server.icon,
      body.color?.trim().slice(0, 24) || server.color,
      id,
    )
    .run();

  return Response.json({ servers: await listServers(db) });
}

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
  if (id === DEFAULT_SERVER_ID) {
    return Response.json(
      { error: "The Hangout is the home server and cannot be deleted." },
      { status: 400 },
    );
  }

  const channels = await db
    .prepare("SELECT id FROM channels WHERE server_id = ?")
    .bind(id)
    .all();
  const channelIds = ((channels.results || []) as Array<{ id: string }>).map(
    (row) => row.id,
  );

  const statements = [
    db.prepare("DELETE FROM channels WHERE server_id = ?").bind(id),
    db.prepare("DELETE FROM servers WHERE id = ?").bind(id),
  ];
  for (const channelId of channelIds) {
    statements.push(
      db.prepare("DELETE FROM messages WHERE channel_id = ?").bind(channelId),
    );
  }
  await db.batch(statements);

  return Response.json({ servers: await listServers(db) });
}
