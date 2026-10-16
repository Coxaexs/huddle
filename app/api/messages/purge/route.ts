import { currentUser, isInstanceAdmin, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishMessageEvent } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema, DM_SERVER_ID } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    count?: number;
    targetUserId?: string;
    targetUsername?: string;
  };
  const channelId = body.channelId?.trim().slice(0, 64);
  if (!channelId) {
    return Response.json({ error: "Pick a channel to purge." }, { status: 400 });
  }
  const channel = await findChannel(db, channelId);
  if (!channel || channel.server_id === DM_SERVER_ID) {
    return Response.json({ error: "Bulk purge is only available in server channels." }, { status: 400 });
  }

  const allowed =
    isInstanceAdmin(user) ||
    (await can(db, user.id, channel.server_id, Permission.MANAGE_MESSAGES));
  if (!allowed) {
    return Response.json({ error: "You need Manage Messages permission to purge messages." }, { status: 403 });
  }

  const count = Math.max(1, Math.min(100, Math.round(Number(body.count) || 10)));
  let targetUserId = body.targetUserId?.trim().slice(0, 64) || null;

  if (!targetUserId && body.targetUsername) {
    const cleanName = body.targetUsername.replace(/^@/, "").trim().toLowerCase();
    if (cleanName) {
      const found = await db
        .prepare("SELECT id FROM users WHERE username_lower = ? OR LOWER(display_name) = ?")
        .bind(cleanName, cleanName)
        .first<{ id: string }>();
      if (found) targetUserId = found.id;
    }
  }

  const rows = targetUserId
    ? await db
        .prepare(
          `SELECT id FROM messages
            WHERE channel_id = ? AND deleted_at IS NULL AND (user_id = ? OR sender_id = ?)
            ORDER BY created_at DESC LIMIT ?`,
        )
        .bind(channelId, targetUserId, targetUserId, count)
        .all<{ id: string }>()
    : await db
        .prepare(
          `SELECT id FROM messages
            WHERE channel_id = ? AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT ?`,
        )
        .bind(channelId, count)
        .all<{ id: string }>();

  const ids = (rows.results || []).map((r) => r.id);
  if (ids.length === 0) {
    return Response.json({ purged: 0 });
  }

  const now = new Date().toISOString();
  await db.batch(
    ids.map((id) =>
      db.prepare("UPDATE messages SET deleted_at = ? WHERE id = ?").bind(now, id),
    ),
  );

  for (const id of ids) {
    await publishMessageEvent(channelId, { t: "message-deleted", id });
  }

  await recordAudit(db, {
    serverId: channel.server_id,
    actor: user,
    action: "message.purge",
    targetId: channelId,
    targetName: `#${channel.name}`,
    detail: `purged ${ids.length} message${ids.length === 1 ? "" : "s"}`,
  });

  return Response.json({ purged: ids.length, ids });
}
