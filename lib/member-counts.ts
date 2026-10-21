/**
 * When to show a server's member and online counts to someone deciding
 * whether to join (invite page, link-preview card, join prompt, directory).
 * "1 member, 1 online" reads as an empty room and puts people off, so small
 * numbers are left out rather than shown. No server-only imports: the chat
 * client uses this too.
 */

/** Below this many members the number is left out. */
export const SHOW_MEMBERS_FROM = 10;
/** Below this many people online the number is left out. */
export const SHOW_ONLINE_FROM = 3;

export function shownCounts(server: { memberCount: number; onlineCount: number }): {
  members: number | null;
  online: number | null;
} {
  const members = server.memberCount >= SHOW_MEMBERS_FROM ? server.memberCount : null;
  // Online is only shown next to a member count, never on its own.
  const online = members !== null && server.onlineCount >= SHOW_ONLINE_FROM ? server.onlineCount : null;
  return { members, online };
}

export function membersText(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "member" : "members"}`;
}
