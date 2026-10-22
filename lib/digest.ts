/**
 * The weekly digest: once a week, everyone gets what they missed on their
 * servers (the messages people reacted to most, events coming up, who joined)
 * in their Notes, with a push to say it is there, and by email for those who
 * ask for it.
 *
 * It rides the hub's alarm like reminders do. One run a week, claimed in the
 * meta table, so two isolates waking at once still send it once. A person with
 * nothing to read that week gets nothing.
 */
import { sendMail } from "./mail";
import { sendPushNotifications } from "./push";
import { noteToSelf } from "./reminders";
import { DM_SERVER_ID } from "./schema";
import { GUESTBOOK_SERVER_ID } from "./guestbook";
import { Permission } from "./permissions";

export type DigestMode = "off" | "notes" | "email";
export const DIGEST_MODES: DigestMode[] = ["off", "notes", "email"];
/** Everyone starts on Notes; email is something you ask for. */
export const DEFAULT_DIGEST_MODE: DigestMode = "notes";

/** Sundays at 17:00 UTC: evening in Europe, midday in the Americas. */
const DIGEST_WEEKDAY = 0;
const DIGEST_HOUR_UTC = 17;
const WEEK_MS = 7 * 86_400_000;
/** A slot missed by more than this (the server was down) is skipped, not sent late. */
const LATE_LIMIT_MS = 24 * 3600_000;
const META_KEY = "digest_last_slot";
const TOP_MESSAGES = 3;
const FROM = { author: "Weekly digest", avatar: "📬", color: "#7b8cff" };

/** The latest digest time at or before `now`. */
export function latestSlot(now: number): number {
  const date = new Date(now);
  const slot = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), DIGEST_HOUR_UTC);
  const back = (date.getUTCDay() - DIGEST_WEEKDAY + 7) % 7;
  const candidate = slot - back * 86_400_000;
  return candidate > now ? candidate - WEEK_MS : candidate;
}

async function lastSentSlot(db: D1Database, now: number): Promise<number> {
  const row = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(META_KEY).first<{ value: string }>();
  if (row) return Number(row.value) || 0;
  // First run on this database: start with the next slot rather than sending
  // one the moment the feature is deployed.
  const current = latestSlot(now);
  await db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)").bind(META_KEY, String(current)).run();
  return current;
}

/** When the hub should next wake for the digest. */
export async function nextDigestAlarm(db: D1Database, now = Date.now()): Promise<number> {
  const last = await lastSentSlot(db, now);
  const current = latestSlot(now);
  return current > last ? now : current + WEEK_MS;
}

export async function digestMode(db: D1Database, userId: string): Promise<DigestMode> {
  const row = await db.prepare("SELECT mode FROM digest_prefs WHERE user_id = ?").bind(userId).first<{ mode: string }>();
  return DIGEST_MODES.includes(row?.mode as DigestMode) ? (row!.mode as DigestMode) : DEFAULT_DIGEST_MODE;
}

export async function setDigestMode(db: D1Database, userId: string, mode: DigestMode): Promise<void> {
  await db
    .prepare(
      `INSERT INTO digest_prefs (user_id, mode, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at`,
    )
    .bind(userId, mode, new Date().toISOString())
    .run();
}

// ---------------------------------------------------------------------------
// What goes in it
// ---------------------------------------------------------------------------

export interface ServerDigest {
  serverId: string;
  name: string;
  top: Array<{ author: string; channel: string; text: string; reactions: number; userId: string | null }>;
  events: Array<{ title: string; startsAt: string }>;
  joined: Array<{ userId: string; name: string }>;
}

function snippet(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** One server's week, shared by everyone in it (each reader filters out themselves). */
export async function serverWeek(
  db: D1Database,
  server: { id: string; name: string },
  now: number,
): Promise<ServerDigest> {
  const since = new Date(now - WEEK_MS).toISOString();
  const until = new Date(now + WEEK_MS).toISOString();
  const [top, events, joined] = await Promise.all([
    db
      .prepare(
        `SELECT m.author, m.content, m.user_id, c.name AS channel, COUNT(DISTINCT r.user_id) AS reactions
           FROM messages m
           JOIN channels c ON c.id = m.channel_id
           JOIN reactions r ON r.message_id = m.id
          WHERE c.server_id = ? AND m.created_at >= ? AND m.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM channel_overwrites o
                             WHERE o.channel_id = c.id AND (o.deny & ${Permission.VIEW_CHANNEL}) != 0)
          GROUP BY m.id
          ORDER BY reactions DESC, m.created_at DESC
          LIMIT ?`,
      )
      .bind(server.id, since, TOP_MESSAGES)
      .all<{ author: string; content: string; user_id: string | null; channel: string; reactions: number }>(),
    db
      .prepare(
        `SELECT title, starts_at FROM server_events
          WHERE server_id = ? AND starts_at >= ? AND starts_at < ?
          ORDER BY starts_at LIMIT 5`,
      )
      .bind(server.id, new Date(now).toISOString(), until)
      .all<{ title: string; starts_at: string }>(),
    db
      .prepare(
        `SELECT sm.user_id, u.display_name FROM server_members sm
           JOIN users u ON u.id = sm.user_id
          WHERE sm.server_id = ? AND sm.joined_at >= ?
          ORDER BY sm.joined_at LIMIT 20`,
      )
      .bind(server.id, since)
      .all<{ user_id: string; display_name: string }>(),
  ]);
  return {
    serverId: server.id,
    name: server.name,
    top: (top.results || []).map((m) => ({
      author: m.author,
      channel: m.channel,
      text: snippet(m.content || ""),
      reactions: Number(m.reactions),
      userId: m.user_id,
    })),
    events: (events.results || []).map((e) => ({ title: e.title, startsAt: e.starts_at })),
    joined: (joined.results || []).map((j) => ({ userId: j.user_id, name: j.display_name })),
  };
}

function eventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day}, ${time} UTC`;
}

/** The digest for one reader, as Markdown for Notes and plain text for email; null when there is nothing in it. */
export function renderDigest(
  userId: string,
  servers: ServerDigest[],
  now: number,
): { markdown: string; text: string; summary: string } | null {
  const sections: Array<{ md: string[]; txt: string[] }> = [];
  let topCount = 0;
  let eventCount = 0;
  let joinCount = 0;
  for (const server of servers) {
    const joined = server.joined.filter((j) => j.userId !== userId);
    if (!server.top.length && !server.events.length && !joined.length) continue;
    const md = [`**${server.name}**`];
    const txt = [server.name.toUpperCase()];
    if (server.top.length) {
      md.push("🔥 What people reacted to");
      txt.push("What people reacted to:");
      for (const m of server.top) {
        const line = `${m.author} in #${m.channel}: "${m.text}" (${m.reactions} ${m.reactions === 1 ? "reaction" : "reactions"})`;
        md.push(`• **${m.author}** in #${m.channel}: “${m.text}” · ${m.reactions} ${m.reactions === 1 ? "reaction" : "reactions"}`);
        txt.push(`  - ${line}`);
      }
      topCount += server.top.length;
    }
    if (server.events.length) {
      md.push("📅 Coming up");
      txt.push("Coming up:");
      for (const e of server.events) {
        md.push(`• **${e.title}**, ${eventTime(e.startsAt)}`);
        txt.push(`  - ${e.title}, ${eventTime(e.startsAt)}`);
      }
      eventCount += server.events.length;
    }
    if (joined.length) {
      const names = joined.map((j) => j.name).join(", ");
      md.push(`👋 New this week: ${names}`);
      txt.push(`New this week: ${names}`);
      joinCount += joined.length;
    }
    sections.push({ md, txt });
  }
  if (!sections.length) return null;

  const from = new Date(now - WEEK_MS).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const to = new Date(now).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const footer = "Change or turn off the weekly digest in Settings → Appearance → Weekly digest.";
  const markdown = [`📬 **Your week on Hoffle** (${from} – ${to})`, ...sections.map((s) => s.md.join("\n")), `_${footer}_`].join("\n\n");
  const text = [`Your week on Hoffle (${from} – ${to})`, ...sections.map((s) => s.txt.join("\n")), footer].join("\n\n");
  const parts = [
    topCount && `${topCount} popular ${topCount === 1 ? "message" : "messages"}`,
    eventCount && `${eventCount} ${eventCount === 1 ? "event" : "events"} coming up`,
    joinCount && `${joinCount} new ${joinCount === 1 ? "member" : "members"}`,
  ].filter(Boolean);
  return { markdown, text, summary: parts.join(", ") };
}

/** Everything one person would get right now, for "send me one now" and the weekly run. */
export async function digestFor(
  db: D1Database,
  userId: string,
  now: number,
  cache = new Map<string, Promise<ServerDigest>>(),
) {
  const servers = await db
    .prepare(
      `SELECT s.id, s.name FROM server_members sm
         JOIN servers s ON s.id = sm.server_id
        WHERE sm.user_id = ? AND s.id NOT IN (?, ?)
          AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.server_id = s.id AND b.user_id = sm.user_id)
        ORDER BY s.position, s.name`,
    )
    .bind(userId, DM_SERVER_ID, GUESTBOOK_SERVER_ID)
    .all<{ id: string; name: string }>();
  const weeks = await Promise.all(
    (servers.results || []).map((server) => {
      let week = cache.get(server.id);
      if (!week) {
        week = serverWeek(db, server, now);
        cache.set(server.id, week);
      }
      return week;
    }),
  );
  return renderDigest(userId, weeks, now);
}

export interface DigestDelivery {
  userId: string;
  channelId: string;
  message: Record<string, unknown>;
}

/** Puts one person's digest in their Notes, pings them, and emails it if they asked. */
export async function sendDigest(
  db: D1Database,
  user: { id: string; email?: string | null },
  mode: DigestMode,
  digest: NonNullable<ReturnType<typeof renderDigest>>,
  now: number,
): Promise<DigestDelivery> {
  const note = await noteToSelf(db, user.id, digest.markdown, now, FROM);
  await sendPushNotifications(db, [user.id], {
    title: "Your week on Hoffle",
    body: digest.summary ? `${digest.summary}. It's in your Notes.` : "It's in your Notes.",
    url: "/hangout",
    tag: "weekly-digest",
  }).catch(() => undefined);
  if (mode === "email" && user.email) {
    await sendMail({ to: user.email, subject: "Your week on Hoffle", text: digest.text }).catch(() => false);
  }
  return { userId: user.id, ...note };
}

/**
 * The weekly run, when it is due. Returns the Notes messages it posted, so
 * the hub can show them in open tabs.
 */
export async function deliverDueDigest(db: D1Database, now = Date.now()): Promise<DigestDelivery[]> {
  const last = await lastSentSlot(db, now);
  const slot = latestSlot(now);
  if (slot <= last) return [];
  // Claim the week first: whoever flips the value sends it.
  const claimed = await db
    .prepare("UPDATE meta SET value = ? WHERE key = ? AND value = ?")
    .bind(String(slot), META_KEY, String(last))
    .run();
  if (!claimed.meta.changes) return [];
  if (now - slot > LATE_LIMIT_MS) return [];

  const users = await db
    .prepare(
      `SELECT u.id, u.email, COALESCE(p.mode, ?) AS mode FROM users u
         LEFT JOIN digest_prefs p ON p.user_id = u.id
        WHERE u.suspended_at IS NULL AND COALESCE(p.mode, ?) != 'off'`,
    )
    .bind(DEFAULT_DIGEST_MODE, DEFAULT_DIGEST_MODE)
    .all<{ id: string; email: string | null; mode: DigestMode }>();
  const cache = new Map<string, Promise<ServerDigest>>();
  const delivered: DigestDelivery[] = [];
  for (const user of users.results || []) {
    try {
      const digest = await digestFor(db, user.id, slot, cache);
      if (digest) delivered.push(await sendDigest(db, user, user.mode, digest, now));
    } catch {
      // One person's digest failing must not stop everyone else's.
    }
  }
  return delivered;
}
