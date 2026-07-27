import { currentUser, unauthorized } from "@/lib/auth";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface EmojiRow {
  id: string;
  server_id: string;
  name: string;
  key: string;
}

function emojiUrl(key: string): string {
  return `/hangout/api/uploads/${encodeURIComponent(key)}`;
}

/** Every custom emoji, so `:name:` can be resolved anywhere it is typed. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ emojis: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const serverId = new URL(request.url).searchParams.get("serverId");
  const rows = serverId
    ? await db
        .prepare(
          "SELECT id, server_id, name, key FROM emojis WHERE server_id = ? ORDER BY name",
        )
        .bind(serverId)
        .all()
    : await db
        .prepare("SELECT id, server_id, name, key FROM emojis ORDER BY name")
        .all();

  return Response.json({
    emojis: ((rows.results || []) as unknown as EmojiRow[]).map((row) => ({
      id: row.id,
      serverId: row.server_id,
      name: row.name,
      url: emojiUrl(row.key),
    })),
  });
}

/** Add a custom emoji (image already uploaded). Gated by MANAGE_CHANNELS. */
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
  if (!(await can(db, user.id, serverId, Permission.MANAGE_CHANNELS))) {
    return Response.json(
      { error: "You do not have permission to add emoji here." },
      { status: 403 },
    );
  }
  // Emoji names are typed inside colons, so keep them simple.
  const name = (body.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
  if (!name || !body.key) {
    return Response.json(
      { error: "Give it a name and an image." },
      { status: 400 },
    );
  }

  const clash = await db
    .prepare("SELECT id FROM emojis WHERE server_id = ? AND name = ?")
    .bind(serverId, name)
    .first();
  if (clash) {
    return Response.json(
      { error: `There is already an emoji called :${name}:` },
      { status: 409 },
    );
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO emojis (id, server_id, name, key, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, serverId, name, body.key.slice(0, 240), user.id, new Date().toISOString())
    .run();

  await publishStructureChange();
  return Response.json(
    { emoji: { id, serverId, name, url: emojiUrl(body.key) } },
    { status: 201 },
  );
}

/** Remove a custom emoji. Gated by MANAGE_CHANNELS. */
export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const id = new URL(request.url).searchParams.get("id") || "";
  const emoji = await db
    .prepare("SELECT id, server_id, key FROM emojis WHERE id = ?")
    .bind(id)
    .first<EmojiRow>();
  if (!emoji) {
    return Response.json({ error: "That emoji is gone." }, { status: 404 });
  }
  if (!(await can(db, user.id, emoji.server_id, Permission.MANAGE_CHANNELS))) {
    return Response.json(
      { error: "You do not have permission to remove emoji here." },
      { status: 403 },
    );
  }

  await db.prepare("DELETE FROM emojis WHERE id = ?").bind(id).run();
  await bindings().UPLOADS?.delete(emoji.key);
  await publishStructureChange();
  return Response.json({ ok: true });
}
