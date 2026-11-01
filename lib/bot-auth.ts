import { bindings } from "./storage";
import { ensureSchema } from "./schema";

export interface BotIdentity {
  id: string;
  name: string;
  avatar: string;
  serverId: string | null;
  isMaster: boolean;
  kind: string;
}

export { generateBotToken } from "./bot-token";

/** The companion D&D bot: one identity across every server, like the system bot. */
const DND_BOT: BotIdentity = {
  id: "dnd-bot",
  name: "D&D Bot",
  avatar: "⚔",
  serverId: null,
  isMaster: true,
  kind: "dnd",
};

/**
 * The D&D bot's token, derived from BOT_TOKEN so it needs no setup of its own:
 * the dndbot on the same machine computes the same value from the same secret
 * and connects by itself. It is a one-way hash, so holding it never reveals
 * BOT_TOKEN, and rotating BOT_TOKEN rotates it too.
 *
 * Mirrored in dndbot's bot.py (`_derived_hoffle_token`); keep them in step.
 */
export async function dndBotToken(botToken: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`hoffle-dndbot:${botToken}`),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `hfl_dnd_${hex}`;
}

/**
 * The Discord bridge service (discord-bridge/): one identity across every
 * server that turned the bridge on. Like the D&D bot it is master-scoped, since
 * it serves every bridged server from one connection, and its token is derived
 * from BOT_TOKEN so the service on the same machine needs no setup.
 */
export const DISCORD_BRIDGE_BOT: BotIdentity = {
  id: "discord-bridge",
  name: "Discord Bridge",
  avatar: "🌉",
  serverId: null,
  isMaster: true,
  kind: "discord-bridge",
};

/** Mirrored in discord-bridge/src/config.js (`derivedBridgeToken`); keep them in step. */
export async function discordBridgeToken(botToken: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`hoffle-discord-bridge:${botToken}`),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `hfl_bridge_${hex}`;
}

/** The bridge service, or the operator's own master token standing in for it. */
export function isBridgeBot(bot: BotIdentity | null | undefined): boolean {
  return Boolean(bot && (bot.kind === "discord-bridge" || bot.kind === "system"));
}

/**
 * Extracts and verifies the bot token from the request.
 * Accepts `Authorization: Bot <token>` or `Authorization: Bearer <token>`.
 */
export async function authenticateBot(
  request: Request,
): Promise<BotIdentity | null> {
  const authHeader = request.headers.get("authorization")?.trim();
  if (!authHeader) return null;

  let token = "";
  if (authHeader.startsWith("Bot ")) {
    token = authHeader.slice(4).trim();
  } else if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else {
    token = authHeader;
  }

  if (!token) return null;

  const runtime = bindings();

  // 1. Check master BOT_TOKEN
  if (runtime.BOT_TOKEN && token === runtime.BOT_TOKEN) {
    return {
      id: "system-bot",
      name: "Hoffle System Bot",
      avatar: "🤖",
      serverId: null,
      isMaster: true,
      kind: "system",
    };
  }

  // 2. The built-in D&D bot
  if (runtime.BOT_TOKEN && token.startsWith("hfl_dnd_")) {
    if (token === (await dndBotToken(runtime.BOT_TOKEN))) return { ...DND_BOT };
    return null;
  }

  // 3. The Discord bridge service
  if (runtime.BOT_TOKEN && token.startsWith("hfl_bridge_")) {
    if (token === (await discordBridgeToken(runtime.BOT_TOKEN))) return { ...DISCORD_BRIDGE_BOT };
    return null;
  }

  // 4. Check server-specific bot in DB
  const db = runtime.DB;
  if (!db) return null;

  await ensureSchema(db);

  interface BotRow {
    id: string;
    server_id: string;
    name: string;
    avatar: string;
    kind: string;
    enabled: number;
  }

  const row = await db
    .prepare(
      "SELECT id, server_id, name, avatar, kind, enabled FROM server_bots WHERE token = ? AND enabled = 1 LIMIT 1",
    )
    .bind(token)
    .first<BotRow>();

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar || "🤖",
    serverId: row.server_id,
    isMaster: false,
    kind: row.kind || "custom",
  };
}

/**
 * Rebuilds a bot identity from its id alone.
 *
 * Interaction callbacks arrive without an Authorization header — the
 * interaction token is the credential, exactly as on Discord — so the identity
 * has to come from the stored interaction instead of the request.
 */
export async function botById(
  db: D1Database,
  botId: string,
): Promise<BotIdentity | null> {
  if (botId === DND_BOT.id) return { ...DND_BOT };
  if (botId === DISCORD_BRIDGE_BOT.id) return { ...DISCORD_BRIDGE_BOT };
  if (botId === "system-bot") {
    return {
      id: "system-bot",
      name: "Hoffle System Bot",
      avatar: "🤖",
      serverId: null,
      isMaster: true,
      kind: "system",
    };
  }

  const row = await db
    .prepare(
      "SELECT id, server_id, name, avatar, kind FROM server_bots WHERE id = ? AND enabled = 1 LIMIT 1",
    )
    .bind(botId)
    .first<{
      id: string;
      server_id: string;
      name: string;
      avatar: string;
      kind: string;
    }>();
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar || "🤖",
    serverId: row.server_id,
    isMaster: false,
    kind: row.kind || "custom",
  };
}
