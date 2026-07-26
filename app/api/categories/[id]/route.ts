import { currentUser, unauthorized } from "@/lib/auth";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function forbidden(): Response {
  return Response.json(
    { error: "You do not have permission to manage channels here." },
    { status: 403 },
  );
}

async function loadCategory(db: D1Database, id: string) {
  return db
    .prepare("SELECT id, server_id, name FROM categories WHERE id = ?")
    .bind(id)
    .first<{ id: string; server_id: string; name: string }>();
}

/** Rename a category. */
export async function PATCH(
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
  const category = await loadCategory(db, id);
  if (!category) {
    return Response.json({ error: "That category is gone." }, { status: 404 });
  }
  if (!(await can(db, user.id, category.server_id, Permission.MANAGE_CHANNELS))) {
    return forbidden();
  }

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  await db
    .prepare("UPDATE categories SET name = ? WHERE id = ?")
    .bind(body.name?.trim().slice(0, 40) || category.name, id)
    .run();

  await publishStructureChange();
  return Response.json({ servers: await listServers(db) });
}

/** Delete a category; its channels become uncategorised, not deleted. */
export async function DELETE(
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
  const category = await loadCategory(db, id);
  if (!category) {
    return Response.json({ error: "That category is gone." }, { status: 404 });
  }
  if (!(await can(db, user.id, category.server_id, Permission.MANAGE_CHANNELS))) {
    return forbidden();
  }

  await db.batch([
    db
      .prepare("UPDATE channels SET category_id = NULL WHERE category_id = ?")
      .bind(id),
    db.prepare("DELETE FROM categories WHERE id = ?").bind(id),
  ]);

  await publishStructureChange();
  return Response.json({ servers: await listServers(db) });
}
