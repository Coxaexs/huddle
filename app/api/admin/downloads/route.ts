import { timingSafeEqual } from "@/lib/auth";
import { readDownloadManifest, syncDownloads } from "@/lib/downloads";
import { bindings } from "@/lib/storage";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

/**
 * The desktop downloads this server hands out (lib/downloads.ts).
 *   GET                          the manifest
 *   POST {action:"sync", force?} copy the newest GitHub release in
 * An instance admin, or scripts/sync-downloads.sh with ADMIN_AGENT_TOKEN.
 */
async function allowed(request: Request): Promise<Response | null> {
  const token = bindings().ADMIN_AGENT_TOKEN;
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (token && bearer && timingSafeEqual(bearer, token)) return null;
  const gate = await requireInstanceAdmin(request);
  return "response" in gate ? gate.response : null;
}

export async function GET(request: Request) {
  const denied = await allowed(request);
  if (denied) return denied;
  return Response.json({ manifest: await readDownloadManifest(bindings().UPLOADS) });
}

export async function POST(request: Request) {
  const denied = await allowed(request);
  if (denied) return denied;
  const bucket = bindings().UPLOADS;
  if (!bucket) return Response.json({ error: "File storage is not connected." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; force?: unknown };
  if (body.action !== "sync") return Response.json({ error: "Unknown action." }, { status: 400 });
  try {
    return Response.json(await syncDownloads(bucket, { force: body.force === true }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
