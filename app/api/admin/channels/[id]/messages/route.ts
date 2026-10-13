import { peekMessages } from "@/lib/admin-tools";
import { requireInstanceAdmin } from "../../../guard";

export const dynamic = "force-dynamic";

/** A channel's messages, read-only and unrecorded: `?before=<iso>` pages back. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const { id } = await context.params;
  const before = new URL(request.url).searchParams.get("before");
  return Response.json({ messages: await peekMessages(gate.db, id, before) });
}
