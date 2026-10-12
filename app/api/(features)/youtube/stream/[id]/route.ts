import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const HEAD = GET;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cleanId = id.replace(/\.mp4$/i, "");
  if (!cleanId) {
    return new Response("Missing video ID", { status: 400 });
  }

  const helperBase = bindings().MUSIC_HELPER_BASE_URL?.trim() || "http://127.0.0.1:8731";
  const upstreamUrl = `${helperBase}/watch/stream/${cleanId}.mp4`;

  const headers: Record<string, string> = {};
  const range = request.headers.get("range");
  if (range) {
    headers["range"] = range;
  }

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: "GET",
      headers,
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return new Response("Video stream not found or still downloading", {
        status: upstreamRes.status,
      });
    }

    const resHeaders = new Headers();
    const copyHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
      "cache-control",
    ];

    for (const h of copyHeaders) {
      const val = upstreamRes.headers.get(h);
      if (val) resHeaders.set(h, val);
    }

    // Default headers if not provided by upstream
    if (!resHeaders.has("content-type")) {
      resHeaders.set("content-type", "video/mp4");
    }
    if (!resHeaders.has("accept-ranges")) {
      resHeaders.set("accept-ranges", "bytes");
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: resHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stream error";
    return new Response(message, { status: 502 });
  }
}
