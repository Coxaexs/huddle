import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Switch between the simple interface and the full one (app/lib/ui-mode.ts). */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { mode?: string };
  if (body.mode !== "simple" && body.mode !== "full") {
    return Response.json({ error: "Pick simple or full." }, { status: 400 });
  }
  await db.prepare("UPDATE users SET ui_mode = ? WHERE id = ?").bind(body.mode, user.id).run();
  return Response.json({ ok: true, mode: body.mode });
}
