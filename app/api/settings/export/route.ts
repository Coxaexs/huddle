import { currentSessionId, currentUser, unauthorized } from "@/lib/auth";
import { buildDataExport } from "@/lib/data-export";
import { checkRateLimit, RateLimitError } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** GET: your data as a JSON download (lib/data-export.ts). Three per hour. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const limited = await checkRateLimit({ db, action: "data-export", key: user.id, limit: 3, windowSeconds: 3600 });
  if (!limited.allowed) return new RateLimitError(limited.retryAfter).response();

  const data = await buildDataExport(db, user, await currentSessionId(request));
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="hoffle-${user.username}-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
