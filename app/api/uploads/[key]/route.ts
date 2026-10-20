import { isBigUploadKey } from "@/lib/big-upload-key";
import { servableBigUpload } from "@/lib/big-uploads";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { isInlineSafe } from "@/lib/upload-sniff";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string }> },
) {
  const { key } = await context.params;
  if (isBigUploadKey(key)) return serveBigUpload(request, key);

  const bucket = bindings().UPLOADS;
  if (!bucket) return new Response("Not found", { status: 404 });

  const object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  // Older uploads stored the client's claimed type, which could be HTML.
  // Anything outside the known-safe list is forced to download, and the
  // sandbox CSP keeps even an opened file from running script on our origin.
  const stored = object.httpMetadata?.contentType || "application/octet-stream";
  let contentType = stored;
  const filename = key.split("--").slice(1).join("--") || "download";
  if (contentType === "application/octet-stream") {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (ext === "mp4") contentType = "video/mp4";
    else if (ext === "webm") contentType = "video/webm";
    else if (ext === "mov") contentType = "video/quicktime";
    else if (ext === "ogv") contentType = "video/ogg";
    else if (ext === "mp3") contentType = "audio/mpeg";
    else if (ext === "wav") contentType = "audio/wav";
    else if (ext === "ogg") contentType = "audio/ogg";
    else if (ext === "m4a") contentType = "audio/mp4";
  }
  const headers = servingHeaders(contentType, filename);
  headers["Cache-Control"] = "public, max-age=31536000, immutable";
  return new Response(object.body, { headers });
}

function servingHeaders(contentType: string, filename: string): Record<string, string> {
  const inline = isInlineSafe(contentType);
  const headers: Record<string, string> = {
    "Content-Type": inline ? contentType : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/["\\\r\n]/g, "_")}"`,
    "X-Content-Type-Options": "nosniff",
  };
  // Chrome's built-in PDF viewer refuses to load under a sandbox CSP, and it
  // runs in its own isolated process anyway.
  if (contentType === "image/svg+xml") {
    // An SVG is a document. Opened on its own, this sandbox gives it an opaque
    // origin and no script at all (chat shows it through <img>, which never
    // runs script either). Inline styles stay, since most exported SVGs use
    // them; nothing may be fetched from anywhere.
    headers["Content-Security-Policy"] =
      "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
  } else if (contentType !== "application/pdf") {
    headers["Content-Security-Policy"] =
      "sandbox; default-src 'none'; img-src 'self'; media-src 'self'";
  }
  return headers;
}

/**
 * A big temporary upload (lib/big-uploads.ts). Gone after its 12 hours even if
 * the sweep has not run yet, cached privately only until then (so Cloudflare
 * never keeps a copy), and served in ranges so a 2 GB download can resume and
 * a video can seek.
 */
async function serveBigUpload(request: Request, key: string): Promise<Response> {
  const db = bindings().DB;
  const bucket = bindings().BIG_UPLOADS;
  if (!db || !bucket) return new Response("Not found", { status: 404 });
  await ensureSchema(db);
  const row = await servableBigUpload(db, key);
  if (!row) return new Response("This file was deleted after 12 hours.", { status: 410 });
  const object = await bucket.get(key, { range: request.headers });
  if (!object) return new Response("Not found", { status: 404 });

  const headers = servingHeaders(row.content_type || "application/octet-stream", row.name);
  const left = Math.max(0, Math.floor((row.expires_at - Date.now()) / 1000));
  headers["Cache-Control"] = `private, max-age=${left}`;
  headers["Accept-Ranges"] = "bytes";
  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (range && request.headers.has("range")) {
    const offset = range.suffix !== undefined ? object.size - range.suffix : range.offset ?? 0;
    const length = range.suffix !== undefined ? range.suffix : range.length ?? object.size - offset;
    headers["Content-Range"] = `bytes ${offset}-${offset + length - 1}/${object.size}`;
    headers["Content-Length"] = String(length);
    return new Response(object.body, { status: 206, headers });
  }
  headers["Content-Length"] = String(object.size);
  return new Response(object.body, { headers });
}
