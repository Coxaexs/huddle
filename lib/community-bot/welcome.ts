/**
 * Welcome, Goodbye, and Auto-Roles plugin.
 */

import { emitServerLog } from "./logs";
import {
  assignRoleToMember,
  getCommunityBotConfig,
  postCommunityBotMessage,
} from "./store";
import { renderTemplate } from "./types";

export interface MemberEventUser {
  id: string;
  username: string;
  displayName: string;
}

/**
 * Runs when a user joins a server:
 * 1. Assigns configured auto-roles.
 * 2. Posts welcome message or embed to the configured join channel.
 */
export async function handleMemberJoin(
  db: D1Database,
  serverId: string,
  user: MemberEventUser,
): Promise<void> {
  const config = await getCommunityBotConfig(db, serverId);
  if (!config.enabled) return;

  await emitServerLog(db, serverId, {
    kind: "member_join",
    username: user.username,
    displayName: user.displayName,
  });

  if (!config.plugins.welcome.enabled) return;

  const wl = config.plugins.welcome;

  // 1. Auto-roles
  for (const roleId of wl.autoRoleIds) {
    await assignRoleToMember(db, serverId, user.id, roleId);
  }

  // 2. Join announcement
  if (wl.joinChannelId) {
    const [server, countRow] = await Promise.all([
      db.prepare("SELECT name FROM servers WHERE id = ?").bind(serverId).first<{ name: string }>(),
      db
        .prepare("SELECT COUNT(*) as cnt FROM server_members WHERE server_id = ?")
        .bind(serverId)
        .first<{ cnt: number }>(),
    ]);
    const text = renderTemplate(wl.joinMessage, {
      user: `@${user.username}`,
      username: user.displayName,
      server: server?.name ?? "this server",
      memberCount: countRow?.cnt ?? 1,
    });

    if (wl.joinUseEmbed) {
      await postCommunityBotMessage(
        db,
        serverId,
        wl.joinChannelId,
        {
          content: "",
          embeds: [
            {
              title: wl.joinBannerText || `Welcome to ${server?.name ?? "the server"}!`,
              description: text,
              color: wl.joinEmbedColor,
              footer: {
                text: `Member #${countRow?.cnt ?? 1} · @${user.username}`,
              },
              timestamp: new Date().toISOString(),
            },
          ],
        },
        config,
      );
    } else {
      await postCommunityBotMessage(db, serverId, wl.joinChannelId, { content: text }, config);
    }
  }
}

/**
 * Runs when a user leaves a server:
 * Posts goodbye message to the configured leave channel if enabled.
 */
export async function handleMemberLeave(
  db: D1Database,
  serverId: string,
  user: MemberEventUser,
): Promise<void> {
  const config = await getCommunityBotConfig(db, serverId);
  if (!config.enabled) return;

  await emitServerLog(db, serverId, {
    kind: "member_leave",
    username: user.username,
    displayName: user.displayName,
  });

  if (!config.plugins.welcome.enabled) return;

  const wl = config.plugins.welcome;
  if (!wl.leaveEnabled || !wl.leaveChannelId) return;

  const [server, countRow] = await Promise.all([
    db.prepare("SELECT name FROM servers WHERE id = ?").bind(serverId).first<{ name: string }>(),
    db
      .prepare("SELECT COUNT(*) as cnt FROM server_members WHERE server_id = ?")
      .bind(serverId)
      .first<{ cnt: number }>(),
  ]);

  const text = renderTemplate(wl.leaveMessage, {
    user: `@${user.username}`,
    username: user.displayName,
    server: server?.name ?? "this server",
    memberCount: countRow?.cnt ?? 0,
  });

  await postCommunityBotMessage(
    db,
    serverId,
    wl.leaveChannelId,
    {
      content: "",
      embeds: [
        {
          title: "Goodbye!",
          description: text,
          color: "#64748b",
          footer: { text: `${countRow?.cnt ?? 0} members remaining` },
          timestamp: new Date().toISOString(),
        },
      ],
    },
    config,
  );
}
