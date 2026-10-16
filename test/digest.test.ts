import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverDueDigest, digestFor, latestSlot, nextDigestAlarm, renderDigest, setDigestMode } from "@/lib/digest";
import { sqliteAvailable, sqliteD1 } from "./stubs/sqlite-d1";

const pushes = vi.hoisted(() => [] as Array<{ userIds: string[]; title: string }>);
const mails = vi.hoisted(() => [] as Array<{ to: string }>);
vi.mock("@/lib/push", () => ({
  sendPushNotifications: vi.fn(async (_db: unknown, userIds: string[], payload: { title: string }) => {
    pushes.push({ userIds, title: payload.title });
  }),
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async (mail: { to: string }) => {
    mails.push(mail);
    return true;
  }),
}));
vi.mock("@/lib/reminders", () => ({
  noteToSelf: vi.fn(async (_db: unknown, userId: string, text: string) => ({
    channelId: `notes-${userId}`,
    message: { id: `note-${userId}`, text },
  })),
}));

const SUNDAY_5PM = Date.UTC(2026, 9, 18, 17); // Sun 18 Oct 2026, 17:00 UTC
const DAY = 86_400_000;

describe("digest schedule", () => {
  it("lands on Sunday 17:00 UTC", () => {
    expect(new Date(SUNDAY_5PM).getUTCDay()).toBe(0);
    expect(latestSlot(SUNDAY_5PM)).toBe(SUNDAY_5PM);
    expect(latestSlot(SUNDAY_5PM - 1)).toBe(SUNDAY_5PM - 7 * DAY);
    expect(latestSlot(SUNDAY_5PM + 3 * DAY)).toBe(SUNDAY_5PM);
  });
});

describe("rendering", () => {
  it("leaves out the reader joining and says nothing when there is nothing", () => {
    const servers = [
      { serverId: "s1", name: "The Hangout", top: [], events: [], joined: [{ userId: "me", name: "Me" }] },
    ];
    expect(renderDigest("me", servers, SUNDAY_5PM)).toBeNull();
    const digest = renderDigest("someone-else", servers, SUNDAY_5PM);
    expect(digest?.markdown).toContain("New this week: Me");
    expect(digest?.summary).toBe("1 new member");
  });
});

describe.skipIf(!sqliteAvailable)("weekly run", () => {
  let db: D1Database;

  beforeEach(async () => {
    pushes.length = 0;
    mails.length = 0;
    db = sqliteD1();
    await db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)`);
    await db.exec(`CREATE TABLE digest_prefs (user_id TEXT PRIMARY KEY, mode TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    await db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT, email TEXT, suspended_at TEXT)`);
    await db.exec(`CREATE TABLE servers (id TEXT PRIMARY KEY, name TEXT, position INTEGER DEFAULT 0)`);
    await db.exec(`CREATE TABLE server_members (server_id TEXT, user_id TEXT, joined_at TEXT)`);
    await db.exec(`CREATE TABLE bans (server_id TEXT, user_id TEXT)`);
    await db.exec(`CREATE TABLE channels (id TEXT PRIMARY KEY, server_id TEXT, name TEXT)`);
    await db.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, channel_id TEXT, user_id TEXT, author TEXT, content TEXT, created_at TEXT, deleted_at TEXT)`);
    await db.exec(`CREATE TABLE reactions (message_id TEXT, user_id TEXT, emoji TEXT)`);
    await db.exec(`CREATE TABLE server_events (id TEXT PRIMARY KEY, server_id TEXT, title TEXT, starts_at TEXT)`);

    const iso = (ms: number) => new Date(ms).toISOString();
    await db.exec(`INSERT INTO users VALUES ('flo', 'Flo', 'flo@example.com', NULL), ('kiwi', 'Kiwi', NULL, NULL), ('gone', 'Gone', NULL, '2026-01-01'), ('outsider', 'Out', NULL, NULL)`);
    await db.exec(`INSERT INTO servers VALUES ('s1', 'The Hangout', 0), ('secret', 'Secret Club', 1)`);
    await db.exec(`INSERT INTO server_members VALUES
      ('s1', 'flo', '2025-01-01T00:00:00.000Z'), ('s1', 'kiwi', '${iso(SUNDAY_5PM - 2 * DAY)}'), ('s1', 'gone', '2025-01-01T00:00:00.000Z'),
      ('secret', 'outsider', '2025-01-01T00:00:00.000Z')`);
    await db.exec(`INSERT INTO channels VALUES ('c1', 's1', 'general'), ('c2', 'secret', 'plans')`);
    await db.exec(`INSERT INTO messages VALUES
      ('m1', 'c1', 'kiwi', 'Kiwi', 'the cat learned to open doors', '${iso(SUNDAY_5PM - DAY)}', NULL),
      ('m2', 'c1', 'flo', 'Flo', 'deleted joke', '${iso(SUNDAY_5PM - DAY)}', '${iso(SUNDAY_5PM)}'),
      ('m3', 'c1', 'flo', 'Flo', 'last month', '${iso(SUNDAY_5PM - 30 * DAY)}', NULL),
      ('m4', 'c2', 'outsider', 'Out', 'secret plans', '${iso(SUNDAY_5PM - DAY)}', NULL)`);
    await db.exec(`INSERT INTO reactions VALUES ('m1', 'flo', '😂'), ('m1', 'gone', '😂'), ('m1', 'flo', '🐈'), ('m2', 'kiwi', '😂'), ('m3', 'kiwi', '😂'), ('m4', 'outsider', '👀')`);
    await db.exec(`INSERT INTO server_events VALUES ('e1', 's1', 'D&D night', '${iso(SUNDAY_5PM + 2 * DAY)}'), ('e2', 's1', 'Next month', '${iso(SUNDAY_5PM + 20 * DAY)}')`);
  });

  it("collects the week for each reader's own servers only", async () => {
    const digest = await digestFor(db, "flo", SUNDAY_5PM);
    expect(digest?.markdown).toContain("“the cat learned to open doors” · 2 reactions");
    expect(digest?.markdown).toContain("**D&D night**, Tue 20 Oct, 17:00 UTC");
    expect(digest?.markdown).toContain("New this week: Kiwi");
    expect(digest?.markdown).not.toContain("deleted joke");
    expect(digest?.markdown).not.toContain("last month");
    expect(digest?.markdown).not.toContain("Next month");
    expect(digest?.markdown).not.toContain("Secret Club");
  });

  it("waits for the next Sunday after the first deploy, then sends once", async () => {
    const tuesday = SUNDAY_5PM - 5 * DAY;
    expect(await deliverDueDigest(db, tuesday)).toEqual([]);
    expect(await nextDigestAlarm(db, tuesday)).toBe(SUNDAY_5PM);

    const sent = await deliverDueDigest(db, SUNDAY_5PM + 60_000);
    expect(sent.map((d) => d.userId).sort()).toEqual(["flo", "kiwi", "outsider"]);
    expect(pushes).toHaveLength(3);
    // A second wake the same week sends nothing.
    expect(await deliverDueDigest(db, SUNDAY_5PM + 120_000)).toEqual([]);
    expect(await nextDigestAlarm(db, SUNDAY_5PM + 120_000)).toBe(SUNDAY_5PM + 7 * DAY);
  });

  it("honours off and email, and skips a week the server slept through", async () => {
    await deliverDueDigest(db, SUNDAY_5PM - 5 * DAY);
    await setDigestMode(db, "kiwi", "off");
    await setDigestMode(db, "flo", "email");
    const sent = await deliverDueDigest(db, SUNDAY_5PM + 60_000);
    expect(sent.map((d) => d.userId).sort()).toEqual(["flo", "outsider"]);
    expect(mails).toEqual([expect.objectContaining({ to: "flo@example.com" })]);

    // Down from Saturday until Tuesday: the missed Sunday is not sent late.
    expect(await deliverDueDigest(db, SUNDAY_5PM + 9 * DAY)).toEqual([]);
    expect(await nextDigestAlarm(db, SUNDAY_5PM + 9 * DAY)).toBe(SUNDAY_5PM + 14 * DAY);
  });
});
