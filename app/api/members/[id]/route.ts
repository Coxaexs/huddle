import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { evictFromVoice, publishStructureChange } from "@/lib/hub-client";
import { can, canAny, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { MAX_TIMEOUT_MINUTES } from "@/lib/timeouts";

export const dynamic = "force-dynamic";

/**
 * Ban or unban a member from a server. Gated by MANAGE_SERVER.
 *
 * Membership in Huddle is implicit (everyone can see every server), so a ban is
 * a recorded block: it strips the person's roles in that server and stops them
 * posting there (enforced in the messages route). "kick" is the same minus the
 * persistent record, exposed as `action: "kick"`.
 */
export async function POST(
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

  const { id: targetId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    serverId?: string;
    action?: "ban" | "unban" | "kick" | "timeout";
    /** For "timeout": how long, in minutes; 0 lifts it. */
    minutes?: number;
  };
  const serverId = body.serverId || "";
  // Timeouts are everyday moderation; kicks and bans need Manage Server.
  const allowed =
    body.action === "timeout"
      ? await canAny(db, user.id, serverId, Permission.MODERATE, Permission.KICK_MEMBERS, Permission.MANAGE_SERVER)
      : await can(db, user.id, serverId, Permission.MANAGE_SERVER);
  if (!allowed) {
    return Response.json(
      { error: "You do not have permission to do that." },
      { status: 403 },
    );
  }
  if (targetId === user.id) {
    return Response.json(
      { error: "You cannot moderate yourself." },
      { status: 400 },
    );
  }
  // Owners and global admins are untouchable.
  const target = await db
    .prepare("SELECT is_admin, display_name FROM users WHERE id = ?")
    .bind(targetId)
    .first<{ is_admin: number; display_name: string }>();
  const server = await db
    .prepare("SELECT created_by FROM servers WHERE id = ?")
    .bind(serverId)
    .first<{ created_by: string | null }>();
  if (target?.is_admin || server?.created_by === targetId) {
    return Response.json(
      { error: "That member cannot be moderated." },
      { status: 403 },
    );
  }

  if (body.action === "timeout") {
    const minutes = Math.round(Number(body.minutes) || 0);
    if (minutes < 0 || minutes > MAX_TIMEOUT_MINUTES) {
      return Response.json({ error: "Pick a timeout of up to 28 days." }, { status: 400 });
    }
    const until = minutes > 0 ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
    const updated = await db
      .prepare("UPDATE server_members SET timeout_until = ? WHERE server_id = ? AND user_id = ?")
      .bind(until, serverId, targetId)
      .run();
    if (!updated.meta.changes) {
      return Response.json({ error: "That person is not in this server." }, { status: 404 });
    }
    await recordAudit(db, {
      serverId,
      actor: user,
      action: until ? "member.timeout" : "member.timeout_remove",
      targetId,
      targetName: target?.display_name || "Unknown member",
      detail: until ? `until ${until}` : undefined,
    });
    if (until) {
      // Stop them speaking right away: out of this server's voice rooms.
      const rooms = await db
        .prepare("SELECT id FROM channels WHERE server_id = ? AND kind = 'voice'")
        .bind(serverId)
        .all<{ id: string }>();
      await evictFromVoice(targetId, (rooms.results || []).map((room) => room.id));
    }
    await publishStructureChange();
    return Response.json({ ok: true, timeoutUntil: until });
  }

  const statements = [
    db
      .prepare("DELETE FROM member_roles WHERE server_id = ? AND user_id = ?")
      .bind(serverId, targetId),
  ];
  if (body.action === "unban") {
    statements.length = 0;
    statements.push(
      db
        .prepare("DELETE FROM bans WHERE server_id = ? AND user_id = ?")
        .bind(serverId, targetId),
    );
  } else {
    // Both kick and ban remove the person from the server now that membership
    // is real; a ban also records a persistent block.
    statements.push(
      db
        .prepare("DELETE FROM server_members WHERE server_id = ? AND user_id = ?")
        .bind(serverId, targetId),
    );
    if (body.action === "ban") {
      statements.push(
        db
          .prepare(
            "INSERT OR REPLACE INTO bans (server_id, user_id, banned_by, created_at) VALUES (?, ?, ?, ?)",
          )
          .bind(serverId, targetId, user.id, new Date().toISOString()),
      );
    }
  }
  await db.batch(statements);

  await recordAudit(db, {
    serverId,
    actor: user,
    action:
      body.action === "ban"
        ? "member.ban"
        : body.action === "unban"
          ? "member.unban"
          : "member.kick",
    targetId,
    targetName: target?.display_name || "Unknown member",
  });
  await publishStructureChange();
  return Response.json({ ok: true });
}

/**
 * Set or clear a per-server nickname. Anyone may set their own; changing
 * someone else's needs MANAGE_NICKNAMES, and owners and global admins can only
 * be renamed by themselves.
 */
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

  const { id: targetId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    serverId?: string;
    nickname?: string | null;
  };
  const serverId = body.serverId || "";
  const nickname =
    typeof body.nickname === "string" ? body.nickname.trim().slice(0, 32) || null : null;

  const membership = await db
    .prepare(
      `SELECT m.nickname, u.display_name, u.is_admin, s.created_by
         FROM server_members m
         JOIN users u ON u.id = m.user_id
         JOIN servers s ON s.id = m.server_id
        WHERE m.server_id = ? AND m.user_id = ?`,
    )
    .bind(serverId, targetId)
    .first<{
      nickname: string | null;
      display_name: string;
      is_admin: number;
      created_by: string | null;
    }>();
  if (!membership) {
    return Response.json({ error: "That person is not in this server." }, { status: 404 });
  }

  if (targetId !== user.id) {
    if (!(await can(db, user.id, serverId, Permission.MANAGE_NICKNAMES))) {
      return Response.json(
        { error: "You do not have permission to do that." },
        { status: 403 },
      );
    }
    if (membership.is_admin || membership.created_by === targetId) {
      return Response.json(
        { error: "Only they can change their own nickname." },
        { status: 403 },
      );
    }
  }

  await db
    .prepare("UPDATE server_members SET nickname = ? WHERE server_id = ? AND user_id = ?")
    .bind(nickname, serverId, targetId)
    .run();

  if (targetId !== user.id) {
    await recordAudit(db, {
      serverId,
      actor: user,
      action: "member.nickname",
      targetId,
      targetName: membership.display_name,
      detail: nickname
        ? `${membership.nickname || membership.display_name} → ${nickname}`
        : `cleared ${membership.nickname || ""}`.trim(),
    });
  }
  await publishStructureChange();
  return Response.json({ ok: true, nickname });
}
