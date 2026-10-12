import { adminDeleteMessage } from "@/lib/admin-tools";
import { requireInstanceAdmin } from "../../guard";

export const dynamic = "force-dynamic";

/** Deletes one message for everyone. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const { id } = await context.params;
  const ok = await adminDeleteMessage(gate.db, id, gate.user);
  if (!ok) return Response.json({ error: "That message is already gone." }, { status: 404 });
  return Response.json({ ok: true });
}
