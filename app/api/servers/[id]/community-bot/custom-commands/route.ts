import { currentUser, unauthorized } from "@/lib/auth";
import {
  deleteCustomCommand,
  listCustomCommands,
  saveCustomCommand,
} from "@/lib/community-bot/custom-commands";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: serverId } = await context.params;
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "Manage Server permission is required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    trigger?: string;
    response?: string;
    useEmbed?: boolean;
    embedTitle?: string | null;
    embedColor?: string;
    grantRoleId?: string | null;
    removeRoleId?: string | null;
    cooldownSec?: number;
    enabled?: boolean;
  };

  const res = await saveCustomCommand(db, serverId, {
    id: body.id,
    trigger: body.trigger || "",
    response: body.response || "",
    useEmbed: body.useEmbed,
    embedTitle: body.embedTitle,
    embedColor: body.embedColor,
    grantRoleId: body.grantRoleId,
    removeRoleId: body.removeRoleId,
    cooldownSec: body.cooldownSec,
    enabled: body.enabled,
  });
  if ("error" in res) return Response.json({ error: res.error }, { status: 400 });

  const customCommands = await listCustomCommands(db, serverId);
  return Response.json({ ok: true, command: res, customCommands });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: serverId } = await context.params;
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "Manage Server permission is required." }, { status: 403 });
  }

  const commandId = new URL(request.url).searchParams.get("commandId") || "";
  if (!commandId) return Response.json({ error: "Missing commandId." }, { status: 400 });

  await deleteCustomCommand(db, serverId, commandId);
  const customCommands = await listCustomCommands(db, serverId);
  return Response.json({ ok: true, customCommands });
}
