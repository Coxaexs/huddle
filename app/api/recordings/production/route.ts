import { publicBattlemap, type BattlemapRow } from "@/lib/battlemap";
import { findRecording } from "@/lib/recording";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const token = bindings().RECORDER_SERVICE_TOKEN;
  return Boolean(
    token && request.headers.get("authorization") === `Bearer ${token}`,
  );
}

/**
 * Read-only production state bound to one known recording session. This avoids
 * granting the recorder token arbitrary channel access.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized recorder." }, { status: 401 });
  }
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  await ensureSchema(db);
  const sessionId =
    new URL(request.url).searchParams.get("sessionId")?.slice(0, 64) || "";
  const recording = await findRecording(db, sessionId);
  if (!recording) {
    return Response.json({ error: "Recording not found." }, { status: 404 });
  }
  const map = await db
    .prepare(
      `SELECT id, channel_id, name, image_key, grid, tokens, strokes, active
         FROM battlemaps
        WHERE channel_id = ? AND active = 1
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(recording.channel_id)
    .first<BattlemapRow>();
  return Response.json({
    channelId: recording.channel_id,
    battlemap: map ? publicBattlemap(map) : null,
  });
}
