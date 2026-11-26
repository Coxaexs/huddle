import { currentUser, unauthorized } from "@/lib/auth";
import { listBirthdays } from "@/lib/community-bot/birthdays";
import { listCustomCommands } from "@/lib/community-bot/custom-commands";
import { listShopItems } from "@/lib/community-bot/economy";
import { listSavedEmbeds } from "@/lib/community-bot/embeds";
import { listGiveaways } from "@/lib/community-bot/giveaways";
import { listWarnings } from "@/lib/community-bot/moderation";
import { listReactionPanels } from "@/lib/community-bot/reaction-roles";
import { getCommunityBotConfig, saveCommunityBotConfig } from "@/lib/community-bot/store";
import { listTicketPanels, listTickets } from "@/lib/community-bot/ticketing";
import { listTimers } from "@/lib/community-bot/timers";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/servers/[id]/community-bot
 * Returns full dashboard state for a server's Community Bot (config, channels,
 * roles, reaction panels, recent warnings, and quick stats).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: serverId } = await context.params;
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "Manage Server permission is required." }, { status: 403 });
  }

  const server = await db
    .prepare("SELECT id, name, icon, color, icon_url FROM servers WHERE id = ?")
    .bind(serverId)
    .first<{ id: string; name: string; icon: string; color: string; icon_url: string | null }>();
  if (!server) return Response.json({ error: "Server not found." }, { status: 404 });

  const [
    config,
    channelsRes,
    rolesRes,
    reactionPanels,
    warnings,
    statsRow,
    membersRes,
    customCommands,
    savedEmbeds,
    timers,
    giveaways,
    ticketPanels,
    tickets,
    shopItems,
    birthdays,
  ] = await Promise.all([
      getCommunityBotConfig(db, serverId),
      db
        .prepare("SELECT id, name, kind FROM channels WHERE server_id = ? ORDER BY position ASC, name ASC")
        .bind(serverId)
        .all<{ id: string; name: string; kind: string }>(),
      db
        .prepare("SELECT id, name, color, position FROM roles WHERE server_id = ? ORDER BY position DESC, name ASC")
        .bind(serverId)
        .all<{ id: string; name: string; color: string; position: number }>(),
      listReactionPanels(db, serverId),
      listWarnings(db, serverId, undefined, 100),
      db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM server_members WHERE server_id = ?1) AS memberCount,
             (SELECT COUNT(*) FROM community_xp WHERE server_id = ?1) AS rankedMembers,
             (SELECT COALESCE(SUM(xp), 0) FROM community_xp WHERE server_id = ?1) AS totalXp,
             (SELECT COUNT(*) FROM community_warnings WHERE server_id = ?1) AS totalWarnings`,
        )
        .bind(serverId)
        .first<{
          memberCount: number;
          rankedMembers: number;
          totalXp: number;
          totalWarnings: number;
        }>(),
      db
        .prepare(
          `SELECT u.id, u.username, u.display_name
             FROM server_members m
             JOIN users u ON u.id = m.user_id
            WHERE m.server_id = ?
            ORDER BY u.display_name ASC LIMIT 200`,
        )
        .bind(serverId)
        .all<{ id: string; username: string; display_name: string }>(),
      listCustomCommands(db, serverId),
      listSavedEmbeds(db, serverId),
      listTimers(db, serverId),
      listGiveaways(db, serverId),
      listTicketPanels(db, serverId),
      listTickets(db, serverId),
      listShopItems(db, serverId),
      listBirthdays(db, serverId),
    ]);

  return Response.json({
    server: {
      id: server.id,
      name: server.name,
      icon: server.icon,
      color: server.color,
      iconUrl: server.icon_url,
    },
    config,
    channels: channelsRes.results || [],
    roles: rolesRes.results || [],
    members: (membersRes.results || []).map((m) => ({
      id: m.id,
      username: m.username,
      displayName: m.display_name || m.username,
    })),
    reactionPanels,
    warnings,
    customCommands,
    savedEmbeds,
    timers,
    giveaways,
    ticketPanels,
    tickets,
    shopItems,
    birthdays,
    stats: statsRow || { memberCount: 0, rankedMembers: 0, totalXp: 0, totalWarnings: 0 },
  });
}

/**
 * PUT /api/servers/[id]/community-bot
 * Updates the server's Community Bot settings and plugin configs.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: serverId } = await context.params;
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "Manage Server permission is required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    enabled?: boolean;
    botName?: string;
    botAvatar?: string;
    botColor?: string;
    plugins?: unknown;
  };

  const config = await saveCommunityBotConfig(db, serverId, body);
  return Response.json({ config });
}
