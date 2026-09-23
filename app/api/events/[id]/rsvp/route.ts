import { currentUser, unauthorized } from "@/lib/auth";
import { RSVP_STATUSES, type RsvpStatus } from "@/lib/events";
import { publishStructureChange } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Say whether you're coming: going, maybe, no, or null to clear. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await context.params;
  const event = await db
    .prepare("SELECT server_id FROM server_events WHERE id = ?")
    .bind(id)
    .first<{ server_id: string }>();
  if (!event) return Response.json({ error: "That event is gone." }, { status: 404 });
  if (!(await isServerMember(db, event.server_id, user.id))) {
    return Response.json({ error: "You are not in that server." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { status?: string | null };
  const status = RSVP_STATUSES.includes(body.status as RsvpStatus)
    ? (body.status as RsvpStatus)
    : null;
  if (body.status !== null && body.status !== undefined && !status) {
    return Response.json({ error: "Going, maybe or no?" }, { status: 400 });
  }

  if (status) {
    await db
      .prepare(
        `INSERT INTO event_rsvps (event_id, user_id, status, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (event_id, user_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      )
      .bind(id, user.id, status, new Date().toISOString())
      .run();
  } else {
    await db
      .prepare("DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?")
      .bind(id, user.id)
      .run();
  }
  await publishStructureChange();
  return Response.json({ ok: true, status });
}
