import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { roleAuthority, roleRefusal } from "@/lib/permissions";
import { memberPicks, sanitizePicks, savePicks, setMemberPicks } from "@/lib/role-picker";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function setup(request: Request, context: Context) {
  const db = bindings().DB;
  if (!db) return { error: Response.json({ error: "Message storage is not connected." }, { status: 503 }) };
  const user = await currentUser(request);
  if (!user) return { error: unauthorized() };
  await ensureSchema(db);
  const { id } = await context.params;
  if (!(await isServerMember(db, id, user.id))) {
    return { error: Response.json({ error: "You are not in this server." }, { status: 403 }) };
  }
  return { db, user, serverId: id };
}

/** The offered roles you hold now. (Which roles are offered comes with the server.) */
export async function GET(request: Request, context: Context) {
  const ctx = await setup(request, context);
  if ("error" in ctx) return ctx.error;
  return Response.json({ roleIds: await memberPicks(ctx.db, ctx.serverId, ctx.user.id) });
}

/** A member picks their roles: they end up holding exactly these among the offered ones. */
export async function POST(request: Request, context: Context) {
  const ctx = await setup(request, context);
  if ("error" in ctx) return ctx.error;
  const body = (await request.json().catch(() => ({}))) as { roleIds?: unknown };
  const result = await setMemberPicks(ctx.db, ctx.serverId, ctx.user.id, body.roleIds);
  if (result.changed) await publishStructureChange(ctx.serverId);
  return Response.json({ roleIds: result.roleIds });
}

/** Managers: which roles are offered, with an emoji and a line about each. */
export async function PUT(request: Request, context: Context) {
  const ctx = await setup(request, context);
  if ("error" in ctx) return ctx.error;
  const { db, user, serverId } = ctx;
  const authority = await roleAuthority(db, user.id, serverId);
  const refused = roleRefusal(authority, {});
  if (refused) return Response.json({ error: refused }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { picks?: unknown };
  const picks = sanitizePicks(body.picks);
  const error = await savePicks(db, serverId, picks, (role) => !roleRefusal(authority, role));
  if (error) return Response.json({ error }, { status: 400 });
  await recordAudit(db, {
    serverId,
    actor: user,
    action: "server.update",
    targetName: "Role picker",
  });
  await publishStructureChange(serverId);
  return Response.json({ picks });
}
