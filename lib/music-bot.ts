/**
 * The Music + Watch bot is a bot like any other (lib/applications.ts): a server
 * has it once someone added it with its invite link, which stores a
 * `server_bots` row of kind "music". Turning that row off or removing it takes
 * the bot out again. Servers that existed before this rule got the bot once
 * (backfillMusicBot in lib/schema.ts), so nobody lost it.
 */
import { DM_SERVER_ID } from "./schema";

export const MUSIC_BOT_KIND = "music";

/** What a server's row looks like when the bot is added from Integrations. */
export const MUSIC_BOT_DEFAULTS = {
  name: "Hoffle Music",
  avatar: "🎵",
  description: "Synchronized voice audio & playback",
} as const;

export const MUSIC_BOT_MISSING =
  "The Music Bot isn't in this server yet. Someone who can manage the server can add it with its invite link.";

/** True when the server has the music bot added and turned on. */
export async function musicBotInServer(db: D1Database, serverId: string | null | undefined): Promise<boolean> {
  if (!serverId || serverId === DM_SERVER_ID) return false;
  const row = await db
    .prepare("SELECT 1 AS ok FROM server_bots WHERE server_id = ? AND kind = ? AND enabled = 1 LIMIT 1")
    .bind(serverId, MUSIC_BOT_KIND)
    .first<{ ok: number }>();
  return Boolean(row);
}

/** Every server that has the music bot, for the server list. */
export async function serversWithMusicBot(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT DISTINCT server_id FROM server_bots WHERE kind = ? AND enabled = 1")
    .bind(MUSIC_BOT_KIND)
    .all<{ server_id: string }>();
  return new Set((results || []).map((row) => row.server_id));
}

const PLAYER_BOT = `SELECT 1 FROM server_bots b LEFT JOIN applications a ON a.id = b.application_id
  WHERE b.enabled = 1 AND (b.kind = 'music' OR a.player = 1)`;

/** True when some bot in this server can use the room player. */
export async function playerBotInServer(db: D1Database, serverId: string | null | undefined): Promise<boolean> {
  if (!serverId || serverId === DM_SERVER_ID) return false;
  const row = await db.prepare(`${PLAYER_BOT} AND b.server_id = ? LIMIT 1`).bind(serverId).first();
  return Boolean(row);
}

/** Every server with a bot that can use the room player, for the server list. */
export async function serversWithPlayerBot(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT b.server_id FROM server_bots b LEFT JOIN applications a ON a.id = b.application_id
        WHERE b.enabled = 1 AND (b.kind = 'music' OR a.player = 1)`,
    )
    .all<{ server_id: string }>();
  return new Set((results || []).map((row) => row.server_id));
}

/** Commands that only touch the room player, so they work whichever bot is playing. */
export const PLAYER_COMMANDS = new Set([
  "pause", "resume", "skip", "stop", "shuffle", "clear", "seek", "volume", "loop",
  "remove", "forward", "rewind", "replay", "skipto", "move", "removedupes",
]);

