/**
 * /applications/{id}/activities and /applications/{id}/activity-tickets/{ticket}:
 * how a Developer Portal bot registers voice room activities and learns who
 * opened one (lib/bot-activities.ts).
 */
import {
  cleanActivity,
  MAX_ACTIVITIES_PER_BOT,
  redeemTicket,
  validActivityName,
  type BotActivityRow,
} from "../bot-activities";
import { channelWithGuild, loadUser } from "./guild-data";
import { ErrorCode, discordError, type RestContext } from "./rest";
import { serializeUser } from "./serialize";
import { snowflakeFor } from "./snowflake";

const json = (body: unknown) => Response.json(body);

export function isActivityRoute(segments: string[]): boolean {
  return segments[1] === "activities" || segments[1] === "activity-tickets";
}

function serialize(row: BotActivityRow) {
  return { name: row.name, title: row.title, description: row.description, icon: row.icon, url: row.url };
}

export async function handleActivityRoutes(context: RestContext, segments: string[]): Promise<Response> {
  const { db, bot, request } = context;
  if (!bot.applicationId) {
    return discordError(403, ErrorCode.MissingAccess, "Activities are for bots from the Developer Portal");
  }
  const appId = bot.applicationId;

  if (segments[1] === "activity-tickets") {
    const found = segments[2] && request.method === "GET" ? await redeemTicket(db, appId, segments[2]) : null;
    if (!found) return discordError(404, ErrorCode.GeneralError, "Unknown or used ticket");
    const [user, located] = await Promise.all([loadUser(db, found.userId), channelWithGuild(db, found.channelId)]);
    if (!user || !located) return discordError(404, ErrorCode.GeneralError, "Unknown or used ticket");
    return json({
      user: await serializeUser(user),
      channel_id: await snowflakeFor("channel", located.channel.id, located.channel.created_at),
      guild_id: located.server ? await snowflakeFor("guild", located.server.id, located.server.created_at) : null,
    });
  }

  const name = segments[2];
  if (!name) {
    if (request.method !== "GET") return discordError(404, ErrorCode.GeneralError, "404: Not Found");
    const { results } = await db.prepare("SELECT * FROM bot_activities WHERE application_id = ? ORDER BY name").bind(appId).all<BotActivityRow>();
    return json((results || []).map(serialize));
  }
  if (!validActivityName(name)) return discordError(400, ErrorCode.InvalidFormBody, "Names are 1-32 of a-z 0-9 _ -");

  if (request.method === "DELETE") {
    await db.prepare("DELETE FROM bot_activities WHERE application_id = ? AND name = ?").bind(appId, name).run();
    return new Response(null, { status: 204 });
  }
  if (request.method !== "PUT") return discordError(404, ErrorCode.GeneralError, "404: Not Found");

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const clean = cleanActivity(body);
  if ("error" in clean) return discordError(400, ErrorCode.InvalidFormBody, clean.error);
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM bot_activities WHERE application_id = ? AND name != ?")
    .bind(appId, name)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_ACTIVITIES_PER_BOT) {
    return discordError(400, ErrorCode.InvalidFormBody, `A bot can offer ${MAX_ACTIVITIES_PER_BOT} activities at most`);
  }
  await db
    .prepare(
      `INSERT INTO bot_activities (application_id, name, title, description, icon, url, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (application_id, name) DO UPDATE SET
         title = excluded.title, description = excluded.description, icon = excluded.icon,
         url = excluded.url, updated_at = excluded.updated_at`,
    )
    .bind(appId, name, clean.title, clean.description, clean.icon, clean.url, new Date().toISOString())
    .run();
  return json({ name, ...clean });
}
