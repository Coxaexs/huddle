import { currentUser, unauthorized } from "@/lib/auth";
import { dmPolicyOf, normalizeDmPolicy } from "@/lib/dm-policy";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Settings → Privacy & Safety: who may start a conversation with you. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  return Response.json({ dmPolicy: await dmPolicyOf(db, user.id) });
}

export async function PATCH(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as { dmPolicy?: unknown };
  const dmPolicy = normalizeDmPolicy(body.dmPolicy);
  await db.prepare("UPDATE users SET dm_policy = ? WHERE id = ?").bind(dmPolicy, user.id).run();
  return Response.json({ dmPolicy });
}
