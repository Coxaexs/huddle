import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

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
    action?: "ban" | "unban" | "kick";
  };
  const serverId = body.serverId || "";
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
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
