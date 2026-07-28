import { currentUser, unauthorized } from "@/lib/auth";
import { listAudit } from "@/lib/audit";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** The audit trail for a server. Gated by MANAGE_SERVER, like the ban list. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ entries: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const serverId = new URL(request.url).searchParams.get("serverId") || "";
  if (!serverId) {
    return Response.json({ error: "Which server?" }, { status: 400 });
  }
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json(
      { error: "You do not have permission to see the audit log." },
      { status: 403 },
    );
  }

  return Response.json({ entries: await listAudit(db, serverId) });
}
