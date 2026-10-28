import { currentUser, unauthorized } from "@/lib/auth";
import { isDefaultLayout, normalizeLayout } from "@/lib/layout-prefs";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Saves where the panels sit and which widgets are pinned (app/lib/layout-store.ts). */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { layout?: unknown };
  const layout = normalizeLayout(body.layout);
  await db
    .prepare("UPDATE users SET layout_prefs = ? WHERE id = ?")
    // The default is stored as NULL, so "Restore defaults" really is the default.
    .bind(isDefaultLayout(layout) ? null : JSON.stringify(layout), user.id)
    .run();
  return Response.json({ ok: true, layout });
}
