import type { PublicChannel } from "./servers";

/**
 * Whether a channel of a web-readable server shows on hoffle.online/s/...:
 * the same rule as lib/web-public.ts (text or announcements, not 18+, no
 * permission overwrites; the channel list only sends `access` for those).
 */
export function isOnTheWeb(channel: Pick<PublicChannel, "kind" | "nsfw" | "access">): boolean {
  return (channel.kind === "text" || channel.kind === "announcement") && !channel.nsfw && channel.access === undefined;
}
