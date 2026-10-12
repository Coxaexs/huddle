import { currentUser, unauthorized } from "@/lib/auth";
import { cleanShortcut, cleanUploadKey, type PersonalEmoticon } from "@/lib/msn-contacts";
import { WRITE_RATE_LIMITS, limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_EMOTICONS = 40;

async function list(db: D1Database, userId: string): Promise<PersonalEmoticon[]> {
  const rows = await db
    .prepare("SELECT shortcut, upload_key FROM user_emoticons WHERE user_id = ? ORDER BY created_at")
    .bind(userId)
    .all<{ shortcut: string; upload_key: string }>();
  return (rows.results || []).map((row) => ({ shortcut: row.shortcut, key: row.upload_key }));
}

/** Your personal emoticons. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ emoticons: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  return Response.json({ emoticons: await list(db, user.id) });
}

/** Adds (or re-points) one: { shortcut, key } where key came from /api/uploads. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const limited = await limitUser(db, WRITE_RATE_LIMITS.upload, user.id);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { shortcut?: unknown; key?: unknown };
  const shortcut = cleanShortcut(body.shortcut);
  const key = cleanUploadKey(body.key);
  if (!shortcut) {
    return Response.json({ error: "Shortcuts are 2–12 characters with no spaces, like (cat)." }, { status: 400 });
  }
  if (!key) return Response.json({ error: "Upload the picture first." }, { status: 400 });
  const existing = await list(db, user.id);
  if (existing.length >= MAX_EMOTICONS && !existing.some((e) => e.shortcut === shortcut)) {
    return Response.json({ error: `You can have up to ${MAX_EMOTICONS} emoticons.` }, { status: 400 });
  }
  await db
    .prepare(
      `INSERT INTO user_emoticons (user_id, shortcut, upload_key, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, shortcut) DO UPDATE SET upload_key = excluded.upload_key`,
    )
    .bind(user.id, shortcut, key, new Date().toISOString())
    .run();
  return Response.json({ emoticons: await list(db, user.id) }, { status: 201 });
}

/** Removes one: ?shortcut=(cat) */
export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const shortcut = cleanShortcut(new URL(request.url).searchParams.get("shortcut"));
  if (shortcut) {
    await db
      .prepare("DELETE FROM user_emoticons WHERE user_id = ? AND shortcut = ?")
      .bind(user.id, shortcut)
      .run();
  }
  return Response.json({ emoticons: await list(db, user.id) });
}
