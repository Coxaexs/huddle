import { currentUser, unauthorized } from "@/lib/auth";
import { findOrCreateDm, listDms } from "@/lib/dms";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ conversations: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  return Response.json({ conversations: await listDms(db, user.id) });
}

/** Opens (or reopens) the conversation with someone. */
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

  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  const targetId = body.userId || "";
  if (!targetId || targetId === user.id) {
    return Response.json(
      { error: "Pick someone else to message." },
      { status: 400 },
    );
  }

  const target = await db
    .prepare("SELECT id FROM users WHERE id = ?")
    .bind(targetId)
    .first();
  if (!target) {
    return Response.json({ error: "That person is gone." }, { status: 404 });
  }

  const channelId = await findOrCreateDm(db, user.id, targetId);
  return Response.json({
    channelId,
    conversations: await listDms(db, user.id),
  });
}
