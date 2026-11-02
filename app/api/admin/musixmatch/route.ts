import { botFetch, botSession } from "@/lib/musicbot";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

/** How much of the Musixmatch lyrics plan is left; the music bot keeps the count. */
export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  try {
    return Response.json(await botFetch("/api/admin/musixmatch", await botSession()));
  } catch (cause) {
    return Response.json(
      { error: cause instanceof Error ? cause.message : "Could not reach the music bot." },
      { status: 502 },
    );
  }
}
