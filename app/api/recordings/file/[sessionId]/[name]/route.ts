import { currentUser, unauthorized } from "@/lib/auth";
import { findRecording } from "@/lib/recording";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "thumbnail.jpg",
  "session.webm",
  "session.mp4",
  "metadata.json",
  "chapters.txt",
  "highlights.json",
]);

const TYPES: Record<string, string> = {
  "thumbnail.jpg": "image/jpeg",
  "session.webm": "video/webm",
  "session.mp4": "video/mp4",
  "metadata.json": "application/json",
  "chapters.txt": "text/plain; charset=utf-8",
  "highlights.json": "application/json",
};

/**
 * Proxies a recording's stored file from the loopback recorder service to the
 * browser. Only members of the recording's server may fetch it, and only the
 * allowlisted filenames are served.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string; name: string }> },
) {
  const db = bindings().DB;
  if (!db) return new Response("Storage is not connected.", { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { sessionId, name } = await context.params;
  if (!ALLOWED.has(name)) return new Response("Not found.", { status: 404 });

  const row = await findRecording(db, sessionId);
  if (!row) return new Response("Not found.", { status: 404 });
  if (!(await isServerMember(db, row.server_id, user.id))) {
    return new Response("Forbidden", { status: 403 });
  }

  const env = bindings();
  if (!env.RECORDER_SERVICE_URL || !env.RECORDER_SERVICE_TOKEN) {
    return new Response("Recorder service is not configured.", { status: 503 });
  }

  const upstream = await fetch(
    `${env.RECORDER_SERVICE_URL.replace(/\/+$/, "")}/v1/sessions/${encodeURIComponent(sessionId)}/file/${encodeURIComponent(name)}`,
    {
      headers: { Authorization: `Bearer ${env.RECORDER_SERVICE_TOKEN}` },
    },
  ).catch(() => null);
  if (!upstream || !upstream.ok) {
    return new Response("Recording file unavailable.", {
      status: upstream?.status || 404,
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": TYPES[name] || upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}