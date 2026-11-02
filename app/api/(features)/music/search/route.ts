import { currentUser, unauthorized } from "@/lib/auth";
import { searchSongs } from "@/lib/musicbot";

export const dynamic = "force-dynamic";

/** Several matches for the full-screen player's search; picking one runs /play. */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const query = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 200);
  if (!query) return Response.json({ results: [] });
  try {
    return Response.json({ results: await searchSongs(query) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Search failed." },
      { status: 502 },
    );
  }
}
