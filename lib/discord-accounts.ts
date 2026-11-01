/**
 * A Hoffle account linked to a Discord account, through the Discord bridge.
 *
 * Linking takes both sides proving themselves: the person signed in to Hoffle
 * makes a code in Settings → Profile → Connections, and the same person runs
 * `/hoffle-account link <code>` on Discord, where the bot sees which Discord
 * account ran it. After that, on every bridged server they belong to:
 *
 * - what they write on Discord shows in Hoffle as their own message (with a
 *   DISCORD tag), editable and deletable like one;
 * - what they write in Hoffle shows on Discord under their Discord name and
 *   picture;
 * - their Discord reactions and typing count as theirs.
 *
 * A link only ever acts inside servers the person is a member of, in channels
 * they could post in themselves; anywhere else they are bridged like anyone.
 */
import { channelAccess } from "./access";
import { newLinkCode, normalizeLinkCode, BridgeError } from "./discord-bridge";
import { snowflakeFor } from "./discord/snowflake";
import { Permission, type PermissionFlag } from "./permissions";

export const ACCOUNT_CODE_TTL_MS = 15 * 60_000;

export interface AccountLink {
  userId: string;
  discordUserId: string;
  discordName: string | null;
  linkedAt: string;
}

interface LinkRow {
  user_id: string;
  discord_user_id: string;
  discord_name: string | null;
  linked_at: string;
}

function fromRow(row: LinkRow | null): AccountLink | null {
  return row
    ? { userId: row.user_id, discordUserId: row.discord_user_id, discordName: row.discord_name, linkedAt: row.linked_at }
    : null;
}

export async function accountLinkFor(db: D1Database, userId: string): Promise<AccountLink | null> {
  return fromRow(await db.prepare("SELECT * FROM discord_account_links WHERE user_id = ?").bind(userId).first<LinkRow>());
}

export async function accountLinkByDiscord(db: D1Database, discordUserId: string): Promise<AccountLink | null> {
  if (!/^\d{5,25}$/.test(discordUserId)) return null;
  return fromRow(
    await db.prepare("SELECT * FROM discord_account_links WHERE discord_user_id = ?").bind(discordUserId).first<LinkRow>(),
  );
}

/** A fresh code for this person (any earlier one stops working). */
export async function newAccountCode(db: D1Database, userId: string): Promise<{ code: string; expiresAt: string }> {
  const code = newLinkCode();
  const expiresAt = new Date(Date.now() + ACCOUNT_CODE_TTL_MS).toISOString();
  await db.batch([
    db.prepare("DELETE FROM discord_account_codes WHERE user_id = ? OR expires_at < ?").bind(userId, new Date().toISOString()),
    db.prepare("INSERT INTO discord_account_codes (code, user_id, expires_at) VALUES (?, ?, ?)").bind(code, userId, expiresAt),
  ]);
  return { code, expiresAt };
}

export async function pendingAccountCode(db: D1Database, userId: string): Promise<{ code: string; expiresAt: string } | null> {
  const row = await db
    .prepare("SELECT code, expires_at FROM discord_account_codes WHERE user_id = ? AND expires_at > ?")
    .bind(userId, new Date().toISOString())
    .first<{ code: string; expires_at: string }>();
  return row ? { code: row.code, expiresAt: row.expires_at } : null;
}

/**
 * `/hoffle-account link <code>` on Discord, relayed by the bridge service, which
 * vouches for the Discord account that ran it. A Discord account already linked
 * elsewhere moves to this Hoffle account: whoever holds it just proved it.
 */
export async function linkAccountWithCode(
  db: D1Database,
  rawCode: unknown,
  discord: { id: string; name: string },
): Promise<{ userId: string; username: string; displayName: string }> {
  const code = normalizeLinkCode(rawCode);
  if (!code) throw new BridgeError("That code doesn't look right. It's 8 letters and numbers, like K7QM-2XPD.");
  if (!/^\d{5,25}$/.test(discord.id)) throw new BridgeError("Unknown Discord account.");
  const row = await db
    .prepare("SELECT user_id, expires_at FROM discord_account_codes WHERE code = ?")
    .bind(code)
    .first<{ user_id: string; expires_at: string }>();
  if (!row || Date.parse(row.expires_at) < Date.now()) {
    throw new BridgeError(
      "That code has expired or was never made. Make a new one in Hoffle: Settings → Edit Profiles → Connections.",
    );
  }
  const user = await db
    .prepare("SELECT id, username, display_name FROM users WHERE id = ?")
    .bind(row.user_id)
    .first<{ id: string; username: string; display_name: string }>();
  if (!user) throw new BridgeError("That Hoffle account is gone.");
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM discord_account_codes WHERE code = ?").bind(code),
    db.prepare("DELETE FROM discord_account_links WHERE user_id = ? OR discord_user_id = ?").bind(user.id, discord.id),
    db
      .prepare("INSERT INTO discord_account_links (user_id, discord_user_id, discord_name, linked_at) VALUES (?, ?, ?, ?)")
      .bind(user.id, discord.id, discord.name.slice(0, 80) || null, now),
  ]);
  return { userId: user.id, username: user.username, displayName: user.display_name };
}

/** Unlinks by either side. Returns whether there was a link. */
export async function unlinkAccount(db: D1Database, by: { userId?: string; discordUserId?: string }): Promise<boolean> {
  if (!by.userId && !by.discordUserId) return false;
  const result = await db
    .prepare("DELETE FROM discord_account_links WHERE user_id = ? OR discord_user_id = ?")
    .bind(by.userId ?? "", by.discordUserId ?? "")
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

/**
 * The Hoffle person behind a Discord account, if linked and allowed to do
 * `need` in this channel themselves. Null means "bridge them like anyone".
 */
export async function linkedActor(
  db: D1Database,
  discordUserId: string | null | undefined,
  channelId: string,
  need: PermissionFlag[] = [Permission.SEND_MESSAGES],
): Promise<{ id: string; username: string; display_name: string; avatar: string; color: string } | null> {
  if (!discordUserId) return null;
  const link = await accountLinkByDiscord(db, discordUserId);
  if (!link) return null;
  const user = await db
    .prepare("SELECT id, username, display_name, avatar, color, is_admin FROM users WHERE id = ?")
    .bind(link.userId)
    .first<{ id: string; username: string; display_name: string; avatar: string; color: string; is_admin: number }>();
  if (!user) return null;
  const access = await channelAccess(db, channelId, { id: user.id, is_admin: user.is_admin }, { need }).catch(
    () => null,
  );
  if (!access?.ok || access.channel.isDm) return null;
  return user;
}

/** Every link, as the bridge service needs them (Hoffle ids as snowflakes). */
export async function accountLinksForService(
  db: D1Database,
): Promise<Array<{ discordUserId: string; hoffleUserId: string }>> {
  const rows = await db
    .prepare(
      `SELECT l.user_id, l.discord_user_id, u.created_at FROM discord_account_links l
         JOIN users u ON u.id = l.user_id ORDER BY l.linked_at`,
    )
    .all<{ user_id: string; discord_user_id: string; created_at: string }>();
  return Promise.all(
    (rows.results || []).map(async (row) => ({
      discordUserId: row.discord_user_id,
      hoffleUserId: await snowflakeFor("user", row.user_id, row.created_at),
    })),
  );
}
