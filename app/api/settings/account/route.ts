import {
  clearSessionCookie,
  currentUser,
  unauthorized,
  verifyPassword,
} from "@/lib/auth";
import { publishStructureChange } from "@/lib/hub-client";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const DELETE_ACCOUNT_LIMIT = { action: "delete-account", limit: 5, windowSeconds: 900 };

/** An upload key from a stored audio URL, if it is one of ours. */
function uploadKeyFromUrl(url: string | null): string | null {
  const match = url?.match(/^\/hangout\/api\/uploads\/([^/?#]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Deletes the signed-in account. Your password confirms it.
 *
 * Messages stay in their conversations under "Deleted user" unless you ask
 * for them (and their files) to go too. Servers you own and are alone in are
 * deleted; a server you own that still has other members has to be deleted
 * (or someone else made owner) first, so nobody's community vanishes with you.
 * The instance owner cannot delete their account here.
 */
export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const limited = await limitUser(db, DELETE_ACCOUNT_LIMIT, user.id);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
    deleteMessages?: boolean;
  };
  const stored = await db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ password_hash: string }>();
  if (!stored || !(await verifyPassword(String(body.password || ""), stored.password_hash))) {
    return Response.json({ error: "That password is not right." }, { status: 403 });
  }
  if (user.is_admin) {
    return Response.json(
      { error: "The owner of this Hoffle cannot delete their account from the app." },
      { status: 400 },
    );
  }

  // Servers you own: refuse if anyone else is in one; delete the solo ones.
  const owned = await db
    .prepare(
      `SELECT s.id, s.name,
              (SELECT COUNT(*) FROM server_members m WHERE m.server_id = s.id AND m.user_id != ?1) AS others
         FROM servers s WHERE s.created_by = ?1`,
    )
    .bind(user.id)
    .all<{ id: string; name: string; others: number }>();
  const shared = (owned.results || []).filter((server) => server.others > 0);
  if (shared.length) {
    return Response.json(
      {
        error: `You own ${shared.map((server) => server.name).join(", ")}, which still ${shared.length === 1 ? "has" : "have"} members. Delete ${shared.length === 1 ? "it" : "them"} first.`,
      },
      { status: 400 },
    );
  }

  const bucket = bindings().UPLOADS;
  const statements: D1PreparedStatement[] = [];
  for (const server of owned.results || []) {
    const id = server.id;
    statements.push(
      db.prepare("DELETE FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)").bind(id),
      db.prepare("DELETE FROM channels WHERE server_id = ?").bind(id),
      db.prepare("DELETE FROM categories WHERE server_id = ?").bind(id),
      db.prepare("DELETE FROM roles WHERE server_id = ?").bind(id),
      db.prepare("DELETE FROM member_roles WHERE server_id = ?").bind(id),
      db.prepare("DELETE FROM server_members WHERE server_id = ?").bind(id),
      db.prepare("DELETE FROM bans WHERE server_id = ?").bind(id),
      db.prepare("DELETE FROM stickers WHERE server_id = ?").bind(id),
      db.prepare("DELETE FROM audit_log WHERE server_id = ?").bind(id),
      db.prepare("DELETE FROM servers WHERE id = ?").bind(id),
    );
  }

  if (body.deleteMessages) {
    // Their files go too: an upload is public to anyone with its URL.
    const files = await db
      .prepare(
        "SELECT attachment_key, attachments, audio_url FROM messages WHERE user_id = ? AND deleted_at IS NULL",
      )
      .bind(user.id)
      .all<{ attachment_key: string | null; attachments: string | null; audio_url: string | null }>();
    const keys: string[] = [];
    for (const row of files.results || []) {
      if (row.attachment_key) keys.push(row.attachment_key);
      const audio = uploadKeyFromUrl(row.audio_url);
      if (audio) keys.push(audio);
      try {
        const extra = JSON.parse(row.attachments || "[]") as unknown;
        if (Array.isArray(extra)) for (const key of extra) if (typeof key === "string") keys.push(key);
      } catch {
        // Malformed extras: nothing to remove.
      }
    }
    if (bucket) await Promise.all(keys.map((key) => bucket.delete(key).catch(() => undefined)));
    statements.push(
      db
        .prepare("UPDATE messages SET deleted_at = ? WHERE user_id = ? AND deleted_at IS NULL")
        .bind(new Date().toISOString(), user.id),
    );
  } else {
    statements.push(
      db
        .prepare(
          "UPDATE messages SET author = 'Deleted user', avatar = '?', color = '#8a8a8a', user_id = NULL WHERE user_id = ?",
        )
        .bind(user.id),
    );
  }

  const id = user.id;
  for (const [sql, binds] of [
    ["DELETE FROM sessions WHERE user_id = ?", [id]],
    ["DELETE FROM push_subscriptions WHERE user_id = ?", [id]],
    ["DELETE FROM server_members WHERE user_id = ?", [id]],
    ["DELETE FROM member_roles WHERE user_id = ?", [id]],
    ["DELETE FROM server_member_positions WHERE user_id = ?", [id]],
    ["DELETE FROM friendships WHERE user_id = ? OR friend_id = ?", [id, id]],
    ["DELETE FROM voice_prefs WHERE user_id = ? OR target_id = ?", [id, id]],
    ["DELETE FROM server_mutes WHERE target_id = ?", [id]],
    ["DELETE FROM channel_reads WHERE user_id = ?", [id]],
    ["DELETE FROM channel_prefs WHERE user_id = ?", [id]],
    ["DELETE FROM reactions WHERE user_id = ?", [id]],
    ["DELETE FROM mentions WHERE user_id = ?", [id]],
    ["DELETE FROM poll_votes WHERE user_id = ?", [id]],
    ["DELETE FROM event_rsvps WHERE user_id = ?", [id]],
    ["DELETE FROM msn_contacts WHERE user_id = ?", [id]],
    ["DELETE FROM user_emoticons WHERE user_id = ?", [id]],
    ["DELETE FROM user_notes WHERE owner_id = ? OR target_id = ?", [id, id]],
    ["DELETE FROM server_folders WHERE user_id = ?", [id]],
    ["DELETE FROM password_resets WHERE user_id = ?", [id]],
    ["DELETE FROM email_verifications WHERE user_id = ?", [id]],
    ["DELETE FROM dm_members WHERE user_id = ?", [id]],
    ["DELETE FROM users WHERE id = ?", [id]],
  ] as Array<[string, string[]]>) {
    statements.push(db.prepare(sql).bind(...binds));
  }
  await db.batch(statements);

  // Tables some instances have not created yet (saved messages, reminders).
  for (const sql of [
    "DELETE FROM saved_messages WHERE user_id = ?",
    "DELETE FROM reminders WHERE user_id = ?",
    "DELETE FROM ai_usage WHERE user_id = ?",
  ]) {
    await db.prepare(sql).bind(id).run().catch(() => undefined);
  }

  await publishStructureChange();
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie(request) } },
  );
}
