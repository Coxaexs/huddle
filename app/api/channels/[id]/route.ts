import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { findChannel, listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";
import { convertibleKinds, normalizeChannelName } from "@/lib/channel-kinds";

export const dynamic = "force-dynamic";

function forbidden(): Response {
  return Response.json(
    { error: "You do not have permission to manage channels here." },
    { status: 403 },
  );
}

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
  if (!(await can(db, user.id, channel.server_id, Permission.MANAGE_CHANNELS))) {
    return forbidden();
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    topic?: string;
    slowmode?: number;
    /** Switch to another kind in the same family (text/announcement/forum, voice/stage). */
    kind?: string;
  };

  let kind = channel.kind;
  if (body.kind && body.kind !== channel.kind) {
    if (!(convertibleKinds(channel.kind) as string[]).includes(body.kind)) {
      return Response.json(
        { error: "A channel can only switch between text, announcement and forum, or voice and stage." },
        { status: 400 },
      );
    }
    // Same rule as deleting: a server always keeps one plain text channel.
    if (channel.kind === "text") {
      const siblings = await db
        .prepare("SELECT COUNT(*) AS count FROM channels WHERE server_id = ? AND kind = 'text'")
        .bind(channel.server_id)
        .first<{ count: number }>();
      if ((siblings?.count ?? 0) <= 1) {
        return Response.json(
          { error: "A server needs at least one text channel." },
          { status: 400 },
        );
      }
    }
    kind = body.kind as typeof channel.kind;
  }

  // Normalized for the kind it will be, so a rename can't dodge the slug rules.
  const name = body.name !== undefined
    ? normalizeChannelName(kind, body.name)
    : kind !== channel.kind
      ? normalizeChannelName(kind, channel.name)
      : "";

  await db
    .prepare("UPDATE channels SET name = ?, topic = ?, slowmode = ?, kind = ? WHERE id = ?")
    .bind(
      name || channel.name,
      body.topic?.trim().slice(0, 120) ?? channel.topic,
      typeof body.slowmode === "number" ? Math.max(0, Math.min(300, body.slowmode)) : (channel as { slowmode?: number }).slowmode || 0,
      kind,
      id,
    )
    .run();

  await recordAudit(db, {
    serverId: channel.server_id,
    actor: user,
    action: "channel.update",
    targetId: id,
    targetName: name || channel.name,
  });
  await publishStructureChange();
  return Response.json({ servers: await listServers(db, user.id) });
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
  if (!(await can(db, user.id, channel.server_id, Permission.MANAGE_CHANNELS))) {
    return forbidden();
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

  await recordAudit(db, {
    serverId: channel.server_id,
    actor: user,
    action: "channel.delete",
    targetId: id,
    targetName: channel.name,
    detail: channel.kind,
  });
  await publishStructureChange();
  return Response.json({ servers: await listServers(db, user.id) });
}
