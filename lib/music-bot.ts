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
