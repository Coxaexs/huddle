import { currentUser, isInstanceAdmin, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { DEFAULT_RCON_PORT, getGameServer, runRcon } from "@/lib/game-server";
import { can, Permission } from "@/lib/permissions";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const RCON_LIMIT = { action: "rcon", limit: 20, windowSeconds: 60 };

/** Manage Server: { serverId, command } runs one RCON command on the server's game server. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as { serverId?: string; command?: string };
  const serverId = String(body.serverId || "").slice(0, 64);
  const command = String(body.command || "").trim().slice(0, 500);
  if (!serverId || !command) return Response.json({ error: "Which command?" }, { status: 400 });
  const allowed =
    isInstanceAdmin(user) || (await can(db, user.id, serverId, Permission.MANAGE_SERVER).catch(() => false));
  if (!allowed) return Response.json({ error: "RCON takes Manage Server." }, { status: 403 });
  const limited = await limitUser(db, RCON_LIMIT, user.id);
  if (limited) return limited;

  const config = await getGameServer(db, serverId);
  if (!config?.rconPassword) {
    return Response.json({ error: "Set an RCON password for the game server first." }, { status: 400 });
  }
  try {
    const output = await runRcon(config.host, config.rconPort || DEFAULT_RCON_PORT, config.rconPassword, command);
    await recordAudit(db, { serverId, actor: user, action: "game-server.rcon", targetName: command.slice(0, 120) }).catch(
      () => undefined,
    );
    return Response.json({ output });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "RCON failed." }, { status: 502 });
  }
}
