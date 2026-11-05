import {
  applicationById,
  cleanPermissions,
  installApplication,
  MAX_BOTS_PER_SERVER,
  type ApplicationRow,
} from "@/lib/applications";
import { recordAudit } from "@/lib/audit";
import { currentUser, unauthorized, type User } from "@/lib/auth";
import { generateBotToken } from "@/lib/bot-token";
import { refreshBotSessions } from "@/lib/discord/dispatch";
import { publishStructureChange } from "@/lib/hub-client";
import { MUSIC_BOT_KIND } from "@/lib/music-bot";
import { can, Permission, PERMISSION_INFO, type PermissionFlag } from "@/lib/permissions";
import { limitUser } from "@/lib/rate-limit";
import { DM_SERVER_ID, ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ADD_LIMIT = { action: "bot-authorize", limit: 30, windowSeconds: 3600 };

/** The bot, unless it is gone or its owner keeps it to themselves. */
async function addable(db: D1Database, user: User, id: string): Promise<ApplicationRow | Response> {
  const app = id ? await applicationById(db, id) : null;
  if (!app || app.disabled_at) return Response.json({ error: "That bot does not exist." }, { status: 404 });
  if (!app.public && app.owner_id !== user.id) {
    return Response.json({ error: "This is a private bot: only its owner can add it." }, { status: 403 });
  }
  return app;
}

/** GET ?client_id&permissions: what the add-a-bot page shows. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const params = new URL(request.url).searchParams;
  const app = await addable(db, user, params.get("client_id")?.trim().slice(0, 64) || "");
  if (app instanceof Response) return app;

  const owner = await db
    .prepare("SELECT display_name FROM users WHERE id = ?")
    .bind(app.owner_id)
    .first<{ display_name: string }>();
  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, s.icon FROM servers s
        JOIN server_members m ON m.server_id = s.id
       WHERE m.user_id = ? AND s.id != ? ORDER BY s.name`,
    )
    .bind(user.id, DM_SERVER_ID)
    .all<{ id: string; name: string; icon: string }>();
  const servers: Array<{ id: string; name: string; icon: string }> = [];
  for (const server of results || []) {
    if (await can(db, user.id, server.id, Permission.MANAGE_SERVER)) servers.push(server);
  }

  const permissions = cleanPermissions(params.get("permissions"));
  return Response.json({
    application: {
      id: app.id,
      name: app.name,
      avatar: app.avatar,
      description: app.description,
      owner: owner?.display_name || "Someone",
    },
    permissions: PERMISSION_INFO.filter((info) => permissions & info.flag).map((info) => info.label),
    servers,
  });
}

/** POST { client_id, guild_id, permissions }: adds the bot to the server. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const limited = await limitUser(db, ADD_LIMIT, user.id);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as {
    client_id?: string;
    guild_id?: string;
    permissions?: number | string;
  };
  const app = await addable(db, user, String(body.client_id || "").slice(0, 64));
  if (app instanceof Response) return app;

  const serverId = String(body.guild_id || "").slice(0, 64);
  if (!serverId || serverId === DM_SERVER_ID || !(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "You need Manage Server there to add a bot." }, { status: 403 });
  }

  // Nobody can give a bot more than they hold themselves.
  const permissions = cleanPermissions(body.permissions);
  for (const flag of Object.values(Permission) as PermissionFlag[]) {
    if (permissions & flag && !(await can(db, user.id, serverId, flag))) {
      return Response.json({ error: "You can't give a bot a permission you don't have." }, { status: 403 });
    }
  }

  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM server_bots WHERE server_id = ?")
    .bind(serverId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_BOTS_PER_SERVER) {
    return Response.json({ error: `A server can have ${MAX_BOTS_PER_SERVER} bots at most.` }, { status: 400 });
  }

  await installApplication(db, app, serverId, permissions, user.id, generateBotToken());
  await recordAudit(db, {
    serverId,
    actor: { id: user.id, display_name: user.display_name },
    action: "bot.create",
    targetId: app.id,
    targetName: app.name,
    detail: "Added with an invite link",
  });
  // Members' open tabs pick up the music bot's commands and widget.
  if (app.kind === MUSIC_BOT_KIND) await publishStructureChange(serverId);
  await refreshBotSessions(app.id);
  return Response.json({ ok: true });
}
