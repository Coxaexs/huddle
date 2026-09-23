import { currentUser, unauthorized } from "@/lib/auth";
import { findOrCreateDm, listDms, setDmHidden } from "@/lib/dms";
import { isBlockedBetween } from "@/lib/friends";
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
  if (!targetId) {
    return Response.json(
      { error: "Pick someone to message." },
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

  const blocked =
    targetId === user.id ? false : await isBlockedBetween(db, user.id, targetId);
  const channelId = await findOrCreateDm(db, user.id, targetId);
  // Opening a conversation you had closed puts it back in your list.
  await setDmHidden(db, channelId, user.id, false);
  return Response.json({
    channelId,
    conversations: await listDms(db, user.id),
    isBlocked: blocked,
  });
}

/** Close a DM (hide it from your list) or reopen it. Messages are kept. */
export async function PATCH(request: Request) {
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
    channelId?: string;
    hidden?: boolean;
  };
  if (!body.channelId || typeof body.hidden !== "boolean") {
    return Response.json({ error: "Which conversation?" }, { status: 400 });
  }
  if (!(await setDmHidden(db, body.channelId, user.id, body.hidden))) {
    return Response.json({ error: "That conversation is not yours." }, { status: 404 });
  }
  return Response.json({ ok: true, conversations: await listDms(db, user.id) });
}
