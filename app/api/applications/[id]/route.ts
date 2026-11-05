import {
  applicationById,
  cleanApplicationName,
  PRIVILEGED_INTENTS,
  publicApplication,
  type ApplicationRow,
} from "@/lib/applications";
import { currentUser, isInstanceAdmin, unauthorized, type User } from "@/lib/auth";
import { refreshBotSessions } from "@/lib/discord/dispatch";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The bot, when this person may manage it. 404 either way, so ids stay private. */
async function managed(db: D1Database, user: User, id: string): Promise<ApplicationRow | null> {
  const app = await applicationById(db, id);
  return app && (app.owner_id === user.id || isInstanceAdmin(user)) ? app : null;
}

const notFound = () => Response.json({ error: "Bot not found." }, { status: 404 });

export async function GET(request: Request, context: Context) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const app = await managed(db, user, (await context.params).id);
  return app ? Response.json({ application: await publicApplication(db, app) }) : notFound();
}

export async function PATCH(request: Request, context: Context) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const app = await managed(db, user, (await context.params).id);
  if (!app) return notFound();

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    avatar?: string;
    public?: boolean;
    intents?: number;
    player?: boolean;
  };
  let name = app.name;
  if (body.name !== undefined) {
    const cleaned = cleanApplicationName(body.name, isInstanceAdmin(user));
    if (typeof cleaned !== "string") return Response.json(cleaned, { status: 400 });
    name = cleaned;
  }
  const description = body.description !== undefined ? String(body.description).trim().slice(0, 400) : app.description;
  const avatar = body.avatar !== undefined ? String(body.avatar).trim().slice(0, 8) || "🤖" : app.avatar;
  const isPublic = body.public !== undefined ? (body.public ? 1 : 0) : app.public;
  const intents = body.intents !== undefined ? Number(body.intents) & PRIVILEGED_INTENTS : app.intents;
  const player = body.player !== undefined ? (body.player ? 1 : 0) : app.player;

  await db.batch([
    db
      .prepare("UPDATE applications SET name = ?, description = ?, avatar = ?, public = ?, intents = ?, player = ? WHERE id = ?")
      .bind(name, description, avatar, isPublic, intents, player, app.id),
    db
      .prepare("UPDATE server_bots SET name = ?, avatar = ?, description = ? WHERE application_id = ?")
      .bind(name, avatar, description, app.id),
  ]);
  if (intents !== app.intents) await refreshBotSessions(app.id);
  const updated = await applicationById(db, app.id);
  return Response.json({ application: await publicApplication(db, updated!) });
}

/** Deletes the bot, which also takes it out of every server. */
export async function DELETE(request: Request, context: Context) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const app = await managed(db, user, (await context.params).id);
  if (!app) return notFound();
  if (app.kind !== "custom") {
    return Response.json({ error: "This bot can't be deleted, because servers rely on it." }, { status: 400 });
  }
  await db.batch([
    db.prepare("DELETE FROM server_bots WHERE application_id = ?").bind(app.id),
    db.prepare("DELETE FROM discord_commands WHERE bot_id = ?").bind(app.id),
    db.prepare("DELETE FROM bot_widgets WHERE bot_id = ?").bind(app.id),
    db.prepare("DELETE FROM bot_activities WHERE application_id = ?").bind(app.id),
    db.prepare("DELETE FROM applications WHERE id = ?").bind(app.id),
  ]);
  await refreshBotSessions(app.id);
  return Response.json({ ok: true });
}
