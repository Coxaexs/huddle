import { setSuspended } from "@/lib/admin-tools";
import { requireInstanceAdmin } from "../../../guard";

export const dynamic = "force-dynamic";

/** `{ suspended: boolean }`: block or restore sign-in. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { suspended?: unknown };
  const result = await setSuspended(gate.db, id, body.suspended !== false, gate.user);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
