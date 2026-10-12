import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const LEVELS = new Set(["all", "mentions", "nothing"]);

/** Your notification level and mute status for every channel you have changed from the default. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ prefs: {}, mutedUntil: {} });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const rows = await db
    .prepare("SELECT channel_id, level, muted_until FROM channel_prefs WHERE user_id = ?")
    .bind(user.id)
    .all();

  const nowIso = new Date().toISOString();
  const prefs: Record<string, string> = {};
  const mutedUntil: Record<string, string> = {};

  for (const row of (rows.results || []) as Array<{
    channel_id: string;
    level: string;
    muted_until?: string | null;
  }>) {
    if (row.muted_until) {
      if (row.muted_until > nowIso) {
        mutedUntil[row.channel_id] = row.muted_until;
        prefs[row.channel_id] = "nothing";
      } else {
        // Expired temporary mute: reset level if it was temporary nothing
        if (row.level === "all") continue;
        prefs[row.channel_id] = row.level;
      }
    } else {
      prefs[row.channel_id] = row.level;
    }
  }
  return Response.json({ prefs, mutedUntil });
}

/** Set (or reset to default) the notification level for one channel. Supports temporary mutes via durationMs or mutedUntil. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    level?: string;
    mutedUntil?: string | null;
    durationMs?: number | null;
  };
  const channelId = body.channelId?.slice(0, 64);
  if (!channelId || !LEVELS.has(body.level || "")) {
    return Response.json({ error: "Pick a channel and level." }, { status: 400 });
  }

  let mutedUntil: string | null = null;
  if (body.mutedUntil && typeof body.mutedUntil === "string") {
    mutedUntil = body.mutedUntil;
  } else if (body.durationMs && typeof body.durationMs === "number" && body.durationMs > 0) {
    mutedUntil = new Date(Date.now() + body.durationMs).toISOString();
  }

  if (body.level === "all" && !mutedUntil) {
    // "all" is the default, so a row is only noise.
    await db
      .prepare("DELETE FROM channel_prefs WHERE user_id = ? AND channel_id = ?")
      .bind(user.id, channelId)
      .run();
  } else {
    await db
      .prepare(
        "INSERT OR REPLACE INTO channel_prefs (user_id, channel_id, level, muted_until) VALUES (?, ?, ?, ?)",
      )
      .bind(user.id, channelId, body.level, mutedUntil)
      .run();
  }

  return Response.json({ ok: true, level: body.level, mutedUntil });
}
