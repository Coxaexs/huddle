import { currentUser, unauthorized } from "@/lib/auth";
import { listEvents, parseEventInput } from "@/lib/events";
import { publishEventsChanged, publishStructureChange } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Upcoming events in a server. Members only. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ events: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const serverId = new URL(request.url).searchParams.get("serverId") || "";
  if (!serverId || !(await isServerMember(db, serverId, user.id))) {
    return Response.json({ events: [] });
  }
  return Response.json({ events: await listEvents(db, serverId, user.id) });
}

/** Schedule an event. Any member can; you are marked as going. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const serverId = typeof body.serverId === "string" ? body.serverId : "";
  if (!serverId || !(await isServerMember(db, serverId, user.id))) {
    return Response.json({ error: "You are not in that server." }, { status: 403 });
  }
  const parsed = parseEventInput(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const input = parsed.event;
  if (input.channelId) {
    const channel = await db
      .prepare("SELECT id FROM channels WHERE id = ? AND server_id = ?")
      .bind(input.channelId, serverId)
      .first();
    if (!channel) return Response.json({ error: "That channel is not in this server." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO server_events
           (id, server_id, channel_id, title, description, starts_at, ends_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        serverId,
        input.channelId,
        input.title,
        input.description,
        input.startsAt,
        input.endsAt,
        user.id,
        now,
      ),
    db
      .prepare(
        "INSERT INTO event_rsvps (event_id, user_id, status, updated_at) VALUES (?, ?, 'going', ?)",
      )
      .bind(id, user.id, now),
  ]);

  await publishEventsChanged();
  await publishStructureChange();
  return Response.json({ id }, { status: 201 });
}
