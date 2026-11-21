import { currentUser, unauthorized } from "@/lib/auth";
import { isDefaultNotifyPrefs, normalizeNotifyPrefs } from "@/lib/notify-prefs";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Saves quiet hours and keyword alerts (app/lib/notify-prefs-store.ts). */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { notify?: unknown };
  const notify = normalizeNotifyPrefs(body.notify);
  await db
    .prepare("UPDATE users SET notify_prefs = ? WHERE id = ?")
    // Nothing switched on is stored as NULL, so the keyword lookup skips the row.
    .bind(isDefaultNotifyPrefs(notify) ? null : JSON.stringify(notify), user.id)
    .run();
  return Response.json({ ok: true, notify });
}
