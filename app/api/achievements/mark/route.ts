import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { evaluateAndAward, isMarkKind, recordMark } from "@/lib/achievements";

export const dynamic = "force-dynamic";

/**
 * Records a milestone only the client sees (`{ kind, value }`: a theme tried,
 * a 3D room visited, a fish caught) and returns anything it unlocked.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; value?: unknown };
  if (!isMarkKind(body.kind) || typeof body.value !== "string") {
    return Response.json({ error: "Unknown milestone." }, { status: 400 });
  }
  const added = await recordMark(db, user.id, body.kind, body.value);
  const newAchievements = added
    ? await evaluateAndAward(db, user.id, { sources: ["marks"] }).catch(() => [])
    : [];
  return Response.json({ ok: true, newAchievements });
}
