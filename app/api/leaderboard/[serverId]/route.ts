import { getServerLeaderboard } from "@/lib/community-bot/levels";
import { getCommunityBotConfig } from "@/lib/community-bot/store";
import { DM_SERVER_ID, ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/leaderboard/[serverId]
 * Public MEE6-style leaderboard endpoint for a server.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ serverId: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  await ensureSchema(db);

  const { serverId } = await context.params;
  if (!serverId || serverId === DM_SERVER_ID) {
    return Response.json({ error: "Server not found." }, { status: 404 });
  }

  const server = await db
    .prepare("SELECT id, name, icon, color, icon_url FROM servers WHERE id = ?")
    .bind(serverId)
    .first<{ id: string; name: string; icon: string; color: string; icon_url: string | null }>();
  if (!server) {
    return Response.json({ error: "Server not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const [config, entries, roleRows, memberCountRow] = await Promise.all([
    getCommunityBotConfig(db, serverId),
    getServerLeaderboard(db, serverId, limit, offset),
    db
      .prepare("SELECT id, name, color FROM roles WHERE server_id = ?")
      .bind(serverId)
      .all<{ id: string; name: string; color: string }>(),
    db
      .prepare("SELECT COUNT(*) as cnt FROM server_members WHERE server_id = ?")
      .bind(serverId)
      .first<{ cnt: number }>(),
  ]);

  const roleMap = new Map((roleRows.results || []).map((r) => [r.id, r]));
  const roleRewards = config.plugins.levels.roleRewards
    .map((rr) => {
      const role = roleMap.get(rr.roleId);
      return role ? { level: rr.level, roleName: role.name, roleColor: role.color } : null;
    })
    .filter(Boolean);

  return Response.json({
    server: {
      id: server.id,
      name: server.name,
      icon: server.icon,
      color: server.color,
      iconUrl: server.icon_url,
      memberCount: memberCountRow?.cnt ?? 0,
    },
    bot: {
      enabled: config.enabled && config.plugins.levels.enabled,
      name: config.botName,
      avatar: config.botAvatar,
      color: config.plugins.levels.rankCardColor || config.botColor,
    },
    roleRewards,
    entries,
  });
}
