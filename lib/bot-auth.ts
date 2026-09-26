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

export function generateBotToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const randomHex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `hfl_bot_${randomHex}`;
}

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

  // 3. Check server-specific bot in DB
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
