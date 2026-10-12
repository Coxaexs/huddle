import { recordAudit } from "@/lib/audit";
import { INSTANCE_AUDIT } from "@/lib/admin";
import { agentBackup } from "@/lib/ops-agent";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

/** `{ kind: "replica" | "archive" }`: starts that backup now on the home server. */
export async function POST(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown };
  if (body.kind !== "replica" && body.kind !== "archive") {
    return Response.json({ error: "Pick replica or archive." }, { status: 400 });
  }
  const { status, body: result } = await agentBackup(body.kind);
  if (status < 300) {
    await recordAudit(gate.db, {
      serverId: INSTANCE_AUDIT,
      actor: gate.user,
      action: `backup.${body.kind}`,
      targetName: body.kind === "replica" ? "Replica sync" : "Archive backup",
    });
  }
  return Response.json(result, { status });
}
