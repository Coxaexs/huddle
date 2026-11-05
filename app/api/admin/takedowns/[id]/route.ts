import { ensureSchema } from "@/lib/schema";
import { eraseTakedown, restoreTakedown } from "@/lib/takedowns";
import { requireInstanceAdmin } from "../../guard";

export const dynamic = "force-dynamic";

/** PATCH { action: "restore" | "erase" }. Only ever a person, never the mail worker. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  await ensureSchema(gate.db);
  const { id } = await context.params;
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  if (action !== "restore" && action !== "erase") {
    return Response.json({ error: "Restore or erase?" }, { status: 400 });
  }
  const done = action === "restore" ? await restoreTakedown(gate.db, id, gate.user) : await eraseTakedown(gate.db, id, gate.user);
  if (!done) return Response.json({ error: "That takedown is already closed." }, { status: 404 });
  return Response.json({ ok: true });
}
