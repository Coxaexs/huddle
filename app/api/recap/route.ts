import { channelAccess } from "@/lib/access";
import { currentUser, unauthorized } from "@/lib/auth";
import { publishEventsChanged } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { limitUser } from "@/lib/rate-limit";
import { RECAP_WEEK_MS, ensureRecapTable, postRecap } from "@/lib/recap";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const RECAP_LIMIT = { action: "recap", limit: 2, windowSeconds: 600 };

/**
 * { channelId, action: "now" }     posts the last week's recap here
 * { channelId, action: "weekly" }  Manage Server: turns the weekly recap on
 *                                  (in this channel, starting a week from now)
 *                                  or off
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  await ensureRecapTable(db);
  const body = (await request.json().catch(() => ({}))) as { channelId?: string; action?: string };
  const access = await channelAccess(db, String(body.channelId || ""), user);
  if (!access.ok) return access.response;
  if (access.channel.isDm) {
    return Response.json({ error: "Recaps are for servers." }, { status: 400 });
  }
  const serverId = access.channel.serverId;

  if (body.action === "weekly") {
    const allowed =
      Boolean(user.is_admin) || (await can(db, user.id, serverId, Permission.MANAGE_SERVER).catch(() => false));
    if (!allowed) {
      return Response.json({ error: "Only people who can manage the server can schedule recaps." }, { status: 403 });
    }
    const existing = await db
      .prepare("SELECT channel_id FROM server_recaps WHERE server_id = ?")
      .bind(serverId)
      .first<{ channel_id: string }>();
    if (existing && existing.channel_id === access.channel.id) {
      await db.prepare("DELETE FROM server_recaps WHERE server_id = ?").bind(serverId).run();
      return Response.json({ weekly: false });
    }
    const nextAt = Date.now() + RECAP_WEEK_MS;
    await db
      .prepare(
        `INSERT INTO server_recaps (server_id, channel_id, next_at, created_by) VALUES (?, ?, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET channel_id = excluded.channel_id, next_at = excluded.next_at,
           created_by = excluded.created_by`,
      )
      .bind(serverId, access.channel.id, nextAt, user.id)
      .run();
    await publishEventsChanged();
    return Response.json({ weekly: true, nextAt: new Date(nextAt).toISOString() });
  }

  const limited = await limitUser(db, RECAP_LIMIT, user.id);
  if (limited) return limited;
  const posted = await postRecap(db, serverId, access.channel.id);
  return Response.json({ posted });
}
