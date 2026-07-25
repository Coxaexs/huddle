import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { findChannel, listServers } from "@/lib/servers";
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
  const channel = await findChannel(db, id);
  if (!channel) {
    return Response.json({ error: "That channel is gone." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    topic?: string;
  };
  const name =
    channel.kind === "text"
      ? body.name
          ?.trim()
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9_-]/g, "")
          .slice(0, 40)
      : body.name?.trim().slice(0, 40);

  await db
    .prepare("UPDATE channels SET name = ?, topic = ? WHERE id = ?")
    .bind(
      name || channel.name,
      body.topic?.trim().slice(0, 120) ?? channel.topic,
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
  const channel = await findChannel(db, id);
  if (!channel) {
    return Response.json({ error: "That channel is gone." }, { status: 404 });
  }

  const siblings = await db
    .prepare("SELECT COUNT(*) AS count FROM channels WHERE server_id = ? AND kind = ?")
    .bind(channel.server_id, channel.kind)
    .first<{ count: number }>();
  if (channel.kind === "text" && (siblings?.count ?? 0) <= 1) {
    return Response.json(
      { error: "Every server needs at least one text channel." },
      { status: 400 },
    );
  }

  await db.batch([
    db.prepare("DELETE FROM messages WHERE channel_id = ?").bind(id),
    db.prepare("DELETE FROM channels WHERE id = ?").bind(id),
  ]);

  return Response.json({ servers: await listServers(db) });
}
