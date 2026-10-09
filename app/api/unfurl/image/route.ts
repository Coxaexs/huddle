import { currentUser, unauthorized } from "@/lib/auth";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import {
  PROXY_IMAGE_TYPES,
  imageProxyKey,
  safeFetch,
  verifyImageSignature,
} from "@/lib/unfurl";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Unsigned (inline chat image) fetches a member may make per minute. */
const INLINE_IMAGE_LIMIT = { action: "inline-image", limit: 240, windowSeconds: 60 };

/**
 * Image proxy, so viewers' IP addresses never reach the linked site. Serves
 * URLs the preview route signed, or — for inline image links in chat — any
 * URL a signed-in member asks for, rate limited. Either way only raster
 * images, and only from public hosts, so it can't reach the home network.
 */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const db = bindings().DB;
  if (!db) return notFound();
  await ensureSchema(db);

  const params = new URL(request.url).searchParams;
  const imageUrl = params.get("url")?.slice(0, 2000) || "";
  const signature = params.get("sig") || "";
  if (!imageUrl) return notFound();
  if (signature) {
    const key = await imageProxyKey(db).catch(() => null);
    if (!key || !(await verifyImageSignature(key, imageUrl, signature))) return notFound();
  } else {
    const limited = await limitUser(db, INLINE_IMAGE_LIMIT, user.id);
    if (limited) return limited;
  }

  const upstream = await safeFetch(imageUrl, "image/avif,image/webp,image/*;q=0.8").catch(
    () => null,
  );
  if (!upstream) return notFound();
  const type = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const length = Number(upstream.headers.get("content-length") || 0);
  if (!PROXY_IMAGE_TYPES.has(type) || length > MAX_IMAGE_BYTES) {
    void upstream.body?.cancel().catch(() => undefined);
    return notFound();
  }

  // Without a length header, buffer it so an endless stream can't run on.
  let body: ReadableStream<Uint8Array> | ArrayBuffer | null = upstream.body;
  if (!length) {
    const reader = upstream.body?.getReader();
    if (!reader) return notFound();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        void reader.cancel().catch(() => undefined);
        return notFound();
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    body = merged.buffer;
  }

  return new Response(body, {
    headers: {
      "content-type": type,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}

function notFound() {
  return new Response("Not found", { status: 404 });
}
