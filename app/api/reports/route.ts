import { currentUser, isInstanceAdmin, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishMessageEvent } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema, DM_SERVER_ID } from "@/lib/schema";
import { findChannel, isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export interface ModerationReport {
  id: string;
  serverId: string;
  channelId: string;
  channelName: string;
  messageId: string;
  messageContent: string;
  messageAuthor: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ reports: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const serverId = new URL(request.url).searchParams.get("serverId")?.trim().slice(0, 64) || "";
  if (!serverId) return Response.json({ error: "Missing serverId." }, { status: 400 });

  const allowed =
    isInstanceAdmin(user) ||
    (await can(db, user.id, serverId, Permission.MANAGE_MESSAGES)) ||
    (await can(db, user.id, serverId, Permission.MANAGE_SERVER));
  if (!allowed) {
    return Response.json({ error: "Moderators only." }, { status: 403 });
  }

  const rows = await db
    .prepare(
      `SELECT r.id, r.server_id, r.channel_id, r.message_id, r.reporter_id, r.reason, r.status, r.created_at, r.resolved_at,
              c.name AS channel_name,
              m.content AS message_content, m.author AS message_author,
              u.display_name AS reporter_name
         FROM message_reports r
         LEFT JOIN channels c ON c.id = r.channel_id
         LEFT JOIN messages m ON m.id = r.message_id
         LEFT JOIN users u ON u.id = r.reporter_id
        WHERE r.server_id = ?
        ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC
        LIMIT 100`,
    )
    .bind(serverId)
    .all<{
      id: string;
      server_id: string;
      channel_id: string;
      message_id: string;
      reporter_id: string;
      reason: string;
      status: string;
      created_at: string;
      resolved_at: string | null;
      channel_name: string | null;
      message_content: string | null;
      message_author: string | null;
      reporter_name: string | null;
    }>();

  const reports: ModerationReport[] = (rows.results || []).map((r) => ({
    id: r.id,
    serverId: r.server_id,
    channelId: r.channel_id,
    channelName: r.channel_name || "deleted-channel",
    messageId: r.message_id,
    messageContent: r.message_content || "(message deleted)",
    messageAuthor: r.message_author || "Unknown",
    reporterId: r.reporter_id,
    reporterName: r.reporter_name || "Member",
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));

  return Response.json({ reports });
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    messageId?: string;
    reason?: string;
  };
  const messageId = body.messageId?.trim().slice(0, 64);
  const reason = body.reason?.trim().slice(0, 400);
  if (!messageId || !reason) {
    return Response.json({ error: "Provide a message and a reason for the report." }, { status: 400 });
  }

  const msg = await db
    .prepare("SELECT id, channel_id, author FROM messages WHERE id = ?")
    .bind(messageId)
    .first<{ id: string; channel_id: string | null; author: string }>();
  if (!msg || !msg.channel_id) {
    return Response.json({ error: "That message could not be found." }, { status: 404 });
  }
  const channel = await findChannel(db, msg.channel_id);
  if (!channel || channel.server_id === DM_SERVER_ID) {
    return Response.json({ error: "Only server messages can be reported to server moderators." }, { status: 400 });
  }
  if (!(await isServerMember(db, channel.server_id, user.id))) {
    return Response.json({ error: "You are not a member of that server." }, { status: 403 });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO message_reports (id, server_id, channel_id, message_id, reporter_id, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    )
    .bind(id, channel.server_id, channel.id, messageId, user.id, reason, now)
    .run();

  return Response.json({ ok: true, id });
}

export async function PATCH(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    reportId?: string;
    status?: "resolved" | "dismissed";
    deleteMessage?: boolean;
  };
  const reportId = body.reportId?.trim().slice(0, 64);
  if (!reportId) return Response.json({ error: "Missing reportId." }, { status: 400 });

  const report = await db
    .prepare("SELECT * FROM message_reports WHERE id = ?")
    .bind(reportId)
    .first<{
      id: string;
      server_id: string;
      channel_id: string;
      message_id: string;
      reason: string;
    }>();
  if (!report) return Response.json({ error: "Report not found." }, { status: 404 });

  const allowed =
    isInstanceAdmin(user) ||
    (await can(db, user.id, report.server_id, Permission.MANAGE_MESSAGES)) ||
    (await can(db, user.id, report.server_id, Permission.MANAGE_SERVER));
  if (!allowed) return Response.json({ error: "Moderators only." }, { status: 403 });

  const now = new Date().toISOString();
  const nextStatus = body.status === "dismissed" ? "dismissed" : "resolved";

  await db
    .prepare("UPDATE message_reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?")
    .bind(nextStatus, user.id, now, reportId)
    .run();

  if (body.deleteMessage) {
    await db
      .prepare("UPDATE messages SET deleted_at = ? WHERE id = ?")
      .bind(now, report.message_id)
      .run();
    await publishMessageEvent(report.channel_id, { t: "message-deleted", id: report.message_id });
  }

  await recordAudit(db, {
    serverId: report.server_id,
    actor: user,
    action: "report.resolve",
    targetId: report.message_id,
    targetName: `report (${nextStatus})`,
    detail: body.deleteMessage ? "deleted reported message" : nextStatus,
  });

  return Response.json({ ok: true, status: nextStatus });
}
