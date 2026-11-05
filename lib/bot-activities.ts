/**
 * Voice room activities a bot offers, the way Discord has them. A bot registers
 * a page; it shows up in the Activities menu of every server that added the
 * bot, and opens in a frame. Each viewer arrives with a one-time ticket, which
 * the bot trades with Hoffle (with its token) to learn who they are, so a
 * person's identity can't be typed into a URL and nothing shared has to stay
 * secret in the page.
 */
import { hashAppToken } from "./applications";

export const MAX_ACTIVITIES_PER_BOT = 10;
const TICKET_MS = 5 * 60_000;
const NAME = /^[a-z0-9_-]{1,32}$/;

export interface BotActivityRow {
  application_id: string;
  name: string;
  title: string;
  description: string;
  icon: string;
  url: string;
}

export interface PublicBotActivity {
  applicationId: string;
  name: string;
  title: string;
  description: string;
  icon: string;
  botName: string;
}

export function validActivityName(name: string): boolean {
  return NAME.test(name);
}

/** What a bot sent, cleaned, or what is wrong with it. */
export function cleanActivity(body: Record<string, unknown>): { title: string; description: string; icon: string; url: string } | { error: string } {
  const title = String(body.title ?? "").trim().slice(0, 60);
  if (!title) return { error: "An activity needs a title." };
  let url: URL;
  try {
    url = new URL(String(body.url ?? ""));
  } catch {
    return { error: "An activity needs a url." };
  }
  if (url.protocol !== "https:" || url.username || url.password) return { error: "An activity's url must be https." };
  return {
    title,
    description: String(body.description ?? "").trim().slice(0, 120),
    icon: String(body.icon ?? "").trim().slice(0, 8) || "🎮",
    url: url.toString().slice(0, 1000),
  };
}

const IN_SERVER = `FROM bot_activities a
  JOIN server_bots b ON b.application_id = a.application_id AND b.enabled = 1
  JOIN applications app ON app.id = a.application_id AND app.disabled_at IS NULL
  WHERE b.server_id = ?`;

/** Everything the bots in a server offer. */
export async function activitiesInServer(db: D1Database, serverId: string): Promise<PublicBotActivity[]> {
  const { results } = await db
    .prepare(`SELECT a.application_id, a.name, a.title, a.description, a.icon, app.name AS bot_name ${IN_SERVER} ORDER BY a.title`)
    .bind(serverId)
    .all<Omit<BotActivityRow, "url"> & { bot_name: string }>();
  return (results || []).map((row) => ({
    applicationId: row.application_id,
    name: row.name,
    title: row.title,
    description: row.description,
    icon: row.icon,
    botName: row.bot_name,
  }));
}

/** One activity, only if a bot in this server offers it. */
export async function activityInServer(
  db: D1Database,
  serverId: string,
  applicationId: string,
  name: string,
): Promise<(BotActivityRow & { bot_name: string }) | null> {
  return db
    .prepare(`SELECT a.*, app.name AS bot_name ${IN_SERVER} AND a.application_id = ? AND a.name = ?`)
    .bind(serverId, applicationId, name)
    .first<BotActivityRow & { bot_name: string }>();
}

export async function issueTicket(
  db: D1Database,
  ticket: { applicationId: string; userId: string; channelId: string },
): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const value = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  await db.prepare("DELETE FROM bot_activity_tickets WHERE expires_at < ?").bind(Date.now()).run();
  await db
    .prepare("INSERT INTO bot_activity_tickets (ticket_hash, application_id, user_id, channel_id, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await hashAppToken(value), ticket.applicationId, ticket.userId, ticket.channelId, Date.now() + TICKET_MS)
    .run();
  return value;
}

/** Who a ticket is for, once: it is spent by reading it, and only by its own bot. */
export async function redeemTicket(
  db: D1Database,
  applicationId: string,
  ticket: string,
): Promise<{ userId: string; channelId: string } | null> {
  const hash = await hashAppToken(ticket);
  const row = await db
    .prepare("SELECT user_id, channel_id, expires_at FROM bot_activity_tickets WHERE ticket_hash = ? AND application_id = ?")
    .bind(hash, applicationId)
    .first<{ user_id: string; channel_id: string; expires_at: number }>();
  if (!row) return null;
  await db.prepare("DELETE FROM bot_activity_tickets WHERE ticket_hash = ?").bind(hash).run();
  return row.expires_at >= Date.now() ? { userId: row.user_id, channelId: row.channel_id } : null;
}
