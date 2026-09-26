import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  AUTOMOD_ACTIONS,
  AUTOMOD_KINDS,
  toAutomodRule,
  type StoredAutomodRule,
} from "@/lib/automod";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface RuleBody {
  serverId?: string;
  kind?: string;
  action?: string;
  timeoutMinutes?: number;
  config?: unknown;
}

/**
 * Vets a rule by running it through the same parser that reads rules back.
 *
 * Anything the read path would discard (an unknown kind, a keyword rule with no
 * words, a numeric limit that cannot be parsed) is rejected here instead, so a
 * rule that saves is always a rule that can actually match. Otherwise an
 * operator would set up protection that silently did nothing.
 */
export function validateRuleInput(
  body: RuleBody,
): { ok: true; kind: string; configJson: string } | { ok: false; error: string } {
  const kind = (body.kind || "").trim().toLowerCase();
  if (!(AUTOMOD_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: `Unknown rule kind. Choose one of: ${AUTOMOD_KINDS.join(", ")}.` };
  }

  const action = (body.action || "block").trim().toLowerCase();
  if (!(AUTOMOD_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: "Action must be either block or timeout." };
  }

  const configJson = JSON.stringify(body.config ?? {});
  const candidate: StoredAutomodRule = {
    id: "validation",
    server_id: "validation",
    kind,
    enabled: 1,
    action,
    timeout_minutes: Number(body.timeoutMinutes) || 0,
    config: configJson,
  };

  if (!toAutomodRule(candidate)) {
    // The parser only rejects a kind it cannot turn into something matchable,
    // and `keyword` is the one kind whose config has no usable default.
    return {
      ok: false,
      error:
        kind === "keyword"
          ? "A keyword rule needs at least one word to look for."
          : "That rule configuration cannot be used.",
    };
  }

  return { ok: true, kind, configJson };
}

/** Lists a server's automod rules. Any member may read them; only staff change them. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const serverId = new URL(request.url).searchParams.get("serverId") || "";
  if (!serverId || !(await isServerMember(db, serverId, user.id))) {
    return Response.json({ error: "That server is gone." }, { status: 404 });
  }

  const rows = await db
    .prepare(
      `SELECT id, server_id, kind, enabled, action, timeout_minutes, config
         FROM automod_rules
        WHERE server_id = ?
        ORDER BY created_at ASC`,
    )
    .bind(serverId)
    .all<StoredAutomodRule>();

  // Rows are parsed with the validator to keep unusable ones out of the editor,
  // but *paused* rules are deliberately still returned. `toAutomodRule` returns
  // null for a disabled row (the evaluator must ignore it), so the flag is
  // forced on to parse and then reported separately — otherwise switching a rule
  // off would make it vanish from this list with no way to switch it back on.
  const rules = (rows.results || [])
    .map((row) => {
      const parsed = toAutomodRule({ ...row, enabled: 1 });
      return parsed ? { ...parsed, enabled: Boolean(row.enabled) } : null;
    })
    .filter((parsed) => parsed !== null);

  return Response.json({ rules });
}

/** Creates an automod rule. Gated by MANAGE_SERVER. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as RuleBody;
  const serverId = body.serverId || "";
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json(
      { error: "You do not have permission to do that." },
      { status: 403 },
    );
  }

  const server = await db
    .prepare("SELECT id FROM servers WHERE id = ?")
    .bind(serverId)
    .first();
  if (!server) {
    return Response.json({ error: "That server is gone." }, { status: 404 });
  }

  const validated = validateRuleInput(body);
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  const action = (body.action || "block").trim().toLowerCase();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO automod_rules
         (id, server_id, kind, enabled, action, timeout_minutes, config, created_by, created_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      serverId,
      validated.kind,
      action,
      action === "timeout" ? Number(body.timeoutMinutes) || 10 : 0,
      validated.configJson,
      user.id,
      new Date().toISOString(),
    )
    .run();

  await recordAudit(db, {
    serverId,
    actor: user,
    action: "automod.rule.create",
    targetId: id,
    targetName: `${validated.kind} rule`,
    detail: `${action}${action === "timeout" ? ` for ${Number(body.timeoutMinutes) || 10}m` : ""}`,
  });

  return Response.json({ id }, { status: 201 });
}
