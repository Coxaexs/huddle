import { adminDeleteUser } from "@/lib/admin-tools";
import { requireInstanceAdmin } from "../../guard";

export const dynamic = "force-dynamic";

/** `{ confirmUsername, deleteMessages }`: removes the account for good. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { confirmUsername?: unknown; deleteMessages?: unknown };
  const result = await adminDeleteUser(
    gate.db,
    id,
    {
      confirmUsername: typeof body.confirmUsername === "string" ? body.confirmUsername : "",
      deleteMessages: body.deleteMessages === true,
    },
    gate.user,
  );
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
