import { currentUser, unauthorized } from "@/lib/auth";
import { canAny, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Stickers and shared sounds: Manage Emojis & Stickers, or Manage Channels. */
function canManageExpressions(db: D1Database, userId: string, serverId: string) {
  return canAny(db, userId, serverId, Permission.MANAGE_EMOJIS, Permission.MANAGE_CHANNELS);
}

interface StickerRow {
  id: string;
  server_id: string;
  name: string;
  key: string;
}

function stickerUrl(key: string): string {
  return `/hangout/api/uploads/${encodeURIComponent(key)}`;
}

/** List a server's custom (uploaded) stickers. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ stickers: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const serverId = new URL(request.url).searchParams.get("serverId") || "";
  const rows = await db
    .prepare(
      "SELECT id, server_id, name, key FROM stickers WHERE server_id = ? ORDER BY created_at DESC",
    )
    .bind(serverId)
    .all();

  return Response.json({
    stickers: ((rows.results || []) as unknown as StickerRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      url: stickerUrl(row.key),
    })),
  });
}

/**
 * Add an uploaded image (already stored in R2 via /api/uploads) as a custom
 * sticker for a server. Needs Manage Emojis & Stickers or Manage Channels.
 */
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

  const body = (await request.json().catch(() => ({}))) as {
    serverId?: string;
    name?: string;
    key?: string;
  };
  const serverId = body.serverId || "";
  if (!(await canManageExpressions(db, user.id, serverId))) {
    return Response.json(
      { error: "You do not have permission to add stickers here." },
      { status: 403 },
    );
  }
  if (!body.key) {
    return Response.json({ error: "Upload an image first." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO stickers (id, server_id, name, key, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      serverId,
      body.name?.trim().slice(0, 40) || "sticker",
      body.key.slice(0, 240),
      user.id,
      new Date().toISOString(),
    )
    .run();

  return Response.json(
    { sticker: { id, name: body.name || "sticker", url: stickerUrl(body.key) } },
    { status: 201 },
  );
}

/** Remove a custom sticker. Needs Manage Emojis & Stickers or Manage Channels. */
export async function DELETE(request: Request) {
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

  const id = new URL(request.url).searchParams.get("id") || "";
  const sticker = await db
    .prepare("SELECT id, server_id, key FROM stickers WHERE id = ?")
    .bind(id)
    .first<StickerRow>();
  if (!sticker) {
    return Response.json({ error: "That sticker is gone." }, { status: 404 });
  }
  if (!(await canManageExpressions(db, user.id, sticker.server_id))) {
    return Response.json(
      { error: "You do not have permission to remove stickers here." },
      { status: 403 },
    );
  }

  await db.prepare("DELETE FROM stickers WHERE id = ?").bind(id).run();
  await bindings().UPLOADS?.delete(sticker.key).catch(() => undefined);
  return Response.json({ ok: true });
}

/** Rename a custom sticker. */
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

  const body = (await request.json().catch(() => ({}))) as { id?: string; name?: string };
  const sticker = await db
    .prepare("SELECT id, server_id, name, key FROM stickers WHERE id = ?")
    .bind(body.id || "")
    .first<StickerRow>();
  if (!sticker) {
    return Response.json({ error: "That sticker is gone." }, { status: 404 });
  }
  if (!(await canManageExpressions(db, user.id, sticker.server_id))) {
    return Response.json(
      { error: "You do not have permission to edit stickers here." },
      { status: 403 },
    );
  }
  const name = body.name?.trim().slice(0, 40);
  if (!name) return Response.json({ error: "Give it a name." }, { status: 400 });
  await db.prepare("UPDATE stickers SET name = ? WHERE id = ?").bind(name, sticker.id).run();
  return Response.json({ ok: true });
}
