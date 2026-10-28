import { bindings } from "@/lib/storage";
import { PROXY_IMAGE_TYPES } from "@/lib/unfurl";
import { sniffUpload } from "@/lib/upload-sniff";

export const dynamic = "force-dynamic";

/**
 * Album art / video thumbnails for the Living Room TV. Drawing a remote image
 * into WebGL needs CORS, which i.ytimg.com and friends don't send, so covers
 * go through here: fetched once, kept in R2, then served from there with CORS.
 * Only known image CDNs, so this is not an open proxy, and only raster
 * images (judged by their bytes, not the CDN's header), so nothing served from
 * our origin here can be a script-capable document like SVG.
 */
const ALLOWED_HOSTS = [
  /^i\d?\.ytimg\.com$/,
  /^img\.youtube\.com$/,
  /^i\.scdn\.co$/,
  /^[a-z0-9-]+\.scdn\.co$/,
  /^lastfm\.freetls\.fastly\.net$/,
  /^[a-z0-9-]+\.mzstatic\.com$/,
  /^i\d?\.sndcdn\.com$/,
];
const MAX_BYTES = 5 * 1024 * 1024;

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=2592000, immutable",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

async function cacheKey(url: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `covers/${hex}`;
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url") || "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Bad cover URL.", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.some((host) => host.test(target.hostname))) {
    return new Response("That image host is not allowed.", { status: 400 });
  }

  const bucket = bindings().UPLOADS;
  const key = await cacheKey(target.href);
  if (bucket) {
    const cached = await bucket.get(key);
    const cachedType = cached?.httpMetadata?.contentType || "";
    if (cached && PROXY_IMAGE_TYPES.has(cachedType)) {
      return new Response(cached.body, { headers: { ...HEADERS, "Content-Type": cachedType } });
    }
    // Covers cached before the byte check could carry any type; fetch afresh.
    void cached?.body.cancel().catch(() => undefined);
  }

  const upstream = await fetch(target.href, { redirect: "manual" }).catch(() => null);
  if (!upstream?.ok) return new Response("Cover not found.", { status: 404 });
  const data = await upstream.arrayBuffer();
  if (data.byteLength > MAX_BYTES) return new Response("Cover too large.", { status: 413 });
  const type = sniffUpload(data)?.contentType || "";
  if (!PROXY_IMAGE_TYPES.has(type)) return new Response("Cover not found.", { status: 404 });
  if (bucket) {
    await bucket.put(key, data, { httpMetadata: { contentType: type } }).catch(() => undefined);
  }
  return new Response(data, { headers: { ...HEADERS, "Content-Type": type } });
}
