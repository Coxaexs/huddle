/**
 * What an invite code leads to, for people who are not signed in yet: the
 * /i/CODE page, its link preview, and /api/invites/resolve.
 */

export interface InvitePreview {
  code: string;
  server: {
    id: string;
    name: string;
    icon: string;
    iconUrl: string | null;
    color: string;
    bannerUrl: string | null;
    description: string | null;
    memberCount: number;
    onlineCount: number;
  } | null;
  inviter: { displayName: string; username: string | null; avatar: string | null } | null;
}

export async function loadInvitePreview(db: D1Database, rawCode: string): Promise<InvitePreview | null> {
  const code = rawCode.trim().toUpperCase().slice(0, 40);
  if (!code) return null;
  const invite = await db
    .prepare(
      `SELECT i.code, i.max_uses, i.uses, i.revoked, i.server_id,
              s.name AS server_name, s.icon AS server_icon, s.icon_url AS server_icon_url,
              s.color AS server_color, s.banner_url AS server_banner_url, s.description AS server_description,
              inv_user.display_name AS inviter_name, inv_user.username AS inviter_username, inv_user.avatar AS inviter_avatar
         FROM invites i
         LEFT JOIN servers s ON s.id = i.server_id
         LEFT JOIN users inv_user ON inv_user.id = i.created_by
        WHERE i.code = ?`,
    )
    .bind(code)
    .first<{
      code: string;
      max_uses: number;
      uses: number;
      revoked: number;
      server_id: string | null;
      server_name: string | null;
      server_icon: string | null;
      server_icon_url: string | null;
      server_color: string | null;
      server_banner_url: string | null;
      server_description: string | null;
      inviter_name: string | null;
      inviter_username: string | null;
      inviter_avatar: string | null;
    }>();
  if (!invite || invite.revoked || (invite.max_uses > 0 && invite.uses >= invite.max_uses)) return null;

  let server: InvitePreview["server"] = null;
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
    server = {
      id: invite.server_id,
      name: invite.server_name || "Hoffle server",
      icon: invite.server_icon || "💬",
      iconUrl: invite.server_icon_url || null,
      color: invite.server_color || "#6a4ddb",
      bannerUrl: invite.server_banner_url || null,
      description: invite.server_description || null,
      memberCount: counts?.total || 1,
      onlineCount: Math.max(1, onlines?.online || 1),
    };
  }

  return {
    code: invite.code,
    server,
    inviter: invite.inviter_name
      ? { displayName: invite.inviter_name, username: invite.inviter_username, avatar: invite.inviter_avatar }
      : null,
  };
}
