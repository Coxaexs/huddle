import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";
import {
  MAX_RULES_LENGTH,
  parseFields,
  sanitizeFields,
  validateAnswers,
  type WelcomeConfig,
} from "@/lib/welcome";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

interface WelcomeRow {
  enabled: number;
  enabled_at: string | null;
  rules: string;
  fields: string;
}

async function setup(request: Request, context: Context) {
  const db = bindings().DB;
  if (!db) return { error: Response.json({ error: "Message storage is not connected." }, { status: 503 }) };
  const user = await currentUser(request);
  if (!user) return { error: unauthorized() };
  await ensureSchema(db);
  const { id } = await context.params;
  const server = await db
    .prepare("SELECT id, created_by FROM servers WHERE id = ?")
    .bind(id)
    .first<{ id: string; created_by: string | null }>();
  if (!server) return { error: Response.json({ error: "That server is gone." }, { status: 404 }) };
  return { db, user, server };
}

function loadRow(db: D1Database, serverId: string) {
  return db
    .prepare("SELECT enabled, enabled_at, rules, fields FROM server_welcome WHERE server_id = ?")
    .bind(serverId)
    .first<WelcomeRow>();
}

function toConfig(row: WelcomeRow | null): WelcomeConfig {
  return {
    enabled: Boolean(row?.enabled),
    rules: row?.rules || "",
    fields: parseFields(row?.fields),
  };
}

/** The welcome screen, whether you still need to see it, and (for managers) the answers. */
export async function GET(request: Request, context: Context) {
  const ctx = await setup(request, context);
  if ("error" in ctx) return ctx.error;
  const { db, user, server } = ctx;
  const manager =
    server.created_by === user.id || (await can(db, user.id, server.id, Permission.MANAGE_SERVER));
  if (!manager && !(await isServerMember(db, server.id, user.id))) {
    return Response.json({ error: "You are not in this server." }, { status: 403 });
  }

  const row = await loadRow(db, server.id);
  const welcome = toConfig(row);

  let pending = false;
  if (welcome.enabled && !manager) {
    // Only people who joined after it was switched on are asked.
    const status = await db
      .prepare(
        `SELECT m.joined_at AS joined_at, a.accepted_at AS accepted_at
           FROM server_members m
           LEFT JOIN server_welcome_answers a ON a.server_id = m.server_id AND a.user_id = m.user_id
          WHERE m.server_id = ? AND m.user_id = ?`,
      )
      .bind(server.id, user.id)
      .first<{ joined_at: string; accepted_at: string | null }>();
    pending = Boolean(
      status && !status.accepted_at && (!row?.enabled_at || status.joined_at >= row.enabled_at),
    );
  }

  let responses: unknown[] | undefined;
  if (manager) {
    const result = await db
      .prepare(
        `SELECT a.user_id AS userId, u.display_name AS displayName, u.username AS username,
                a.answers AS answers, a.accepted_at AS acceptedAt
           FROM server_welcome_answers a
           LEFT JOIN users u ON u.id = a.user_id
          WHERE a.server_id = ?
          ORDER BY a.accepted_at DESC
          LIMIT 200`,
      )
      .bind(server.id)
      .all();
    responses = ((result.results || []) as Array<Record<string, unknown>>).map((r) => {
      let answers: Record<string, string> = {};
      try {
        answers = JSON.parse(String(r.answers || "{}"));
      } catch {
        // Keep an empty set for a row that will not parse.
      }
      return { ...r, answers };
    });
  }

  return Response.json({ welcome, pending, responses });
}

/** Owner/managers: save the welcome screen. */
export async function PUT(request: Request, context: Context) {
  const ctx = await setup(request, context);
  if ("error" in ctx) return ctx.error;
  const { db, user, server } = ctx;
  if (server.created_by !== user.id && !(await can(db, user.id, server.id, Permission.MANAGE_SERVER))) {
    return Response.json(
      { error: "You do not have permission to manage this server." },
      { status: 403 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as Partial<WelcomeConfig>;
  const enabled = Boolean(body.enabled);
  const rules = String(body.rules ?? "").slice(0, MAX_RULES_LENGTH);
  const fields = sanitizeFields(body.fields);
  const now = new Date().toISOString();

  // enabled_at moves only when it is switched on, so editing the rules later
  // does not re-ask people who already joined.
  await db
    .prepare(
      `INSERT INTO server_welcome (server_id, enabled, enabled_at, rules, fields, updated_at)
       VALUES (?1, ?2, CASE WHEN ?2 = 1 THEN ?5 END, ?3, ?4, ?5)
       ON CONFLICT(server_id) DO UPDATE SET
         enabled = excluded.enabled,
         enabled_at = CASE
           WHEN excluded.enabled = 1 AND server_welcome.enabled = 0 THEN excluded.updated_at
           WHEN excluded.enabled = 1 THEN server_welcome.enabled_at
           ELSE NULL END,
         rules = excluded.rules,
         fields = excluded.fields,
         updated_at = excluded.updated_at`,
    )
    .bind(server.id, enabled ? 1 : 0, rules, JSON.stringify(fields), now)
    .run();

  await recordAudit(db, {
    serverId: server.id,
    actor: user,
    action: "server.update",
    targetName: "Welcome screen",
  });
  return Response.json({ welcome: { enabled, rules, fields } satisfies WelcomeConfig });
}

/** A newcomer accepts the rules and sends their answers. */
export async function POST(request: Request, context: Context) {
  const ctx = await setup(request, context);
  if ("error" in ctx) return ctx.error;
  const { db, user, server } = ctx;
  if (!(await isServerMember(db, server.id, user.id))) {
    return Response.json({ error: "You are not in this server." }, { status: 403 });
  }
  const row = await loadRow(db, server.id);
  const body = (await request.json().catch(() => ({}))) as { answers?: unknown };
  const checked = validateAnswers(toConfig(row).fields, body.answers);
  if ("error" in checked) return Response.json({ error: checked.error }, { status: 400 });

  await db
    .prepare(
      `INSERT INTO server_welcome_answers (server_id, user_id, answers, accepted_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(server_id, user_id) DO UPDATE SET
         answers = excluded.answers, accepted_at = excluded.accepted_at`,
    )
    .bind(server.id, user.id, JSON.stringify(checked.answers), new Date().toISOString())
    .run();
  return Response.json({ ok: true });
}
