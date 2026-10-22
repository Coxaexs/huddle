import { messageAccess } from "@/lib/access";
import { currentUser, isInstanceAdmin, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishMessageEvent } from "@/lib/hub-client";
import { can, Permission, reportNotifierIds } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { sendPushNotifications } from "@/lib/push";
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

  const serverId = new URL(request.url).searchParams.get("serverId")?.trim().slice(0, 64) || undefined;

  let where = "";
  const params: Array<string | undefined> = [];
  if (serverId) {
    where = "WHERE r.server_id = ?";
    params.push(serverId);
    const allowed =
      isInstanceAdmin(user) ||
      (await can(db, user.id, serverId, Permission.MANAGE_MESSAGES)) ||
      (await can(db, user.id, serverId, Permission.MANAGE_SERVER));
    if (!allowed) {
      return Response.json({ error: "Moderators only." }, { status: 403 });
    }
  } else if (!isInstanceAdmin(user)) {
    return Response.json({ error: "Instance admins only." }, { status: 403 });
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
        ${where}
        ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC
        LIMIT 100`,
    )
    .bind(...params)
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

  // Only a message the reporter can read: a private channel's messages are a
  // 404 to anyone it hides them from, here as everywhere else.
  const access = await messageAccess(db, messageId, user, { includeDeleted: true });
  if (!access.ok) return access.response;
  const channel = access.channel;
  if (!channel.id) {
    return Response.json({ error: "That message could not be found." }, { status: 404 });
  }
  if (channel.isDm) {
    return Response.json({ error: "Only server messages can be reported to server moderators." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO message_reports (id, server_id, channel_id, message_id, reporter_id, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    )
    .bind(id, channel.serverId, channel.id, messageId, user.id, reason, now)
    .run();

  // Tell the server's moderators a report was filed so they don't have to keep
  // checking the Safety tab or /kivi. Errors here must never fail a report.
  const server = await db
    .prepare("SELECT name FROM servers WHERE id = ?")
    .bind(channel.serverId)
    .first<{ name: string }>();
  const notifierIds = await reportNotifierIds(db, channel.serverId, user.id);
  if (notifierIds.length) {
    await sendPushNotifications(db, notifierIds, {
      title: "New message report",
      body: `${user.display_name} reported a message in #${channel.name}${
        server ? ` (${server.name})` : ""
      }: “${reason}”`,
      url: "/kivi",
      tag: "message-report",
    }).catch(() => undefined);
  }

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
