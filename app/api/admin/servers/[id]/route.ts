import { adminDeleteServer } from "@/lib/admin-tools";
import { requireInstanceAdmin } from "../../guard";

export const dynamic = "force-dynamic";

/** `{ confirmName }` must be the server's exact name. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { confirmName?: unknown };
  const result = await adminDeleteServer(gate.db, id, typeof body.confirmName === "string" ? body.confirmName : "", gate.user);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ deleted: result.name });
}
