import { purgeUserMessages } from "@/lib/admin-tools";
import { requireInstanceAdmin } from "../../../guard";

export const dynamic = "force-dynamic";

/** Deletes every message this account sent. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const { id } = await context.params;
  return Response.json({ deleted: await purgeUserMessages(gate.db, id, gate.user) });
}
