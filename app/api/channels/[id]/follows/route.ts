import { currentUser, unauthorized } from "@/lib/auth";
import { channelAccess } from "@/lib/access";
import {
  addFollow,
  FOLLOW_TARGET_KINDS,
  followTargets,
  MAX_FOLLOWS_INTO_CHANNEL,
  removeFollow,
} from "@/lib/channel-follows";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { DM_SERVER_ID } from "@/lib/schema";
import { findChannel, listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Following an announcement channel into a channel of a server you manage
 * (lib/channel-follows.ts). GET lists where you may send it and where it
 * already goes in your servers; POST follows; DELETE stops.
 */
async function open(request: Request, props: Params) {
  const db = bindings().DB;
  if (!db) return { error: Response.json({ error: "Storage is not connected." }, { status: 503 }) };
  const user = await currentUser(request);
  if (!user) return { error: unauthorized() };
  await ensureSchema(db);
  const { id } = await props.params;
  const access = await channelAccess(db, id, user);
  if (!access.ok) return { error: access.response };
  if (access.channel.kind !== "announcement") {
    return { error: Response.json({ error: "Only announcement channels can be followed." }, { status: 400 }) };
  }
  return { db, user, source: access.channel };
}

export async function GET(request: Request, props: Params) {
  const opened = await open(request, props);
  if ("error" in opened) return opened.error;
  const { db, user, source } = opened;
  const servers = await listServers(db, user.id);
  const managed = new Set<string>();
  for (const server of servers) {
    if (await can(db, user.id, server.id, Permission.MANAGE_CHANNELS)) managed.add(server.id);
  }
  const follows = (await followTargets(db, source.id))
    .filter((row) => managed.has(row.server_id))
    .map((row) => ({ channelId: row.id, channelName: row.name, serverId: row.server_id, serverName: row.server_name }));
  const targets = servers
    .filter((server) => managed.has(server.id))
    .map((server) => ({
      serverId: server.id,
      serverName: server.name,
      channels: server.channels
        .filter((channel) => FOLLOW_TARGET_KINDS.has(channel.kind) && channel.id !== source.id)
        .map((channel) => ({ id: channel.id, name: channel.name })),
    }))
    .filter((server) => server.channels.length > 0);
  return Response.json({ follows, targets });
}

/** The channel to send posts to, if this person may: they manage its server. */
async function targetFor(db: D1Database, userId: string, targetId: unknown) {
  if (typeof targetId !== "string" || !targetId) return null;
  const target = await findChannel(db, targetId.slice(0, 64));
  if (!target || target.server_id === DM_SERVER_ID || !FOLLOW_TARGET_KINDS.has(target.kind)) return null;
  if (!(await can(db, userId, target.server_id, Permission.MANAGE_CHANNELS))) return null;
  return target;
}

export async function POST(request: Request, props: Params) {
  const opened = await open(request, props);
  if ("error" in opened) return opened.error;
  const { db, user, source } = opened;
  const body = (await request.json().catch(() => ({}))) as { targetChannelId?: unknown };
  const target = await targetFor(db, user.id, body.targetChannelId);
  if (!target || target.id === source.id) {
    return Response.json(
      { error: "Pick a text channel in a server where you can manage channels." },
      { status: 403 },
    );
  }
  const result = await addFollow(db, source.id, target.id, user.id);
  if (result === "full") {
    return Response.json(
      { error: `#${target.name} already follows ${MAX_FOLLOWS_INTO_CHANNEL} announcement channels.` },
      { status: 400 },
    );
  }
  return Response.json({ ok: true, result, target: { id: target.id, name: target.name } });
}

export async function DELETE(request: Request, props: Params) {
  const opened = await open(request, props);
  if ("error" in opened) return opened.error;
  const { db, user, source } = opened;
  const target = await targetFor(db, user.id, new URL(request.url).searchParams.get("target"));
  if (!target) {
    return Response.json({ error: "You can only stop follows into servers you manage." }, { status: 403 });
  }
  await removeFollow(db, source.id, target.id);
  return Response.json({ ok: true });
}
