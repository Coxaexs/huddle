import { canSeeServer } from "@/lib/access";
import { currentUser, isInstanceAdmin, unauthorized } from "@/lib/auth";
import {
  cachedStatus,
  checkAddress,
  DEFAULT_MINECRAFT_PORT,
  deleteGameServer,
  getGameServer,
  isPrivateHost,
  saveGameServer,
} from "@/lib/game-server";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function mayManage(db: D1Database, user: { id: string; is_admin: number }, serverId: string): Promise<boolean> {
  return isInstanceAdmin(user) || (await can(db, user.id, serverId, Permission.MANAGE_SERVER).catch(() => false));
}

/**
 * GET ?serverId=  for members: the game server's status (cached ~20 s), and
 * for managers its settings too (never the RCON password itself).
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const serverId = new URL(request.url).searchParams.get("serverId")?.slice(0, 64) || "";
  if (!serverId || !(await canSeeServer(db, serverId, user))) {
    return Response.json({ error: "You are not a member of this server." }, { status: 403 });
  }
  const config = await getGameServer(db, serverId);
  const manager = await mayManage(db, user, serverId);
  if (!config) return Response.json({ configured: false, manager });
  return Response.json({
    configured: true,
    manager,
    status: await cachedStatus(config),
    settings: manager
      ? { host: config.host, port: config.port, rconPort: config.rconPort, hasRcon: Boolean(config.rconPassword) }
      : undefined,
  });
}

/**
 * Manage Server: { serverId, host, port?, rconPort?, rconPassword? } sets it
 * (an omitted rconPassword keeps the old one, "" removes it); { serverId,
 * remove: true } takes it away.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as {
    serverId?: string;
    host?: string;
    port?: number | string;
    rconPort?: number | string | null;
    rconPassword?: string;
    remove?: boolean;
  };
  const serverId = String(body.serverId || "").slice(0, 64);
  if (!serverId || !(await mayManage(db, user, serverId))) {
    return Response.json({ error: "Setting up a game server takes Manage Server." }, { status: 403 });
  }
  if (body.remove) {
    await deleteGameServer(db, serverId);
    return Response.json({ configured: false });
  }

  const host = String(body.host || "").trim().slice(0, 253);
  const port = body.port ? Number(body.port) : DEFAULT_MINECRAFT_PORT;
  const rconPort = body.rconPort ? Number(body.rconPort) : null;
  const invalid = checkAddress(host, port) || (rconPort !== null ? checkAddress(host, rconPort) : null);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });
  if (isPrivateHost(host) && !isInstanceAdmin(user)) {
    return Response.json(
      { error: "Only the people who run this Hoffle can point it at a private or local address. Use the server's public address." },
      { status: 403 },
    );
  }
  const existing = await getGameServer(db, serverId);
  const rconPassword =
    body.rconPassword === undefined ? existing?.rconPassword ?? null : body.rconPassword.slice(0, 200) || null;
  await saveGameServer(db, { serverId, host, port, rconPort, rconPassword });
  return Response.json({ configured: true, settings: { host, port, rconPort, hasRcon: Boolean(rconPassword) } });
}
