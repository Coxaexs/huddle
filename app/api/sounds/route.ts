import { currentUser, unauthorized } from "@/lib/auth";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface SoundRow {
  id: string;
  server_id: string;
  name: string;
  emoji: string;
  key: string;
}

function soundUrl(key: string): string {
  return `/hangout/api/uploads/${encodeURIComponent(key)}`;
}

/** List a server's soundboard clips. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ sounds: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const serverId = new URL(request.url).searchParams.get("serverId") || "";
  const rows = await db
    .prepare(
      "SELECT id, server_id, name, emoji, key FROM sounds WHERE server_id = ? ORDER BY created_at DESC",
    )
    .bind(serverId)
    .all();

  return Response.json({
    sounds: ((rows.results || []) as unknown as SoundRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      url: soundUrl(row.key),
    })),
  });
}

/** Add a soundboard clip (already uploaded to R2). Gated by MANAGE_CHANNELS. */
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
    emoji?: string;
    key?: string;
  };
  const serverId = body.serverId || "";
  if (!(await can(db, user.id, serverId, Permission.MANAGE_CHANNELS))) {
    return Response.json(
      { error: "You do not have permission to add sounds here." },
      { status: 403 },
    );
  }
  if (!body.key) {
    return Response.json({ error: "Upload a clip first." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO sounds (id, server_id, name, emoji, key, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      serverId,
      body.name?.trim().slice(0, 40) || "sound",
      body.emoji?.trim().slice(0, 8) || "🔊",
      body.key.slice(0, 240),
      user.id,
      new Date().toISOString(),
    )
    .run();

  return Response.json(
    {
      sound: {
        id,
        name: body.name || "sound",
        emoji: body.emoji || "🔊",
        url: soundUrl(body.key),
      },
    },
    { status: 201 },
  );
}

/** Remove a soundboard clip. Gated by MANAGE_CHANNELS. */
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
  const sound = await db
    .prepare("SELECT id, server_id, key FROM sounds WHERE id = ?")
    .bind(id)
    .first<SoundRow>();
  if (!sound) {
    return Response.json({ error: "That sound is gone." }, { status: 404 });
  }
  if (!(await can(db, user.id, sound.server_id, Permission.MANAGE_CHANNELS))) {
    return Response.json(
      { error: "You do not have permission to remove sounds here." },
      { status: 403 },
    );
  }

  await db.prepare("DELETE FROM sounds WHERE id = ?").bind(id).run();
  await bindings().UPLOADS?.delete(sound.key);
  return Response.json({ ok: true });
}
