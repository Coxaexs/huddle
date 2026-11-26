import { currentUser, unauthorized } from "@/lib/auth";
import { resetXp, setMemberXp } from "@/lib/community-bot/levels";
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
    action?: "set" | "reset-user" | "reset-server";
    userId?: string;
    xp?: number;
  };

  if (body.action === "set" && body.userId && typeof body.xp === "number") {
    const updated = await setMemberXp(db, serverId, body.userId, body.xp);
    return Response.json({ ok: true, ...updated });
  }
  if (body.action === "reset-user" && body.userId) {
    await resetXp(db, serverId, body.userId);
    return Response.json({ ok: true });
  }
  if (body.action === "reset-server") {
    await resetXp(db, serverId);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Invalid XP action." }, { status: 400 });
}
