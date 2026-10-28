import { adminGrowth } from "@/lib/admin-growth";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

/** Sign-ups, who comes back, and where new people stall (counts only). */
export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  return Response.json(await adminGrowth(gate.db));
}
