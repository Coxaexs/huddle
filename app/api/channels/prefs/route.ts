import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const LEVELS = new Set(["all", "mentions", "nothing"]);

/** Your notification level for every channel you have changed from the default. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ prefs: {} });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const rows = await db
    .prepare("SELECT channel_id, level FROM channel_prefs WHERE user_id = ?")
    .bind(user.id)
    .all();

  const prefs: Record<string, string> = {};
  for (const row of (rows.results || []) as Array<{
    channel_id: string;
    level: string;
  }>) {
    prefs[row.channel_id] = row.level;
  }
  return Response.json({ prefs });
}

/** Set (or reset to default) the notification level for one channel. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    level?: string;
  };
  const channelId = body.channelId?.slice(0, 64);
  if (!channelId || !LEVELS.has(body.level || "")) {
    return Response.json({ error: "Pick a channel and level." }, { status: 400 });
  }

  if (body.level === "all") {
    // "all" is the default, so a row is only noise.
    await db
      .prepare("DELETE FROM channel_prefs WHERE user_id = ? AND channel_id = ?")
      .bind(user.id, channelId)
      .run();
  } else {
    await db
      .prepare(
        "INSERT OR REPLACE INTO channel_prefs (user_id, channel_id, level) VALUES (?, ?, ?)",
      )
      .bind(user.id, channelId, body.level)
      .run();
  }

  return Response.json({ ok: true, level: body.level });
}
