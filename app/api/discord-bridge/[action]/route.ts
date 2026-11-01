import { authenticateBot, isBridgeBot } from "@/lib/bot-auth";
import {
  BridgeError,
  bridgeConfig,
  linkWithCode,
  saveServiceStatus,
  unlinkGuild,
} from "@/lib/discord-bridge";
import { recordAudit } from "@/lib/audit";
import { accountLinkByDiscord, accountLinksForService, linkAccountWithCode, unlinkAccount } from "@/lib/discord-accounts";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ action: string }> };

/**
 * The bridge service's own endpoints (discord-bridge/src/hoffle.js). Only the
 * bridge's derived token, or the operator's master BOT_TOKEN, gets in.
 *
 *   GET  config  → every linked bridge and its channel pairs
 *   POST status  → what the service sees on Discord (polled by Settings)
 *   POST link    → /hoffle link <code>, from someone with Manage Server there
 *   POST unlink  → /hoffle unlink
 *   POST account-link    → /hoffle-account link <code>: a person links their own accounts
 *   POST account-unlink  → /hoffle-account unlink
 *   POST account-status  → /hoffle-account status
 */
async function service(request: Request) {
  const db = bindings().DB;
  if (!db) return { error: Response.json({ error: "Storage is not connected." }, { status: 503 }) };
  await ensureSchema(db);
  const bot = await authenticateBot(request);
  if (!isBridgeBot(bot)) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  return { db };
}

export async function GET(request: Request, props: Params) {
  const auth = await service(request);
  if ("error" in auth) return auth.error;
  const { action } = await props.params;
  if (action !== "config") return Response.json({ error: "Not found" }, { status: 404 });
  const [config, accounts] = await Promise.all([bridgeConfig(auth.db), accountLinksForService(auth.db)]);
  return Response.json({ ...config, accounts });
}

export async function POST(request: Request, props: Params) {
  const auth = await service(request);
  if ("error" in auth) return auth.error;
  const { action } = await props.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (action === "status") {
    await saveServiceStatus(auth.db, body);
    return Response.json({ ok: true });
  }

  if (action === "link") {
    const guild = body.guild as { id?: unknown; name?: unknown; icon?: unknown } | undefined;
    const by = body.user as { id?: unknown; name?: unknown } | undefined;
    if (typeof guild?.id !== "string" || typeof by?.id !== "string") {
      return Response.json({ error: "guild and user are required" }, { status: 400 });
    }
    try {
      const linked = await linkWithCode(
        auth.db,
        body.code,
        { id: guild.id, name: String(guild.name || "Discord server"), icon: typeof guild.icon === "string" ? guild.icon : null },
        { id: by.id, name: String(by.name || "someone") },
      );
      await recordAudit(auth.db, {
        serverId: linked.serverId,
        actor: null,
        actorName: `${String(by.name || "someone")} (Discord)`,
        action: "integration.update",
        targetName: "Discord Bridge",
        detail: `Linked to the Discord server ${String(guild.name || "")}`.trim(),
      });
      return Response.json({ ok: true, ...linked });
    } catch (error) {
      if (error instanceof BridgeError) return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
  }

  if (action === "unlink") {
    if (typeof body.guildId !== "string") return Response.json({ error: "guildId is required" }, { status: 400 });
    const serverId = await unlinkGuild(auth.db, body.guildId);
    if (serverId) {
      const by = body.user as { name?: unknown } | undefined;
      await recordAudit(auth.db, {
        serverId,
        actor: null,
        actorName: `${String(by?.name || "someone")} (Discord)`,
        action: "integration.update",
        targetName: "Discord Bridge",
        detail: "Unlinked from Discord with /hoffle unlink",
      });
    }
    return Response.json({ ok: true, unlinked: Boolean(serverId) });
  }

  if (action === "account-link") {
    const discord = body.discord as { id?: unknown; name?: unknown } | undefined;
    if (typeof discord?.id !== "string") return Response.json({ error: "discord is required" }, { status: 400 });
    try {
      const linked = await linkAccountWithCode(auth.db, body.code, { id: discord.id, name: String(discord.name || "") });
      return Response.json({ ok: true, ...linked });
    } catch (error) {
      if (error instanceof BridgeError) return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
  }

  if (action === "account-unlink" || action === "account-status") {
    if (typeof body.discordUserId !== "string") {
      return Response.json({ error: "discordUserId is required" }, { status: 400 });
    }
    if (action === "account-unlink") {
      return Response.json({ ok: true, unlinked: await unlinkAccount(auth.db, { discordUserId: body.discordUserId }) });
    }
    const link = await accountLinkByDiscord(auth.db, body.discordUserId);
    const user = link
      ? await auth.db
          .prepare("SELECT username, display_name FROM users WHERE id = ?")
          .bind(link.userId)
          .first<{ username: string; display_name: string }>()
      : null;
    return Response.json({
      linked: Boolean(user),
      username: user?.username ?? null,
      displayName: user?.display_name ?? null,
      linkedAt: link?.linkedAt ?? null,
    });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
