import { signOutEverywhere } from "@/lib/admin";
import { requireInstanceAdmin } from "../../../guard";

export const dynamic = "force-dynamic";

/** Ends every session of one account, so all its devices must sign in again. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const { id } = await context.params;
  const target = await gate.db
    .prepare("SELECT id, display_name FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: string; display_name: string }>();
  if (!target) return Response.json({ error: "No such account." }, { status: 404 });
  const ended = await signOutEverywhere(gate.db, target, gate.user);
  return Response.json({ ended });
}
