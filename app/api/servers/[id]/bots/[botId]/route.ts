import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function forbidden(): Response {
  return Response.json(
    { error: "You do not have permission to manage bots on this server." },
    { status: 403 },
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; botId: string }> },
) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database not connected" }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id, botId } = await context.params;
  if (!(await can(db, user.id, id, Permission.MANAGE_SERVER))) return forbidden();

  const bot = await db
    .prepare("SELECT id, name, enabled FROM server_bots WHERE id = ? AND server_id = ?")
    .bind(botId, id)
    .first<{ id: string; name: string; enabled: number }>();

  if (!bot) {
    return Response.json({ error: "Bot not found on this server." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    enabled?: boolean | number;
    name?: string;
    description?: string;
  };

  const newEnabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : bot.enabled;
  const newName = body.name?.trim().slice(0, 50) || bot.name;

  await db
    .prepare("UPDATE server_bots SET enabled = ?, name = ? WHERE id = ? AND server_id = ?")
    .bind(newEnabled, newName, botId, id)
    .run();

  await recordAudit(db, {
    serverId: id,
    actor: { id: user.id, display_name: user.display_name },
    action: "bot.update",
    targetId: botId,
    targetName: newName,
    detail: `Toggled status: ${newEnabled ? "enabled" : "disabled"}`,
  });

  return Response.json({ ok: true, enabled: newEnabled, name: newName });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; botId: string }> },
) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database not connected" }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id, botId } = await context.params;
  if (!(await can(db, user.id, id, Permission.MANAGE_SERVER))) return forbidden();

  const bot = await db
    .prepare("SELECT id, name FROM server_bots WHERE id = ? AND server_id = ?")
    .bind(botId, id)
    .first<{ id: string; name: string }>();

  if (!bot) {
    return Response.json({ error: "Bot not found." }, { status: 404 });
  }

  await db
    .prepare("DELETE FROM server_bots WHERE id = ? AND server_id = ?")
    .bind(botId, id)
    .run();

  await recordAudit(db, {
    serverId: id,
    actor: { id: user.id, display_name: user.display_name },
    action: "bot.delete",
    targetId: botId,
    targetName: bot.name,
    detail: "Removed bot from server",
  });

  return Response.json({ ok: true });
}
