import { peekChannels } from "@/lib/admin-tools";
import { requireInstanceAdmin } from "../../../guard";

export const dynamic = "force-dynamic";

/** A server's channels, without joining it. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const { id } = await context.params;
  return Response.json({ channels: await peekChannels(gate.db, id) });
}
