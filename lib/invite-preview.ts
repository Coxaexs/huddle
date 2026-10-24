import { hubState } from "./hub-client";

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
    isPublic?: boolean;
  } | null;
  inviter: {
    displayName: string;
    username: string | null;
    avatar: string | null;
    avatarUrl: string | null;
    color: string | null;
  } | null;
}

export async function loadInvitePreview(db: D1Database, rawCode: string): Promise<InvitePreview | null> {
  const code = rawCode.trim().toUpperCase().slice(0, 40);
  if (!code) return null;
  const invite = await db
    .prepare(
      `SELECT i.code, i.max_uses, i.uses, i.revoked, i.server_id,
              s.name AS server_name, s.icon AS server_icon, s.icon_url AS server_icon_url,
              s.color AS server_color, s.banner_url AS server_banner_url, s.description AS server_description,
              s.is_public AS server_is_public, s.web_public AS server_web_public, s.vanity_code AS server_vanity_code,
              inv_user.display_name AS inviter_name, inv_user.username AS inviter_username, inv_user.avatar AS inviter_avatar,
              inv_user.avatar_url AS inviter_avatar_url, inv_user.color AS inviter_color
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
      server_is_public?: number | null;
      server_web_public?: number | null;
      server_vanity_code?: string | null;
      inviter_name: string | null;
      inviter_username: string | null;
      inviter_avatar: string | null;
      inviter_avatar_url: string | null;
      inviter_color: string | null;
    }>();
  if (!invite || invite.revoked || (invite.max_uses > 0 && invite.uses >= invite.max_uses)) return null;

  let server: InvitePreview["server"] = null;
  if (invite.server_id) {
    // Online means connected right now (the hub's presence, which already
    // leaves out invisible people), not a status someone picked once.
    const [counts, hub] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS total FROM server_members WHERE server_id = ?")
        .bind(invite.server_id)
        .first<{ total: number }>(),
      hubState(),
    ]);
    const onlineIds = hub?.online ?? [];
    const onlines = onlineIds.length
      ? await db
          .prepare(
            "SELECT COUNT(*) AS online FROM server_members WHERE server_id = ? AND user_id IN (SELECT value FROM json_each(?))",
          )
          .bind(invite.server_id, JSON.stringify(onlineIds))
          .first<{ online: number }>()
      : null;
    server = {
      id: invite.server_id,
      name: invite.server_name || "Hoffle server",
      icon: invite.server_icon || "💬",
      iconUrl: invite.server_icon_url || null,
      color: invite.server_color || "#6a4ddb",
      bannerUrl: invite.server_banner_url || null,
      description: invite.server_description || null,
      memberCount: counts?.total ?? 0,
      onlineCount: onlines?.online ?? 0,
      isPublic: Boolean(
        invite.max_uses === 0 &&
          (invite.server_is_public || invite.server_web_public || (invite.server_vanity_code && invite.server_vanity_code.toUpperCase() === invite.code)),
      ),
    };
  }

  return {
    code: invite.code,
    server,
    inviter: invite.inviter_name
      ? {
          displayName: invite.inviter_name,
          username: invite.inviter_username,
          avatar: invite.inviter_avatar,
          avatarUrl: invite.inviter_avatar_url || null,
          color: invite.inviter_color || null,
        }
      : null,
  };
}
