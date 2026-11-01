/**
 * Who a Discord bridge socket is in the hub: the bridge's own monitor (sees
 * the bridged voice rooms, sits nowhere), or a seat for one person in a paired
 * Discord voice channel.
 *
 * The service names the Discord account; Hoffle decides what that account is
 * here. A linked one (lib/discord-accounts.ts) sits as its Hoffle person, with
 * their own name and picture, and must pass every check that person would.
 * Anyone else gets a `discord:<snowflake>` stand-in with their Discord name and
 * a picture loaded through the image proxy, so listing them never shows
 * Discord who is in the room.
 */
import { accountLinkByDiscord } from "./discord-accounts";

export interface BridgeSeatIdentity {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  /** A Discord person's seat (as opposed to the monitor). */
  discord: boolean;
}

/** Discord's blurple, for people who have no colour of their own here. */
export const DISCORD_SEAT_COLOR = "#5865f2";

const MONITOR: BridgeSeatIdentity = {
  userId: "bot:discord-bridge",
  username: "discord-bridge",
  displayName: "Discord Bridge",
  avatar: "D",
  avatarUrl: null,
  color: DISCORD_SEAT_COLOR,
  discord: false,
};

/** A display name as it may appear on a roster: one line, no control characters, 32 characters. */
export function cleanSeatName(raw: string | null | undefined): string {
  const name = String(raw ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(name).slice(0, 32).join("") || "Discord user";
}

/** Only Discord's own picture host, loaded through our proxy. */
export function discordSeatPicture(raw: string | null | undefined, basePath: string): string | null {
  const url = String(raw ?? "");
  if (!/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/[A-Za-z0-9_./-]+(\?[A-Za-z0-9_=&.-]*)?$/.test(url)) return null;
  if (url.length > 300) return null;
  return `${basePath}/api/unfurl/image?url=${encodeURIComponent(url)}`;
}

export async function bridgeSeatIdentity(
  db: D1Database | undefined,
  params: URLSearchParams,
  basePath: string,
): Promise<BridgeSeatIdentity | null> {
  const discordUser = params.get("discordUser");
  if (!discordUser) return { ...MONITOR };
  if (!/^\d{5,25}$/.test(discordUser)) return null;

  const link = db ? await accountLinkByDiscord(db, discordUser).catch(() => null) : null;
  if (link && db) {
    const user = await db
      .prepare("SELECT id, username, display_name, avatar, avatar_url, color, suspended_at FROM users WHERE id = ?")
      .bind(link.userId)
      .first<{
        id: string;
        username: string;
        display_name: string;
        avatar: string;
        avatar_url: string | null;
        color: string;
        suspended_at: string | null;
      }>()
      .catch(() => null);
    // A suspended account is signed out everywhere, so it does not sit as itself
    // here either: the person is a Discord stand-in like anyone unlinked.
    if (user && !user.suspended_at) {
      return {
        userId: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
        avatar: user.avatar,
        avatarUrl: user.avatar_url,
        color: user.color,
        discord: true,
      };
    }
  }

  const displayName = cleanSeatName(params.get("name"));
  return {
    userId: `discord:${discordUser}`,
    username: displayName,
    displayName,
    avatar: Array.from(displayName)[0]?.toUpperCase() || "D",
    avatarUrl: discordSeatPicture(params.get("avatarUrl"), basePath),
    color: DISCORD_SEAT_COLOR,
    discord: true,
  };
}
