import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  applyOverwrites,
  CHANNEL_DEFAULTS,
  loadOverwrites,
  mayView,
  memberAccessMany,
  OVERWRITE_MASK,
  replaceOverwritesStatements,
  sanitizeOverwrites,
  type ChannelOverwrite,
} from "@/lib/channel-permissions";
import { publishStructureChange } from "@/lib/hub-client";
import { canAny, Permission, roleAuthority } from "@/lib/permissions";
import { DM_SERVER_ID, ensureSchema } from "@/lib/schema";
import { findChannel, listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Who can be given a channel overwrite: the server's roles and (up to 1000) members. */
async function targets(db: D1Database, serverId: string) {
  const [roles, members] = await Promise.all([
    db
      .prepare("SELECT id, name, color, position FROM roles WHERE server_id = ? ORDER BY position DESC, name ASC")
      .bind(serverId)
      .all<{ id: string; name: string; color: string; position: number }>(),
    db
      .prepare(
        `SELECT u.id AS id, u.username AS username, u.display_name AS display_name,
                u.avatar AS avatar, u.avatar_url AS avatar_url, u.color AS color
           FROM server_members sm JOIN users u ON u.id = sm.user_id
          WHERE sm.server_id = ?
          ORDER BY u.display_name COLLATE NOCASE
          LIMIT 1000`,
      )
      .bind(serverId)
      .all<{ id: string; username: string; display_name: string; avatar: string; avatar_url: string | null; color: string }>(),
  ]);
  return {
    roles: (roles.results || []).map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position })),
    members: (members.results || []).map((m) => ({
      id: m.id,
      username: m.username,
      displayName: m.display_name,
      avatar: m.avatar,
      avatarUrl: m.avatar_url,
      color: m.color,
    })),
  };
}

/** The channel and its server, when the caller may edit its permissions. */
async function editable(db: D1Database, channelId: string, userId: string) {
  const channel = await findChannel(db, channelId);
  if (!channel || channel.server_id === DM_SERVER_ID || channel.kind === "dm") {
    return { error: Response.json({ error: "That channel is gone." }, { status: 404 }) };
  }
  if (!(await canAny(db, userId, channel.server_id, Permission.MANAGE_CHANNELS, Permission.MANAGE_ROLES))) {
    return {
      error: Response.json(
        { error: "You need Manage Channels or Manage Roles to change who can use this channel." },
        { status: 403 },
      ),
    };
  }
  return { channel };
}

/** A channel's overwrites, with the roles and members they can be set for. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const { id } = await context.params;
  const found = await editable(db, id, user.id);
  if (found.error) return found.error;
  const [overwrites, people] = await Promise.all([
    loadOverwrites(db, [id]),
    targets(db, found.channel.server_id),
  ]);
  return Response.json({ overwrites: overwrites.get(id) || [], ...people });
}

/** Replaces a channel's overwrites. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const { id } = await context.params;
  const found = await editable(db, id, user.id);
  if (found.error) return found.error;
  const serverId = found.channel.server_id;

  const body = (await request.json().catch(() => ({}))) as { overwrites?: unknown };
  const people = await targets(db, serverId);
  const next = sanitizeOverwrites(body.overwrites, {
    roleIds: new Set(people.roles.map((r) => r.id)),
    memberIds: new Set(people.members.map((m) => m.id)),
  });
  const before = (await loadOverwrites(db, [id])).get(id) || [];

  // Like role edits: nobody hands out what they do not hold, or touches roles at
  // or above their own highest one. Owners and admins have no such limits.
  const authority = await roleAuthority(db, user.id, serverId);
  if (!authority.unlimited) {
    const grantable = authority.mask | CHANNEL_DEFAULTS;
    if (next.some((o) => o.allow & ~grantable & OVERWRITE_MASK)) {
      return Response.json(
        { error: "You can only allow permissions you have yourself." },
        { status: 403 },
      );
    }
    const position = new Map(people.roles.map((r) => [r.id, r.position]));
    const key = (o: ChannelOverwrite) => `${o.targetType}:${o.targetId}`;
    const same = (a?: ChannelOverwrite, b?: ChannelOverwrite) =>
      (a?.allow || 0) === (b?.allow || 0) && (a?.deny || 0) === (b?.deny || 0);
    const beforeByKey = new Map(before.map((o) => [key(o), o]));
    const nextByKey = new Map(next.map((o) => [key(o), o]));
    for (const roleId of new Set([...before, ...next].filter((o) => o.targetType === "role").map((o) => o.targetId))) {
      const k = `role:${roleId}`;
      if (!same(beforeByKey.get(k), nextByKey.get(k)) && (position.get(roleId) ?? -1) >= authority.top) {
        return Response.json(
          { error: "You can only change permissions for roles below your highest role." },
          { status: 403 },
        );
      }
    }
    // Making a channel private without yourself in it is almost always a slip.
    const mine = (await memberAccessMany(db, serverId, [user.id])).get(user.id)!;
    if (!mayView(applyOverwrites(mine, next, user.id))) {
      return Response.json(
        { error: "That would hide the channel from you too. Let one of your roles (or you) see it first." },
        { status: 400 },
      );
    }
  }

  await db.batch(replaceOverwritesStatements(db, id, serverId, next));
  await recordAudit(db, {
    serverId,
    actor: user,
    action: "channel.permissions",
    targetId: id,
    targetName: found.channel.name,
    detail: next.length ? `${next.length} permission override${next.length === 1 ? "" : "s"}` : "cleared",
  });
  await publishStructureChange(serverId);
  return Response.json({ overwrites: next, servers: await listServers(db, user.id) });
}
