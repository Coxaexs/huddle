import { recordAudit } from "@/lib/audit";
import { INSTANCE_AUDIT } from "@/lib/admin";
import { agentJob } from "@/lib/ops-agent";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

const UNIT_RE = /^[\w@.:-]{1,160}\.(service|timer|socket|mount|path)$/;

/**
 * `{ action: "run" | "clear", host, scope, unit }`: runs an allowlisted job again,
 * or clears a failed unit, through the ops agent (which keeps the allowlist).
 */
export async function POST(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { action, host, scope, unit } = body;
  if (
    (action !== "run" && action !== "clear") ||
    (host !== "home" && host !== "oracle") ||
    (scope !== "system" && scope !== "user") ||
    typeof unit !== "string" ||
    !UNIT_RE.test(unit)
  ) {
    return Response.json({ error: "Bad job." }, { status: 400 });
  }
  const { status, body: result } = await agentJob(action, { host, scope, unit });
  if (status < 300) {
    await recordAudit(gate.db, {
      serverId: INSTANCE_AUDIT,
      actor: gate.user,
      action: `job.${action}`,
      targetName: `${unit} on ${host}`,
    });
  }
  return Response.json(result, { status });
}
