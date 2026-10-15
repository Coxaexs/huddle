import { recordAudit } from "@/lib/audit";
import { INSTANCE_AUDIT } from "@/lib/admin";
import { getSignupSettings, setSignupSettings, turnstileSiteKey } from "@/lib/signup";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

async function snapshot(db: D1Database) {
  const settings = await getSignupSettings(db);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const rows = await db
    .prepare(
      `SELECT COALESCE(signup_source, 'older') AS source, COUNT(*) AS total,
              SUM(created_at > ?) AS last24h
         FROM users GROUP BY 1`,
    )
    .bind(since)
    .all<{ source: string; total: number; last24h: number | null }>();
  const stats: Record<string, { total: number; last24h: number }> = {};
  for (const row of rows.results) {
    stats[row.source] = { total: Number(row.total), last24h: Number(row.last24h ?? 0) };
  }
  return { ...settings, turnstile: Boolean(turnstileSiteKey()), stats };
}

/** Whether open signup is on, where those accounts land, and how people have joined. */
export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  return Response.json(await snapshot(gate.db));
}

/** `{ open?: boolean, serverId?: string | null }` */
export async function POST(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const { db } = gate;
  const body = (await request.json().catch(() => ({}))) as { open?: unknown; serverId?: unknown };
  const before = await getSignupSettings(db);

  let serverId = before.serverId;
  if (body.serverId !== undefined) {
    serverId = typeof body.serverId === "string" && body.serverId ? body.serverId.slice(0, 64) : null;
    if (serverId) {
      const server = await db.prepare("SELECT id FROM servers WHERE id = ?").bind(serverId).first();
      if (!server) return Response.json({ error: "That server does not exist." }, { status: 400 });
    }
  }
  const open = typeof body.open === "boolean" ? body.open : before.open;
  await setSignupSettings(db, { open, serverId });

  if (open !== before.open) {
    await recordAudit(db, {
      serverId: INSTANCE_AUDIT,
      actor: gate.user,
      action: open ? "signup.open" : "signup.close",
      targetName: open ? "Open signup turned on" : "Open signup turned off",
    });
  }
  return Response.json(await snapshot(db));
}
