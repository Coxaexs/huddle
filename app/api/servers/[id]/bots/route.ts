import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { generateBotToken } from "@/lib/bot-auth";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function forbidden(): Response {
  return Response.json(
    { error: "You do not have permission to manage bots on this server." },
    { status: 403 },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database not connected" }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await context.params;
  if (!(await can(db, user.id, id, Permission.MANAGE_SERVER))) return forbidden();

  const rows = await db
    .prepare(
      `SELECT id, server_id, name, avatar, token, description, kind, enabled, created_at
       FROM server_bots
       WHERE server_id = ?
       ORDER BY created_at ASC`
    )
    .bind(id)
    .all<{
      id: string;
      server_id: string;
      name: string;
      avatar: string;
      token: string;
      description: string;
      kind: string;
      enabled: number;
      created_at: string;
    }>();

  return Response.json(rows.results || []);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database not connected" }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await context.params;
  if (!(await can(db, user.id, id, Permission.MANAGE_SERVER))) return forbidden();

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    avatar?: string;
    description?: string;
    kind?: string;
  };

  const name = body.name?.trim().slice(0, 50);
  if (!name) {
    return Response.json({ error: "Bot name is required." }, { status: 400 });
  }

  const avatar = body.avatar?.trim().slice(0, 4) || "🤖";
  const description = body.description?.trim().slice(0, 200) || "";
  const kind = body.kind?.trim() || "custom";
  const botId = crypto.randomUUID();
  const token = generateBotToken();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO server_bots (id, server_id, name, avatar, token, description, kind, enabled, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(botId, id, name, avatar, token, description, kind, user.id, now)
    .run();

  await recordAudit(db, {
    serverId: id,
    actor: { id: user.id, display_name: user.display_name },
    action: "bot.create",
    targetId: botId,
    targetName: name,
    detail: `Added ${kind} bot`,
  });

  return Response.json(
    {
      id: botId,
      serverId: id,
      name,
      avatar,
      token,
      description,
      kind,
      enabled: 1,
      createdAt: now,
    },
    { status: 201 }
  );
}
