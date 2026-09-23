import { describe, expect, it } from "vitest";
import {
  REMINDER_LEAD_MS,
  collectDueEventNotices,
  eventDueAt,
  nextEventAlarm,
  parseEventInput,
} from "../lib/events";
import { activeUntil } from "../lib/timeouts";
import { memberFromRow, type MemberRow } from "../lib/auth";
import { eventIsOpen, eventWhen } from "../app/components/events-panel";

const NOW = Date.parse("2026-09-22T18:00:00.000Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const MIN = 60_000;

describe("parseEventInput", () => {
  it("cleans a valid event", () => {
    const result = parseEventInput(
      { title: "  Game night ", startsAt: iso(60 * MIN), channelId: "voice-1" },
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      event: {
        title: "Game night",
        description: "",
        startsAt: iso(60 * MIN),
        endsAt: null,
        channelId: "voice-1",
      },
    });
  });

  it("rejects bad input with a readable message", () => {
    expect(parseEventInput({ startsAt: iso(MIN) }, NOW)).toMatchObject({ ok: false });
    expect(parseEventInput({ title: "x", startsAt: "soon" }, NOW)).toMatchObject({ ok: false });
    expect(parseEventInput({ title: "x", startsAt: iso(-10 * MIN) }, NOW)).toMatchObject({
      ok: false,
      error: "The start time is in the past.",
    });
    expect(
      parseEventInput({ title: "x", startsAt: iso(60 * MIN), endsAt: iso(30 * MIN) }, NOW),
    ).toMatchObject({ ok: false, error: "It has to end after it starts." });
    expect(parseEventInput({ title: "x", startsAt: iso(-10 * MIN) }, NOW, { allowPast: true }))
      .toMatchObject({ ok: true });
  });
});

describe("event timing", () => {
  it("is due for its reminder first, then its start", () => {
    const start = iso(60 * MIN);
    expect(eventDueAt({ starts_at: start, reminded_at: null })).toBe(NOW + 60 * MIN - REMINDER_LEAD_MS);
    expect(eventDueAt({ starts_at: start, reminded_at: iso(0) })).toBe(NOW + 60 * MIN);
  });

  it("describes when it happens", () => {
    expect(eventWhen({ startsAt: iso(20 * MIN), endsAt: null }, NOW)).toBe("Starts in 20m");
    expect(eventWhen({ startsAt: iso(-5 * MIN), endsAt: null }, NOW)).toBe("Happening now");
    expect(eventWhen({ startsAt: iso(-5 * 60 * MIN), endsAt: iso(-MIN) }, NOW)).toBe("Ended");
    expect(eventIsOpen({ startsAt: iso(10 * MIN), endsAt: null }, NOW)).toBe(true);
    expect(eventIsOpen({ startsAt: iso(30 * MIN), endsAt: null }, NOW)).toBe(false);
  });
});

/** Just enough of D1 for the reminder queries, backed by plain arrays. */
function fakeDb(
  events: Array<{
    id: string;
    server_id: string;
    title: string;
    starts_at: string;
    reminded_at: string | null;
    started_at: string | null;
  }>,
  rsvps: Array<{ event_id: string; user_id: string; status: string }>,
) {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              if (sql.includes("FROM server_events")) {
                const stale = args[0] as string;
                return {
                  results: events
                    .filter((e) => e.starts_at >= stale && (!e.reminded_at || !e.started_at))
                    .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
                };
              }
              if (sql.includes("FROM event_rsvps")) {
                return {
                  results: rsvps.filter(
                    (r) => r.event_id === args[0] && (r.status === "going" || r.status === "maybe"),
                  ),
                };
              }
              throw new Error(`unexpected query: ${sql}`);
            },
            async run() {
              const [stamp, id] = args as [string, string];
              const event = events.find((e) => e.id === id)!;
              if (sql.includes("SET started_at")) {
                if (event.started_at) return { meta: { changes: 0 } };
                event.started_at = stamp;
                event.reminded_at ??= stamp;
                return { meta: { changes: 1 } };
              }
              if (event.reminded_at) return { meta: { changes: 0 } };
              event.reminded_at = stamp;
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("collectDueEventNotices", () => {
  it("reminds once, then announces the start once, only to going/maybe", async () => {
    const events = [
      { id: "e1", server_id: "s", title: "Game night", starts_at: iso(10 * MIN), reminded_at: null, started_at: null },
    ];
    const rsvps = [
      { event_id: "e1", user_id: "alice", status: "going" },
      { event_id: "e1", user_id: "bob", status: "maybe" },
      { event_id: "e1", user_id: "carol", status: "no" },
    ];
    const db = fakeDb(events, rsvps);

    const reminder = await collectDueEventNotices(db, NOW);
    expect(reminder).toHaveLength(1);
    expect(reminder[0]).toMatchObject({ userIds: ["alice", "bob"], body: "Starts in 10 minutes." });
    expect(await collectDueEventNotices(db, NOW + MIN)).toEqual([]);

    const start = await collectDueEventNotices(db, NOW + 10 * MIN);
    expect(start).toHaveLength(1);
    expect(start[0].body).toBe("Starting now. Come hang out!");
    expect(await collectDueEventNotices(db, NOW + 11 * MIN)).toEqual([]);
    expect(await nextEventAlarm(db, NOW + 11 * MIN)).toBeNull();
  });

  it("sends a single start notice when the reminder was never sent", async () => {
    const events = [
      { id: "e2", server_id: "s", title: "Session", starts_at: iso(-MIN), reminded_at: null, started_at: null },
    ];
    const db = fakeDb(events, [{ event_id: "e2", user_id: "alice", status: "going" }]);
    const notices = await collectDueEventNotices(db, NOW);
    expect(notices.map((n) => n.body)).toEqual(["Starting now. Come hang out!"]);
    expect(await collectDueEventNotices(db, NOW)).toEqual([]);
  });

  it("schedules the next wake-up at the reminder time", async () => {
    const db = fakeDb(
      [{ id: "e3", server_id: "s", title: "Later", starts_at: iso(120 * MIN), reminded_at: null, started_at: null }],
      [],
    );
    expect(await nextEventAlarm(db, NOW)).toBe(NOW + 120 * MIN - REMINDER_LEAD_MS);
  });
});

describe("timeouts", () => {
  it("only counts a timeout that has not ended", () => {
    expect(activeUntil(null, NOW)).toBeNull();
    expect(activeUntil(iso(-MIN), NOW)).toBeNull();
    expect(activeUntil(iso(MIN), NOW)).toBe(iso(MIN));
    expect(activeUntil("nonsense", NOW)).toBeNull();
  });

  it("shows running timeouts in the member list", () => {
    const row: MemberRow = {
      id: "u1",
      username: "sam",
      display_name: "Sam",
      avatar: "S",
      color: "#fff",
      is_admin: 0,
      created_at: iso(0),
      last_seen_at: iso(0),
      timeout_until: new Date(Date.now() + 5 * MIN).toISOString(),
    };
    expect(memberFromRow(row, "x").timeoutUntil).toBe(row.timeout_until);
    expect(memberFromRow({ ...row, timeout_until: iso(-99 * 60 * MIN) }, "x").timeoutUntil).toBeNull();
  });
});
