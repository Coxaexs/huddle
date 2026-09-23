import { currentUser, unauthorized } from "@/lib/auth";
import { canAny, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Stickers and shared sounds: Manage Emojis & Stickers, or Manage Channels. */
function canManageExpressions(db: D1Database, userId: string, serverId: string) {
  return canAny(db, userId, serverId, Permission.MANAGE_EMOJIS, Permission.MANAGE_CHANNELS);
}

interface SoundRow {
  id: string;
  server_id: string;
  name: string;
  emoji: string;
  key: string;
  scope?: string;
  owner_id?: string | null;
}

function soundUrl(key: string): string {
  return `/hangout/api/uploads/${encodeURIComponent(key)}`;
}

/** List a server's soundboard clips, plus your own personal pack. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ sounds: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const serverId = new URL(request.url).searchParams.get("serverId") || "";
  const rows = await db
    .prepare(
      `SELECT id, server_id, name, emoji, key, scope, owner_id
         FROM sounds
        WHERE (server_id = ? AND (scope IS NULL OR scope = 'server'))
           OR (scope = 'personal' AND owner_id = ?)
        ORDER BY created_at DESC`,
    )
    .bind(serverId, user.id)
    .all();

  return Response.json({
    sounds: ((rows.results || []) as unknown as SoundRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      url: soundUrl(row.key),
      personal: row.scope === "personal",
    })),
  });
}

/** Add a soundboard clip (already uploaded to R2). Needs Manage Emojis & Stickers or Manage Channels. */
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
    /** "server" (shared, needs expression permissions) or "personal" (your own pack). */
    personal?: boolean;
  };
  const serverId = body.serverId || "";
  const personal = Boolean(body.personal);
  if (!personal && !(await canManageExpressions(db, user.id, serverId))) {
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
      `INSERT INTO sounds (id, server_id, name, emoji, key, created_by, created_at, scope, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      serverId,
      body.name?.trim().slice(0, 40) || "sound",
      body.emoji?.trim().slice(0, 8) || "🔊",
      body.key.slice(0, 240),
      user.id,
      new Date().toISOString(),
      personal ? "personal" : "server",
      personal ? user.id : null,
    )
    .run();

  return Response.json(
    {
      sound: {
        id,
        name: body.name || "sound",
        emoji: body.emoji || "🔊",
        url: soundUrl(body.key),
        personal,
      },
    },
    { status: 201 },
  );
}

/** Remove a soundboard clip. Needs Manage Emojis & Stickers or Manage Channels. */
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
    .prepare("SELECT id, server_id, key, scope, owner_id FROM sounds WHERE id = ?")
    .bind(id)
    .first<SoundRow>();
  if (!sound) {
    return Response.json({ error: "That sound is gone." }, { status: 404 });
  }
  // Personal sounds can be removed by their owner; shared ones need moderation.
  const isOwner = sound.scope === "personal" && sound.owner_id === user.id;
  if (
    !isOwner &&
    !(await canManageExpressions(db, user.id, sound.server_id))
  ) {
    return Response.json(
      { error: "You do not have permission to remove sounds here." },
      { status: 403 },
    );
  }

  await db.prepare("DELETE FROM sounds WHERE id = ?").bind(id).run();
  await bindings().UPLOADS?.delete(sound.key);
  return Response.json({ ok: true });
}

/** Rename a soundboard clip or change its emoji. */
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
    id?: string;
    name?: string;
    emoji?: string;
  };
  const sound = await db
    .prepare("SELECT id, server_id, key, scope, owner_id FROM sounds WHERE id = ?")
    .bind(body.id || "")
    .first<SoundRow>();
  if (!sound) {
    return Response.json({ error: "That sound is gone." }, { status: 404 });
  }
  const isOwner = sound.scope === "personal" && sound.owner_id === user.id;
  if (!isOwner && !(await canManageExpressions(db, user.id, sound.server_id))) {
    return Response.json(
      { error: "You do not have permission to edit sounds here." },
      { status: 403 },
    );
  }
  const name = body.name?.trim().slice(0, 40);
  const emoji = body.emoji?.trim().slice(0, 8);
  await db
    .prepare("UPDATE sounds SET name = COALESCE(?, name), emoji = COALESCE(?, emoji) WHERE id = ?")
    .bind(name || null, emoji || null, sound.id)
    .run();
  return Response.json({ ok: true });
}
