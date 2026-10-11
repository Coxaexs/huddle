import { currentUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  try {
    const body = (await request.json().catch(() => ({}))) as { url?: string; query?: string };
    const rawUrl = String(body.url || body.query || "").trim();
    if (!rawUrl) {
      return Response.json({ error: "Missing YouTube URL or search query." }, { status: 400 });
    }

    const helperBase = bindings().MUSIC_HELPER_BASE_URL?.trim() || "http://127.0.0.1:8731";
    const res = await fetch(`${helperBase}/watch/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: rawUrl }),
      signal: AbortSignal.timeout(180000), // Up to 3 minutes for large video downloads
    });

    const data = (await res.json()) as { ok?: boolean; error?: string; id?: string; title?: string; duration?: number };
    if (!res.ok || !data.ok || !data.id) {
      return Response.json(
        { error: data.error || "Failed to download video from YouTube." },
        { status: res.status >= 400 ? res.status : 500 }
      );
    }

    // Stream URL points to our streaming proxy endpoint
    const streamUrl = `/hangout/api/youtube/stream/${data.id}.mp4`;
    return Response.json({
      ok: true,
      id: data.id,
      title: data.title,
      duration: data.duration,
      streamUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
