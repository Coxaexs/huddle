/**
 * Reactions from things that are not Hoffle accounts.
 *
 * A reaction row is (message, user_id, emoji). For a person that user_id is
 * their account; two other kinds of reactor exist:
 *
 * - `bot:<botId>`: a bot reacting as itself (discord.js `message.react()`).
 * - `ext:discord:<id>`: a person on Discord whose reaction the bridge carried
 *   over. Each keeps their own row, so three Discord people reacting 👍 count
 *   as three, and the tooltip can name them. Their name and picture live in
 *   `external_actors`, refreshed every time they react.
 *
 * Only the bridge (or the operator's master token) may react on someone
 * else's behalf; any other bot reacts as itself.
 */
import { isBridgeBot, type BotIdentity } from "./bot-auth";
import { channelAudience } from "./dms";
import { publishMessageEvent } from "./hub-client";
import { cleanAvatarUrl } from "./webhooks";

export interface ReactorUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl?: string | null;
  color: string;
  /** Where this reactor is, when not on Hoffle ("discord"), or "bot". */
  via?: string;
}

export interface ExternalReactor {
  id: string;
  platform: string;
  name: string;
  avatarUrl: string | null;
}

/** The reaction user_id for a bot reacting as itself. */
export function botReactorId(bot: Pick<BotIdentity, "id">): string {
  return `bot:${bot.id}`;
}

export function isExternalReactorId(id: string): boolean {
  return id.startsWith("ext:") || id.startsWith("bot:");
}

/**
 * `?on_behalf_of=discord:<id>&name=<display name>&avatar_url=<url>` on a
 * reaction or typing call from the bridge. Null for every other bot, which
 * keeps the parameters from letting a bot impersonate anyone.
 */
export function reactorFromBridgeQuery(bot: BotIdentity, url: URL): ExternalReactor | null {
  if (!isBridgeBot(bot)) return null;
  const raw = url.searchParams.get("on_behalf_of") || "";
  const match = /^(discord):(\d{5,25})$/.exec(raw);
  if (!match) return null;
  const name = (url.searchParams.get("name") || "").replace(/\s+/g, " ").trim().slice(0, 80) || "Discord user";
  return {
    id: `ext:${match[1]}:${match[2]}`,
    platform: match[1],
    name,
    avatarUrl: cleanAvatarUrl(url.searchParams.get("avatar_url")) ?? null,
  };
}

export async function rememberActor(db: D1Database, actor: ExternalReactor): Promise<void> {
  await db
    .prepare(
      `INSERT INTO external_actors (id, platform, name, avatar_url, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar_url = excluded.avatar_url,
         updated_at = excluded.updated_at`,
    )
    .bind(actor.id, actor.platform, actor.name, actor.avatarUrl, new Date().toISOString())
    .run();
}

export function externalReactorUser(actor: ExternalReactor): ReactorUser {
  return {
    id: actor.id,
    username: actor.name,
    displayName: actor.name,
    avatar: actor.name.slice(0, 1).toUpperCase() || "?",
    avatarUrl: actor.avatarUrl,
    color: "#5865f2",
    via: actor.platform,
  };
}

export function botReactorUser(bot: Pick<BotIdentity, "id" | "name" | "avatar">): ReactorUser {
  return {
    id: botReactorId(bot),
    username: bot.name,
    displayName: bot.name,
    avatar: bot.avatar || "🤖",
    avatarUrl: null,
    color: "#b8a6ff",
    via: "bot",
  };
}

const BUILT_IN_BOTS: Record<string, { name: string; avatar: string }> = {
  "system-bot": { name: "Hoffle System Bot", avatar: "🤖" },
  "dnd-bot": { name: "D&D Bot", avatar: "⚔" },
  "discord-bridge": { name: "Discord Bridge", avatar: "🌉" },
};

/** Display info for reactor ids that are not accounts, looked up in bulk. */
export async function reactorUsers(db: D1Database, ids: string[]): Promise<Map<string, ReactorUser>> {
  const out = new Map<string, ReactorUser>();
  const external = [...new Set(ids.filter((id) => id.startsWith("ext:")))];
  const bots = [...new Set(ids.filter((id) => id.startsWith("bot:")).map((id) => id.slice(4)))];

  for (let i = 0; i < external.length; i += 50) {
    const chunk = external.slice(i, i + 50);
    const rows = await db
      .prepare(
        `SELECT id, platform, name, avatar_url FROM external_actors WHERE id IN (${chunk.map(() => "?").join(",")})`,
      )
      .bind(...chunk)
      .all<{ id: string; platform: string; name: string; avatar_url: string | null }>();
    for (const row of rows.results || []) {
      out.set(row.id, externalReactorUser({ id: row.id, platform: row.platform, name: row.name, avatarUrl: row.avatar_url }));
    }
  }
  for (const id of external) {
    if (!out.has(id)) {
      const platform = id.split(":")[1] || "external";
      out.set(id, externalReactorUser({ id, platform, name: `${platform} user`, avatarUrl: null }));
    }
  }

  const stored = bots.filter((id) => !BUILT_IN_BOTS[id]);
  for (let i = 0; i < stored.length; i += 50) {
    const chunk = stored.slice(i, i + 50);
    const rows = await db
      .prepare(`SELECT id, name, avatar FROM server_bots WHERE id IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk)
      .all<{ id: string; name: string; avatar: string }>();
    for (const row of rows.results || []) {
      out.set(`bot:${row.id}`, botReactorUser({ id: row.id, name: row.name, avatar: row.avatar }));
    }
    const apps = await db
      .prepare(`SELECT id, name, avatar FROM applications WHERE id IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk)
      .all<{ id: string; name: string; avatar: string }>();
    for (const row of apps.results || []) {
      out.set(`bot:${row.id}`, botReactorUser({ id: row.id, name: row.name, avatar: row.avatar }));
    }
  }
  for (const id of bots) {
    const known = BUILT_IN_BOTS[id];
    if (known) out.set(`bot:${id}`, botReactorUser({ id, ...known }));
    else if (!out.has(`bot:${id}`)) out.set(`bot:${id}`, botReactorUser({ id, name: "Bot", avatar: "🤖" }));
  }
  return out;
}

/**
 * Tells open tabs about a reaction. Carries the reactor's name and picture,
 * since a Discord person or a bot is not in anyone's member list.
 */
export async function publishReaction(
  db: D1Database,
  channelId: string,
  event: { messageId: string; emoji: string; userId: string; added: boolean; reactor?: ReactorUser },
): Promise<void> {
  await publishMessageEvent(
    channelId,
    {
      t: "reaction",
      messageId: event.messageId,
      emoji: event.emoji,
      userId: event.userId,
      added: event.added,
      ...(event.reactor ? { reactor: event.reactor } : {}),
    },
    await channelAudience(db, channelId),
  );
}
