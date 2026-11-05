import { currentUser, unauthorized, type User } from "@/lib/auth";
import { activitiesInServer, activityInServer, issueTicket } from "@/lib/bot-activities";
import { channelOverwritePermissions, mayView } from "@/lib/channel-permissions";
import { hasPermission, Permission } from "@/lib/permissions";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { findChannel, isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const TICKET_LIMIT = { action: "bot-activity-ticket", limit: 30, windowSeconds: 60 };

/** The voice room, if this person may be in it: the same test as joining its voice. */
async function room(db: D1Database, user: User, channelId: string) {
  const channel = channelId ? await findChannel(db, channelId.slice(0, 64)) : null;
  if (!channel || channel.kind !== "voice" || !(await isServerMember(db, channel.server_id, user.id))) return null;
  const here = await channelOverwritePermissions(db, user.id, channel.id, channel.server_id);
  return here === null || (mayView(here) && hasPermission(here, Permission.CONNECT)) ? channel : null;
}

const refused = () => Response.json({ error: "You can't open that voice room." }, { status: 403 });

/** GET ?channelId: the bot activities on offer in this voice room's server. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ activities: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const channel = await room(db, user, new URL(request.url).searchParams.get("channelId") || "");
  if (!channel) return refused();
  return Response.json({ activities: await activitiesInServer(db, channel.server_id) });
}

/** POST { channelId, applicationId, name }: this person's own link into the activity. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const limited = await limitUser(db, TICKET_LIMIT, user.id);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as { channelId?: string; applicationId?: string; name?: string };
  const channel = await room(db, user, String(body.channelId || ""));
  if (!channel) return refused();
  const activity = await activityInServer(db, channel.server_id, String(body.applicationId || ""), String(body.name || ""));
  if (!activity) return Response.json({ error: "That activity isn't in this server." }, { status: 404 });

  const ticket = await issueTicket(db, { applicationId: activity.application_id, userId: user.id, channelId: channel.id });
  const url = new URL(activity.url);
  url.searchParams.set("hoffle_ticket", ticket);
  return Response.json({ url: url.toString() });
}
