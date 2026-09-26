import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { toAutomodRule, type StoredAutomodRule } from "@/lib/automod";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { validateRuleInput } from "../route";

export const dynamic = "force-dynamic";

/** Loads a rule and confirms the caller may administer the server it belongs to. */
async function authorize(
  db: D1Database,
  ruleId: string,
  userId: string,
): Promise<
  | { ok: true; row: StoredAutomodRule }
  | { ok: false; response: Response }
> {
  const row = await db
    .prepare(
      `SELECT id, server_id, kind, enabled, action, timeout_minutes, config
         FROM automod_rules WHERE id = ?`,
    )
    .bind(ruleId)
    .first<StoredAutomodRule>();

  if (!row) {
    return { ok: false, response: Response.json({ error: "No such rule." }, { status: 404 }) };
  }

  // The permission check is against the rule's own server, never a server id
  // supplied by the caller — otherwise anyone could edit another server's rules.
  if (!(await can(db, userId, row.server_id, Permission.MANAGE_SERVER))) {
    return {
      ok: false,
      response: Response.json(
        { error: "You do not have permission to do that." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, row };
}

/** Updates a rule, or flips it on and off with `enabled`. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await params;
  const authorized = await authorize(db, id, user.id);
  if (!authorized.ok) return authorized.response;
  const row = authorized.row;

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    action?: string;
    timeoutMinutes?: number;
    config?: unknown;
    enabled?: boolean;
  };

  // Toggling is its own small operation, so a caller can pause a rule without
  // having to restate its whole configuration.
  if (Object.keys(body).length === 1 && typeof body.enabled === "boolean") {
    await db
      .prepare("UPDATE automod_rules SET enabled = ? WHERE id = ?")
      .bind(body.enabled ? 1 : 0, id)
      .run();
    await recordAudit(db, {
      serverId: row.server_id,
      actor: user,
      action: body.enabled ? "automod.rule.enable" : "automod.rule.disable",
      targetId: id,
      targetName: `${row.kind} rule`,
    });
    return Response.json({ id, enabled: body.enabled });
  }

  // An update replaces the rule, so anything the caller omits falls back to the
  // stored value rather than resetting to a default.
  const merged = {
    kind: body.kind ?? row.kind,
    action: body.action ?? row.action,
    timeoutMinutes: body.timeoutMinutes ?? row.timeout_minutes,
    config: body.config ?? JSON.parse(row.config || "{}"),
  };
  const validated = validateRuleInput(merged);
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  const action = (merged.action || "block").trim().toLowerCase();
  await db
    .prepare(
      `UPDATE automod_rules
          SET kind = ?, action = ?, timeout_minutes = ?, config = ?
        WHERE id = ?`,
    )
    .bind(
      validated.kind,
      action,
      action === "timeout" ? Number(merged.timeoutMinutes) || 10 : 0,
      validated.configJson,
      id,
    )
    .run();

  await recordAudit(db, {
    serverId: row.server_id,
    actor: user,
    action: "automod.rule.update",
    targetId: id,
    targetName: `${validated.kind} rule`,
  });

  return Response.json({ id });
}

/** Deletes a rule. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await params;
  const authorized = await authorize(db, id, user.id);
  if (!authorized.ok) return authorized.response;

  await db.prepare("DELETE FROM automod_rules WHERE id = ?").bind(id).run();
  await recordAudit(db, {
    serverId: authorized.row.server_id,
    actor: user,
    action: "automod.rule.delete",
    targetId: id,
    targetName: `${authorized.row.kind} rule`,
  });

  return Response.json({ ok: true });
}
