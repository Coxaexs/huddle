import { currentUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ valid: false, error: "Database not connected" }, { status: 503 });
  }
  await ensureSchema(db);

  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase();
  if (!code) {
    return Response.json({ valid: false, error: "Invite code is required." }, { status: 400 });
  }

  const user = await currentUser(request);

  const invite = await db
    .prepare(
      `SELECT i.code, i.created_by, i.created_at, i.max_uses, i.uses, i.revoked, i.server_id,
              s.name AS server_name, s.icon AS server_icon, s.color AS server_color, s.banner_url AS server_banner_url,
              inv_user.display_name AS inviter_name, inv_user.username AS inviter_username, inv_user.avatar AS inviter_avatar
         FROM invites i
         LEFT JOIN servers s ON s.id = i.server_id
         LEFT JOIN users inv_user ON inv_user.id = i.created_by
        WHERE i.code = ?`,
    )
    .bind(code)
    .first<{
      code: string;
      created_by: string | null;
      created_at: string;
      max_uses: number;
      uses: number;
      revoked: number;
      server_id: string | null;
      server_name: string | null;
      server_icon: string | null;
      server_color: string | null;
      server_banner_url: string | null;
      inviter_name: string | null;
      inviter_username: string | null;
      inviter_avatar: string | null;
    }>();

  if (!invite || invite.revoked || (invite.max_uses > 0 && invite.uses >= invite.max_uses)) {
    return Response.json({
      valid: false,
      code,
      error: "This invite may be invalid or expired.",
    });
  }

  let memberCount = 1;
  let onlineCount = 1;
  let isMember = false;

  if (invite.server_id) {
    const [counts, onlines] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS total FROM server_members WHERE server_id = ?")
        .bind(invite.server_id)
        .first<{ total: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS online
             FROM server_members sm
             JOIN users u ON u.id = sm.user_id
            WHERE sm.server_id = ?
              AND (u.status IS NULL OR u.status IN ('online', 'idle', 'dnd'))`,
        )
        .bind(invite.server_id)
        .first<{ online: number }>(),
    ]);

    memberCount = counts?.total || 1;
    onlineCount = Math.max(1, onlines?.online || 1);

    if (user) {
      isMember = await isServerMember(db, invite.server_id, user.id);
    }
  }

  return Response.json({
    valid: true,
    code: invite.code,
    server: invite.server_id
      ? {
          id: invite.server_id,
          name: invite.server_name || "Huddle Server",
          icon: invite.server_icon || "💬",
          color: invite.server_color || "#5865F2",
          bannerUrl: invite.server_banner_url || null,
          memberCount,
          onlineCount,
        }
      : null,
    inviter: invite.inviter_name
      ? {
          displayName: invite.inviter_name,
          username: invite.inviter_username,
          avatar: invite.inviter_avatar,
        }
      : null,
    isMember,
  });
}
