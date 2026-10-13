import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema, DEFAULT_SERVER_ID } from "@/lib/schema";
import { deleteServerData, listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function forbidden(): Response {
  return Response.json(
    { error: "You do not have permission to manage this server." },
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
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    icon?: string;
    color?: string;
    iconUrl?: string | null;
    bannerUrl?: string | null;
  };

  const server = await db
    .prepare("SELECT id, name, icon, color, icon_url, banner_url FROM servers WHERE id = ?")
    .bind(id)
    .first<{ id: string; name: string; icon: string; color: string; icon_url?: string; banner_url?: string }>();
  if (!server) {
    return Response.json({ error: "That server is gone." }, { status: 404 });
  }
  if (!(await can(db, user.id, id, Permission.MANAGE_SERVER))) return forbidden();

  await db
    .prepare("UPDATE servers SET name = ?, icon = ?, color = ?, icon_url = ?, banner_url = ? WHERE id = ?")
    .bind(
      body.name?.trim().slice(0, 50) || server.name,
      body.icon?.trim().slice(0, 2).toUpperCase() || server.icon,
      body.color?.trim().slice(0, 24) || server.color,
      body.iconUrl !== undefined ? body.iconUrl : server.icon_url || null,
      body.bannerUrl !== undefined ? body.bannerUrl : server.banner_url || null,
      id,
    )
    .run();

  await recordAudit(db, {
    serverId: id,
    actor: user,
    action: "server.update",
    targetName: body.name?.trim().slice(0, 50) || server.name,
  });
  await publishStructureChange(id);
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
  if (id === DEFAULT_SERVER_ID) {
    return Response.json(
      { error: "The Hangout is the home server and cannot be deleted." },
      { status: 400 },
    );
  }
  if (!(await can(db, user.id, id, Permission.MANAGE_SERVER))) return forbidden();

  await deleteServerData(db, id);

  await publishStructureChange(id);
  return Response.json({ servers: await listServers(db, user.id) });
}
