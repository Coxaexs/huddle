import { currentUser, unauthorized } from "@/lib/auth";
import { publishMessageEvent } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Broadcast a soundboard clip to a voice room. Everyone in the channel plays it
 * locally when the event arrives (no media renegotiation).
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    soundId?: string;
  };
  const channelId = body.channelId?.slice(0, 64);
  if (!channelId || !body.soundId) {
    return Response.json({ error: "Missing fields." }, { status: 400 });
  }

  // Resolve the clip server-side so a client can't broadcast arbitrary URLs.
  const sound = await db
    .prepare("SELECT key, name FROM sounds WHERE id = ?")
    .bind(body.soundId)
    .first<{ key: string; name: string }>();
  if (!sound) {
    return Response.json({ error: "That sound is gone." }, { status: 404 });
  }

  await publishMessageEvent(channelId, {
    t: "soundboard",
    url: `/hangout/api/uploads/${encodeURIComponent(sound.key)}`,
    name: sound.name,
    by: user.display_name,
  });
  return Response.json({ ok: true });
}
