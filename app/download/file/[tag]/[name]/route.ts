import { DOWNLOAD_PREFIX } from "@/lib/downloads";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ tag: string; name: string }> };

/**
 * One installer, as copied from its GitHub release (lib/downloads.ts). The
 * path has the release tag in it, so it never changes and Cloudflare may keep
 * it; ranges let a broken download resume.
 */
async function serve(request: Request, { params }: Params, head: boolean): Promise<Response> {
  const { tag, name } = await params;
  if (!/^desktop-v[\w.-]+$/.test(tag) || !/^[\w.-]+$/.test(name)) return new Response("Not found", { status: 404 });
  const bucket = bindings().UPLOADS;
  if (!bucket) return new Response("Not found", { status: 404 });
  const key = `${DOWNLOAD_PREFIX}${tag}/${name}`;
  const object = head ? await bucket.head(key) : await bucket.get(key, { range: request.headers });
  if (!object) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    ETag: object.httpEtag,
  };
  const range = "range" in object ? (object.range as { offset?: number; length?: number; suffix?: number } | undefined) : undefined;
  const body = head ? null : (object as R2ObjectBody).body;
  if (range && request.headers.has("range")) {
    const offset = range.suffix !== undefined ? object.size - range.suffix : range.offset ?? 0;
    const length = range.suffix !== undefined ? range.suffix : range.length ?? object.size - offset;
    headers["Content-Range"] = `bytes ${offset}-${offset + length - 1}/${object.size}`;
    headers["Content-Length"] = String(length);
    return new Response(body, { status: 206, headers });
  }
  headers["Content-Length"] = String(object.size);
  return new Response(body, { headers });
}

export function GET(request: Request, context: Params) {
  return serve(request, context, false);
}

export function HEAD(request: Request, context: Params) {
  return serve(request, context, true);
}
