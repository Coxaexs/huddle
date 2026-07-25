import { currentUser, unauthorized } from "@/lib/auth";
import { forceMute } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface PrefRow {
  target_id: string;
  volume: number;
  muted: number;
}

/**
 * How you hear other people. "For me" preferences are stored per account so
 * they follow you between devices; server mutes apply to everyone and are
 * enforced on the muted person's own microphone.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ prefs: {}, serverMuted: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const [mine, muted] = await Promise.all([
    db
      .prepare("SELECT target_id, volume, muted FROM voice_prefs WHERE user_id = ?")
      .bind(user.id)
      .all(),
    db.prepare("SELECT target_id FROM server_mutes").all(),
  ]);

  const prefs: Record<string, { volume: number; muted: boolean }> = {};
  for (const row of (mine.results || []) as unknown as PrefRow[]) {
    prefs[row.target_id] = {
      volume: Math.max(0, Math.min(100, row.volume)),
      muted: Boolean(row.muted),
    };
  }

  return Response.json({
    prefs,
    serverMuted: ((muted.results || []) as Array<{ target_id: string }>).map(
      (row) => row.target_id,
    ),
  });
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    targetId?: string;
    volume?: number;
    muted?: boolean;
    /** Mute them for the whole Huddle, not just for you. */
    serverMuted?: boolean;
  };
  const targetId = body.targetId || "";
  if (!targetId) {
    return Response.json({ error: "Who?" }, { status: 400 });
  }

  if (typeof body.serverMuted === "boolean") {
    if (body.serverMuted) {
      await db
        .prepare(
          "INSERT OR REPLACE INTO server_mutes (target_id, muted_by, created_at) VALUES (?, ?, ?)",
        )
        .bind(targetId, user.id, new Date().toISOString())
        .run();
    } else {
      await db
        .prepare("DELETE FROM server_mutes WHERE target_id = ?")
        .bind(targetId)
        .run();
    }
    // Tell the hub so the muted person's microphone actually stops.
    await forceMute(targetId, body.serverMuted);
  }

  if (typeof body.volume === "number" || typeof body.muted === "boolean") {
    const existing = await db
      .prepare(
        "SELECT volume, muted FROM voice_prefs WHERE user_id = ? AND target_id = ?",
      )
      .bind(user.id, targetId)
      .first<{ volume: number; muted: number }>();

    const volume =
      typeof body.volume === "number"
        ? Math.max(0, Math.min(100, Math.round(body.volume)))
        : (existing?.volume ?? 100);
    const muted =
      typeof body.muted === "boolean"
        ? body.muted
          ? 1
          : 0
        : (existing?.muted ?? 0);

    await db
      .prepare(
        "INSERT OR REPLACE INTO voice_prefs (user_id, target_id, volume, muted) VALUES (?, ?, ?, ?)",
      )
      .bind(user.id, targetId, volume, muted)
      .run();
  }

  return Response.json({ ok: true });
}
