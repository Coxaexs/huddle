import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { ensureSchema, DM_SERVER_ID } from "@/lib/schema";
import { addServerMember, isServerMember, listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export interface PublicDirectoryServer {
  id: string;
  name: string;
  icon: string;
  color: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  description: string;
  memberCount: number;
  joined: boolean;
  raidMode: boolean;
}

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ servers: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const rows = await db
    .prepare(
      `SELECT s.id, s.name, s.icon, s.color, s.icon_url, s.banner_url, s.description, s.raid_mode,
              (SELECT COUNT(*) FROM server_members m WHERE m.server_id = s.id) AS member_count,
              EXISTS(SELECT 1 FROM server_members m2 WHERE m2.server_id = s.id AND m2.user_id = ?1) AS is_member
         FROM servers s
        WHERE s.id != ?2 AND s.is_public = 1
        ORDER BY member_count DESC, s.position ASC, s.created_at ASC`,
    )
    .bind(user.id, DM_SERVER_ID)
    .all<{
      id: string;
      name: string;
      icon: string;
      color: string;
      icon_url: string | null;
      banner_url: string | null;
      description: string | null;
      raid_mode: number | null;
      member_count: number;
      is_member: number;
    }>();

  const servers: PublicDirectoryServer[] = (rows.results || []).map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    iconUrl: r.icon_url || null,
    bannerUrl: r.banner_url || null,
    description: r.description || "",
    memberCount: Number(r.member_count) || 0,
    joined: Boolean(r.is_member),
    raidMode: Boolean(r.raid_mode),
  }));

  return Response.json({ servers });
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { serverId?: string };
  const serverId = body.serverId?.trim().slice(0, 64);
  if (!serverId) {
    return Response.json({ error: "Pick a server to join." }, { status: 400 });
  }

  const server = await db
    .prepare("SELECT * FROM servers WHERE id = ? AND id != ?")
    .bind(serverId, DM_SERVER_ID)
    .first<{ id: string; name: string; is_public?: number; raid_mode?: number }>();
  if (!server || !server.is_public) {
    return Response.json({ error: "That server is invite-only or does not exist." }, { status: 404 });
  }
  if (server.raid_mode) {
    return Response.json(
      { error: "This server has Raid Lockdown enabled and is temporarily pausing new joins." },
      { status: 403 },
    );
  }
  if (await isServerMember(db, server.id, user.id)) {
    return Response.json({
      alreadyMember: true,
      serverId: server.id,
      servers: await listServers(db, user.id),
    });
  }
  const banned = await db
    .prepare("SELECT user_id FROM bans WHERE server_id = ? AND user_id = ?")
    .bind(server.id, user.id)
    .first();
  if (banned) {
    return Response.json({ error: "You are banned from that server." }, { status: 403 });
  }

  await addServerMember(db, server.id, user.id, "PUBLIC");
  await recordAudit(db, {
    serverId: server.id,
    actor: user,
    action: "member.join",
    targetId: user.id,
    targetName: user.display_name,
    detail: "via public server directory",
  });
  await publishStructureChange(server.id);
  return Response.json({
    serverId: server.id,
    servers: await listServers(db, user.id),
  });
}
