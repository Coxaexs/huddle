import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

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
    kind?: string;
    topic?: string;
    categoryId?: string;
  };
  if (!(await can(db, user.id, body.serverId || "", Permission.MANAGE_CHANNELS))) {
    return Response.json(
      { error: "You do not have permission to manage channels here." },
      { status: 403 },
    );
  }
  const kind = body.kind === "voice" ? "voice" : "text";
  // Text channels keep the discord-ish lowercase-with-dashes shape; voice
  // rooms are allowed to be pretty.
  const name =
    kind === "text"
      ? body.name
          ?.trim()
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9_-]/g, "")
          .slice(0, 40)
      : body.name?.trim().slice(0, 40);
  if (!name) {
    return Response.json({ error: "Give the channel a name." }, { status: 400 });
  }

  const server = await db
    .prepare("SELECT id FROM servers WHERE id = ?")
    .bind(body.serverId || "")
    .first();
  if (!server) {
    return Response.json({ error: "That server is gone." }, { status: 404 });
  }

  const duplicate = await db
    .prepare(
      "SELECT id FROM channels WHERE server_id = ? AND kind = ? AND name = ?",
    )
    .bind(body.serverId, kind, name)
    .first();
  if (duplicate) {
    return Response.json(
      { error: `There is already a ${kind} channel called ${name}.` },
      { status: 409 },
    );
  }

  const position = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM channels WHERE server_id = ? AND kind = ?",
    )
    .bind(body.serverId, kind)
    .first<{ count: number }>();

  // Only place it in a category that belongs to this server.
  let categoryId: string | null = null;
  if (body.categoryId) {
    const category = await db
      .prepare("SELECT id FROM categories WHERE id = ? AND server_id = ?")
      .bind(body.categoryId, body.serverId)
      .first();
    if (category) categoryId = body.categoryId;
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO channels (id, server_id, name, kind, topic, position, category_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      body.serverId,
      name,
      kind,
      body.topic?.trim().slice(0, 120) || "",
      position?.count ?? 0,
      categoryId,
      new Date().toISOString(),
    )
    .run();

  await recordAudit(db, {
    serverId: body.serverId || "",
    actor: user,
    action: "channel.create",
    targetId: id,
    targetName: name,
    detail: kind,
  });
  await publishStructureChange();
  return Response.json(
    { channelId: id, servers: await listServers(db, user.id) },
    { status: 201 },
  );
}
