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

  // 2. Check server-specific bot in DB
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
