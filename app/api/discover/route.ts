import { queryPublicDirectory } from "@/lib/discover";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { servers: [] },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const category = url.searchParams.get("category");
  const sort = url.searchParams.get("sort");
  const appUrl = bindings().PUBLIC_URL?.trim() || url.origin;

  const servers = await queryPublicDirectory(db, { q, category, sort, appUrl });
  return Response.json(
    { servers },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
