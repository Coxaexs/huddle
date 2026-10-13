import { agentStatus } from "@/lib/ops-agent";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

/** Host status from the ops agent: who is serving, voice, services, backups. */
export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const { status, body } = await agentStatus();
  return Response.json(body, { status });
}
