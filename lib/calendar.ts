/**
 * Calendar subscriptions: one secret link per person that Google Calendar,
 * Apple Calendar or Outlook can subscribe to, listing the upcoming events of
 * every server they are in (iCalendar, RFC 5545).
 *
 * Calendar apps cannot sign in, so the link carries its own token. It only
 * reads events, and resetting it makes the old link stop working.
 */
import { listEvents } from "./events";
import type { CalendarEvent } from "./ics";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** This person's calendar token, made on first ask; `reset` issues a new one. */
export async function calendarToken(db: D1Database, userId: string, { reset = false } = {}): Promise<string> {
  if (!reset) {
    const row = await db
      .prepare("SELECT token FROM calendar_tokens WHERE user_id = ?")
      .bind(userId)
      .first<{ token: string }>();
    if (row?.token) return row.token;
  }
  const token = newToken();
  await db
    .prepare(
      `INSERT INTO calendar_tokens (user_id, token, created_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at`,
    )
    .bind(userId, token, new Date().toISOString())
    .run();
  return token;
}

export async function calendarOwner(db: D1Database, token: string): Promise<string | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const row = await db
    .prepare("SELECT user_id FROM calendar_tokens WHERE token = ?")
    .bind(token)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

/** Every upcoming event in the servers this person is in, ready for buildIcs. */
export async function calendarEventsFor(db: D1Database, userId: string, origin: string): Promise<CalendarEvent[]> {
  const servers = await db
    .prepare(
      `SELECT s.id, s.name FROM servers s
         JOIN server_members m ON m.server_id = s.id AND m.user_id = ?
        ORDER BY s.name LIMIT 100`,
    )
    .bind(userId)
    .all<{ id: string; name: string }>();
  const out: CalendarEvent[] = [];
  for (const server of servers.results || []) {
    for (const event of await listEvents(db, server.id, userId)) {
      out.push({
        id: event.id,
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        serverName: server.name,
        url: `${origin}/hangout/?server=${encodeURIComponent(server.id)}`,
      });
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
