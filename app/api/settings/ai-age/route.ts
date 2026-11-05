import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** POST { adult: true }: this person says they are 18 or older (lib/ai-age.ts). */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as { adult?: boolean };
  if (body.adult !== true) return Response.json({ error: "AI features are for people 18 and over." }, { status: 400 });
  await db
    .prepare("UPDATE users SET ai_adult_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), user.id)
    .run();
  return Response.json({ ok: true });
}
