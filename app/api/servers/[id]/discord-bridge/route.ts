import { currentUser, isInstanceAdmin, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { postableChannelKindsSql } from "@/lib/channel-kinds";
import { isPrivateChannel, loadServerOverwrites } from "@/lib/channel-permissions";
import {
  BridgeError,
  discordInviteUrl,
  loadBridge,
  loadPairs,
  loadServiceStatus,
  parseSettings,
  removeBridge,
  setPairs,
  startBridge,
  updateSettings,
  type BridgeChannelPair,
} from "@/lib/discord-bridge";
import { can, Permission } from "@/lib/permissions";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MANAGE_LIMIT = { action: "discord-bridge", limit: 40, windowSeconds: 60 };

type Params = { params: Promise<{ id: string }> };

/** The bridge is a server-wide decision: Manage Server, as for bots. */
async function manager(request: Request, props: Params) {
  const db = bindings().DB;
  if (!db) return { error: Response.json({ error: "Storage is not connected." }, { status: 503 }) };
  const user = await currentUser(request);
  if (!user) return { error: unauthorized() };
  await ensureSchema(db);
  const { id } = await props.params;
  const allowed = isInstanceAdmin(user) || (await can(db, user.id, id, Permission.MANAGE_SERVER).catch(() => false));
  if (!allowed) {
    return { error: Response.json({ error: "The Discord bridge takes Manage Server." }, { status: 403 }) };
  }
  return { db, user, serverId: id };
}

/** Everything the settings panel shows, in one request. */
async function snapshot(db: D1Database, serverId: string) {
  const [bridge, pairs, service] = await Promise.all([
    loadBridge(db, serverId),
    loadPairs(db, serverId),
    loadServiceStatus(db),
  ]);
  const channelRows = await db
    .prepare(
      `SELECT id, name, kind, category_id FROM channels WHERE server_id = ? AND kind IN (${postableChannelKindsSql()})
         AND kind != 'dm' ORDER BY position, name`,
    )
    .bind(serverId)
    .all<{ id: string; name: string; kind: string; category_id: string | null }>();
  const overwrites = await loadServerOverwrites(db, [serverId]);
  const guild = bridge?.guild_id ? service.status.guilds?.find((g) => g.id === bridge.guild_id) ?? null : null;
  const codeLive = Boolean(bridge?.link_code && bridge.link_expires_at && Date.parse(bridge.link_expires_at) > Date.now());
  return {
    bridge: bridge
      ? {
          linked: Boolean(bridge.guild_id),
          guild: bridge.guild_id
            ? { id: bridge.guild_id, name: bridge.guild_name || guild?.name || "Discord server", icon: guild?.icon ?? bridge.guild_icon }
            : null,
          linkedBy: bridge.linked_by?.split(":").slice(2).join(":") || null,
          linkedAt: bridge.linked_at,
          code: codeLive ? bridge.link_code : null,
          codeExpiresAt: codeLive ? bridge.link_expires_at : null,
          settings: parseSettings(bridge.settings),
        }
      : null,
    pairs,
    hoffleChannels: (channelRows.results || []).map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      private: isPrivateChannel(overwrites.get(row.id) || []),
    })),
    discord: guild
      ? {
          // Channels a bridge can carry: text and announcement, plus voice and
          // stage (their call and their chat) for Hoffle voice rooms.
          channels: guild.channels
            .filter((channel) => [0, 5, 2, 13].includes(channel.type))
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
          missing: guild.missing ?? [],
          // The bot was removed from that Discord server, or never added.
          present: true,
        }
      : bridge?.guild_id
        ? { channels: [], missing: [], present: false }
        : null,
    service: {
      online: service.online,
      lastSeen: service.updatedAt,
      app: service.status.app ?? null,
      inviteUrl: service.status.app ? discordInviteUrl(service.status.app.id) : null,
      discordConnected: Boolean(service.status.discord?.connected),
      hoffleConnected: Boolean(service.status.hoffle?.connected),
      error: service.status.discord?.error || service.status.hoffle?.error || null,
      activity: service.status.bridges?.[serverId] ?? null,
    },
  };
}

export async function GET(request: Request, props: Params) {
  const auth = await manager(request, props);
  if ("error" in auth) return auth.error;
  return Response.json(await snapshot(auth.db, auth.serverId));
}

/** { action: "start" } → a link code (also used for "new code"). */
export async function POST(request: Request, props: Params) {
  const auth = await manager(request, props);
  if ("error" in auth) return auth.error;
  const limited = await limitUser(auth.db, MANAGE_LIMIT, auth.user.id);
  if (limited) return limited;
  const existing = await loadBridge(auth.db, auth.serverId);
  await startBridge(auth.db, auth.serverId, auth.user.id);
  if (!existing) {
    await recordAudit(auth.db, {
      serverId: auth.serverId,
      actor: auth.user,
      action: "integration.create",
      targetName: "Discord Bridge",
      detail: "Started setting up the Discord bridge",
    });
  }
  return Response.json(await snapshot(auth.db, auth.serverId));
}

/** { pairs?: [{channelId, discordChannelId}], settings?: {...} }. */
export async function PATCH(request: Request, props: Params) {
  const auth = await manager(request, props);
  if ("error" in auth) return auth.error;
  const limited = await limitUser(auth.db, MANAGE_LIMIT, auth.user.id);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as {
    pairs?: BridgeChannelPair[];
    settings?: Record<string, unknown>;
  };
  const bridge = await loadBridge(auth.db, auth.serverId);
  if (!bridge) return Response.json({ error: "Set up the bridge first." }, { status: 400 });
  try {
    if (Array.isArray(body.pairs)) {
      const service = await loadServiceStatus(auth.db);
      const guild = service.status.guilds?.find((g) => g.id === bridge.guild_id) ?? null;
      const before = await loadPairs(auth.db, auth.serverId);
      const after = await setPairs(auth.db, auth.serverId, body.pairs, guild);
      if (before.length !== after.length || before.some((p, i) => p.channelId !== after[i]?.channelId || p.discordChannelId !== after[i]?.discordChannelId)) {
        await recordAudit(auth.db, {
          serverId: auth.serverId,
          actor: auth.user,
          action: "integration.update",
          targetName: "Discord Bridge",
          detail: `${after.length} channel${after.length === 1 ? "" : "s"} bridged`,
        });
      }
    }
    if (body.settings && typeof body.settings === "object") {
      await updateSettings(auth.db, auth.serverId, body.settings);
    }
  } catch (error) {
    if (error instanceof BridgeError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
  return Response.json(await snapshot(auth.db, auth.serverId));
}

/** Turns the bridge off for this server. Nothing on Discord is deleted. */
export async function DELETE(request: Request, props: Params) {
  const auth = await manager(request, props);
  if ("error" in auth) return auth.error;
  const bridge = await loadBridge(auth.db, auth.serverId);
  if (bridge) {
    await removeBridge(auth.db, auth.serverId);
    await recordAudit(auth.db, {
      serverId: auth.serverId,
      actor: auth.user,
      action: "integration.delete",
      targetName: "Discord Bridge",
      detail: bridge.guild_name ? `Unlinked from ${bridge.guild_name}` : "Removed the Discord bridge",
    });
  }
  return Response.json(await snapshot(auth.db, auth.serverId));
}
