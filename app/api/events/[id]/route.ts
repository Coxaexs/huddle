import { currentUser, unauthorized, type User } from "@/lib/auth";
import { parseEventInput } from "@/lib/events";
import { publishEventsChanged, publishStructureChange } from "@/lib/hub-client";
import { canAny, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface EventOwnerRow {
  id: string;
  server_id: string;
  created_by: string;
  starts_at: string;
}

/** The event, if `user` may change it: its creator, or a server manager. */
async function editableEvent(
  db: D1Database,
  id: string,
  user: User,
): Promise<EventOwnerRow | Response> {
  const event = await db
    .prepare("SELECT id, server_id, created_by, starts_at FROM server_events WHERE id = ?")
    .bind(id)
    .first<EventOwnerRow>();
  if (!event) return Response.json({ error: "That event is gone." }, { status: 404 });
  if (
    event.created_by !== user.id &&
    !(await canAny(db, user.id, event.server_id, Permission.MANAGE_SERVER, Permission.MANAGE_CHANNELS))
  ) {
    return Response.json(
      { error: "Only whoever made the event, or a server manager, can change it." },
      { status: 403 },
    );
  }
  return event;
}

/** Edit an event. Moving its start resets the reminders so they fire for the new time. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await context.params;
  const event = await editableEvent(db, id, user);
  if (event instanceof Response) return event;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseEventInput(body, Date.now(), { allowPast: true });
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const input = parsed.event;
  const moved = Date.parse(input.startsAt) !== Date.parse(event.starts_at);
  // Keeping an already-started event's time is fine; only a new time must be ahead.
  if (moved && Date.parse(input.startsAt) < Date.now() - 60_000) {
    return Response.json({ error: "The start time is in the past." }, { status: 400 });
  }
  if (input.channelId) {
    const channel = await db
      .prepare("SELECT id FROM channels WHERE id = ? AND server_id = ?")
      .bind(input.channelId, event.server_id)
      .first();
    if (!channel) return Response.json({ error: "That channel is not in this server." }, { status: 400 });
  }

  await db
    .prepare(
      `UPDATE server_events
          SET title = ?, description = ?, starts_at = ?, ends_at = ?, channel_id = ?
              ${moved ? ", reminded_at = NULL, started_at = NULL" : ""}
        WHERE id = ?`,
    )
    .bind(input.title, input.description, input.startsAt, input.endsAt, input.channelId, id)
    .run();

  await publishEventsChanged();
  await publishStructureChange();
  return Response.json({ ok: true });
}

/** Cancel an event. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await context.params;
  const event = await editableEvent(db, id, user);
  if (event instanceof Response) return event;

  await db.batch([
    db.prepare("DELETE FROM event_rsvps WHERE event_id = ?").bind(id),
    db.prepare("DELETE FROM server_events WHERE id = ?").bind(id),
  ]);
  await publishStructureChange();
  return Response.json({ ok: true });
}
