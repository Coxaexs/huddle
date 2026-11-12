import { currentUser } from "@/lib/auth";
import { bindings } from "@/lib/storage";

/** A video id as the helper names its files: no slashes, dots or anything that could leave its folder. */
const VIDEO_ID = /^[A-Za-z0-9_-]{4,64}$/;

export const dynamic = "force-dynamic";

export const HEAD = GET;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cleanId = id.replace(/\.mp4$/i, "");
  if (!VIDEO_ID.test(cleanId)) {
    return new Response("Missing video ID", { status: 400 });
  }
  // The room's video is for the people signed in here, not for the open web.
  if (!(await currentUser(request))) {
    return new Response("Sign in to watch this.", { status: 401 });
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
    // The reason names our own helper's address; keep it in the log.
    console.error("youtube stream failed", error);
    return new Response("Stream error", { status: 502 });
  }
}
