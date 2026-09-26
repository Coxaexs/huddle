import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Longest note you can keep about someone, matching Discord. */
const NOTE_LIMIT = 256;

/** Your private note about someone. Nobody else, including them, can read it. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ note: "" });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await context.params;
  const row = await db
    .prepare("SELECT note FROM user_notes WHERE owner_id = ? AND target_id = ?")
    .bind(user.id, id)
    .first<{ note: string }>();
  return Response.json({ note: row?.note || "" });
}

/** Saves (or, when empty, clears) your note about someone. */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { note?: unknown };
  const note = typeof body.note === "string" ? body.note.trim().slice(0, NOTE_LIMIT) : "";

  if (!note) {
    await db
      .prepare("DELETE FROM user_notes WHERE owner_id = ? AND target_id = ?")
      .bind(user.id, id)
      .run();
    return Response.json({ note: "" });
  }

  const target = await db.prepare("SELECT id FROM users WHERE id = ?").bind(id).first();
  if (!target) {
    return Response.json({ error: "That person is gone." }, { status: 404 });
  }
  await db
    .prepare(
      `INSERT INTO user_notes (owner_id, target_id, note, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(owner_id, target_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
    )
    .bind(user.id, id, note, new Date().toISOString())
    .run();
  return Response.json({ note });
}
