/**
 * Scheduled server events (game nights, D&D sessions): a time, an optional
 * voice channel, and RSVPs. The hub's alarm sends a reminder shortly before
 * the start and a "starting now" when it begins, to everyone going or maybe.
 */

export type RsvpStatus = "going" | "maybe" | "no";

export const RSVP_STATUSES: readonly RsvpStatus[] = ["going", "maybe", "no"];

/** How long before the start the reminder goes out. */
export const REMINDER_LEAD_MS = 15 * 60_000;

/** Events more than this far past their start (or end) drop off the list. */
const LIST_GRACE_MS = 6 * 60 * 60_000;

/** Alarms for events that started longer ago than this are skipped, not sent late. */
const STALE_MS = 60 * 60_000;

export interface EventAttendee {
  id: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  status: RsvpStatus;
}

export interface PublicEvent {
  id: string;
  serverId: string;
  channelId: string | null;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  createdBy: string;
  creatorName: string;
  attendees: EventAttendee[];
  counts: Record<RsvpStatus, number>;
  myStatus: RsvpStatus | null;
}

export interface EventInput {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  channelId: string | null;
}

/** Validates a create/edit body. Returns the cleaned event or a message for the user. */
export function parseEventInput(
  body: Record<string, unknown>,
  now = Date.now(),
  { allowPast = false } = {},
): { ok: true; event: EventInput } | { ok: false; error: string } {
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 100) : "";
  if (!title) return { ok: false, error: "Give the event a name." };
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";

  const starts = typeof body.startsAt === "string" ? Date.parse(body.startsAt) : NaN;
  if (!Number.isFinite(starts)) return { ok: false, error: "Pick when it starts." };
  if (!allowPast && starts < now - 60_000) {
    return { ok: false, error: "The start time is in the past." };
  }
  if (starts > now + 366 * 24 * 60 * 60_000) {
    return { ok: false, error: "Pick a start within the next year." };
  }

  let endsAt: string | null = null;
  if (body.endsAt !== undefined && body.endsAt !== null && body.endsAt !== "") {
    const ends = typeof body.endsAt === "string" ? Date.parse(body.endsAt) : NaN;
    if (!Number.isFinite(ends)) return { ok: false, error: "That end time is not valid." };
    if (ends <= starts) return { ok: false, error: "It has to end after it starts." };
    endsAt = new Date(ends).toISOString();
  }

  const channelId =
    typeof body.channelId === "string" && body.channelId ? body.channelId.slice(0, 64) : null;
  return {
    ok: true,
    event: { title, description, startsAt: new Date(starts).toISOString(), endsAt, channelId },
  };
}

interface EventRow {
  id: string;
  server_id: string;
  channel_id: string | null;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  created_by: string;
  creator_name: string | null;
}

interface RsvpRow {
  event_id: string;
  user_id: string;
  status: RsvpStatus;
  display_name: string;
  nickname: string | null;
  avatar: string;
  avatar_url: string | null;
  color: string;
}

/** Upcoming (and just-finished) events in a server, soonest first. */
export async function listEvents(
  db: D1Database,
  serverId: string,
  viewerId: string,
  now = Date.now(),
): Promise<PublicEvent[]> {
  const since = new Date(now - LIST_GRACE_MS).toISOString();
  const rows = await db
    .prepare(
      `SELECT e.id, e.server_id, e.channel_id, e.title, e.description, e.starts_at, e.ends_at,
              e.created_by, u.display_name AS creator_name
         FROM server_events e
         LEFT JOIN users u ON u.id = e.created_by
        WHERE e.server_id = ? AND COALESCE(e.ends_at, e.starts_at) >= ?
        ORDER BY e.starts_at ASC
        LIMIT 50`,
    )
    .bind(serverId, since)
    .all<EventRow>();
  const events = rows.results || [];
  if (!events.length) return [];

  const placeholders = events.map(() => "?").join(",");
  const rsvps = await db
    .prepare(
      `SELECT r.event_id, r.user_id, r.status, u.display_name, m.nickname,
              u.avatar, u.avatar_url, u.color
         FROM event_rsvps r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN server_members m ON m.user_id = r.user_id AND m.server_id = ?
        WHERE r.event_id IN (${placeholders})
        ORDER BY r.updated_at ASC`,
    )
    .bind(serverId, ...events.map((event) => event.id))
    .all<RsvpRow>();

  const byEvent = new Map<string, RsvpRow[]>();
  for (const row of rsvps.results || []) {
    const list = byEvent.get(row.event_id) || [];
    list.push(row);
    byEvent.set(row.event_id, list);
  }

  return events.map((event) => {
    const list = byEvent.get(event.id) || [];
    const counts: Record<RsvpStatus, number> = { going: 0, maybe: 0, no: 0 };
    for (const row of list) counts[row.status] = (counts[row.status] || 0) + 1;
    return {
      id: event.id,
      serverId: event.server_id,
      channelId: event.channel_id,
      title: event.title,
      description: event.description,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      createdBy: event.created_by,
      creatorName: event.creator_name || "Someone",
      attendees: list
        .filter((row) => row.status !== "no")
        .map((row) => ({
          id: row.user_id,
          displayName: row.nickname || row.display_name,
          avatar: row.avatar,
          avatarUrl: row.avatar_url,
          color: row.color,
          status: row.status,
        })),
      counts,
      myStatus: list.find((row) => row.user_id === viewerId)?.status || null,
    };
  });
}

interface PendingRow {
  id: string;
  server_id: string;
  title: string;
  starts_at: string;
  reminded_at: string | null;
  started_at: string | null;
}

/** When an unfinished event next needs attention: its reminder, then its start. */
export function eventDueAt(row: Pick<PendingRow, "starts_at" | "reminded_at">): number {
  const start = Date.parse(row.starts_at);
  return row.reminded_at ? start : start - REMINDER_LEAD_MS;
}

async function pendingEvents(db: D1Database, now: number): Promise<PendingRow[]> {
  const rows = await db
    .prepare(
      `SELECT id, server_id, title, starts_at, reminded_at, started_at FROM server_events
        WHERE starts_at >= ? AND (reminded_at IS NULL OR started_at IS NULL)
        ORDER BY starts_at ASC LIMIT 50`,
    )
    .bind(new Date(now - STALE_MS).toISOString())
    .all<PendingRow>();
  return rows.results || [];
}

/** The next moment the hub needs to wake for event reminders, or null. */
export async function nextEventAlarm(db: D1Database, now = Date.now()): Promise<number | null> {
  let next: number | null = null;
  for (const row of await pendingEvents(db, now)) {
    const due = Math.max(eventDueAt(row), now);
    if (next === null || due < next) next = due;
  }
  return next;
}

export interface EventNotice {
  userIds: string[];
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Marks every reminder and start that is now due, and returns the pushes to
 * send. Marking happens with a conditional UPDATE, so two overlapping alarms
 * can't notify twice.
 */
export async function collectDueEventNotices(
  db: D1Database,
  now = Date.now(),
): Promise<EventNotice[]> {
  const notices: EventNotice[] = [];
  const stamp = new Date(now).toISOString();
  for (const row of await pendingEvents(db, now)) {
    const start = Date.parse(row.starts_at);
    const startDue = !row.started_at && start <= now;
    const reminderDue = !row.reminded_at && start - REMINDER_LEAD_MS <= now;
    if (!startDue && !reminderDue) continue;

    // Starting now also covers the reminder, so nobody gets two pings at once.
    const claimed = await db
      .prepare(
        startDue
          ? `UPDATE server_events SET started_at = ?1, reminded_at = COALESCE(reminded_at, ?1)
              WHERE id = ?2 AND started_at IS NULL`
          : `UPDATE server_events SET reminded_at = ?1 WHERE id = ?2 AND reminded_at IS NULL`,
      )
      .bind(stamp, row.id)
      .run();
    if (!claimed.meta.changes) continue;

    const people = await db
      .prepare(
        "SELECT user_id FROM event_rsvps WHERE event_id = ? AND status IN ('going', 'maybe')",
      )
      .bind(row.id)
      .all<{ user_id: string }>();
    const userIds = (people.results || []).map((person) => person.user_id);
    if (!userIds.length) continue;

    const minutes = Math.max(1, Math.round((start - now) / 60_000));
    notices.push({
      userIds,
      title: row.title,
      body: startDue ? "Starting now. Come hang out!" : `Starts in ${minutes} minutes.`,
      url: "/hangout",
      tag: `event-${row.id}`,
    });
  }
  return notices;
}
