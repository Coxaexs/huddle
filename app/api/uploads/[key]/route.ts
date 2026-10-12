import { bindings } from "@/lib/storage";
import { isInlineSafe } from "@/lib/upload-sniff";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> },
) {
  const bucket = bindings().UPLOADS;
  if (!bucket) return new Response("Not found", { status: 404 });

  const { key } = await context.params;
  const object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  // Older uploads stored the client's claimed type, which could be SVG or
  // HTML. Anything outside the known-safe list is forced to download, and the
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
  const inline = isInlineSafe(contentType);
  const headers: Record<string, string> = {
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": inline ? contentType : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/["\\\r\n]/g, "_")}"`,
    "X-Content-Type-Options": "nosniff",
  };
  // Chrome's built-in PDF viewer refuses to load under a sandbox CSP, and it
  // runs in its own isolated process anyway.
  if (contentType !== "application/pdf") {
    headers["Content-Security-Policy"] =
      "sandbox; default-src 'none'; img-src 'self'; media-src 'self'";
  }
  return new Response(object.body, { headers });
}
