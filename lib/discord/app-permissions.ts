/**
 * What a Developer Portal bot needs for each Discord API route.
 *
 * A server's own bots (server_bots rows with no application) can do anything in
 * that server, because only that server's admins can make them. A bot added
 * with an invite link is someone else's code, so it gets exactly what the
 * server granted. Anything not listed here is refused.
 */
import { Permission } from "../permissions";
import { GatewayIntent } from "./protocol";

export type RouteNeed =
  | { kind: "open" }
  | { kind: "deny" }
  | {
      kind: "guild" | "channel";
      id: string;
      flags: number[];
      /** Allowed without these flags when the message is the bot's own. */
      unlessOwnMessage?: { messageId: string; flags: number[] };
      /** A privileged intent the bot must have switched on in the portal. */
      intent?: number;
    };

const open: RouteNeed = { kind: "open" };
const deny: RouteNeed = { kind: "deny" };

function guildNeed(method: string, id: string, rest: string[]): RouteNeed {
  const [sub, target, leaf, leafId] = rest;
  const need = (flags: number[], intent?: number): RouteNeed => ({ kind: "guild", id, flags, intent });
  const read = method === "GET";

  if (!sub) return read ? need([]) : method === "PATCH" ? need([Permission.MANAGE_SERVER]) : deny;
  switch (sub) {
    case "channels":
      return read ? need([]) : need([Permission.MANAGE_CHANNELS]);
    case "roles":
      return read ? need([]) : need([Permission.MANAGE_ROLES]);
    case "emojis":
      return read ? need([]) : need([Permission.MANAGE_EMOJIS]);
    case "members":
      if (!target || target === "search") return read ? need([], GatewayIntent.GuildMembers) : deny;
      if (leaf === "roles" && leafId) return need([Permission.MANAGE_ROLES]);
      if (read) return need([]);
      if (method === "DELETE") return need([Permission.KICK_MEMBERS]);
      // PATCH: the flags depend on the body (memberPatchFlags).
      return method === "PATCH" ? need([]) : deny;
    case "bans":
      return need([Permission.BAN_MEMBERS]);
    case "webhooks":
    case "invites":
      return need([Permission.MANAGE_SERVER]);
    case "threads":
      // Listing threads can name ones in private channels.
      return need([Permission.ADMINISTRATOR]);
    case "audit-logs":
      return need([Permission.VIEW_AUDIT_LOG]);
    default:
      return read ? need([]) : deny;
  }
}

function channelNeed(method: string, id: string, rest: string[]): RouteNeed {
  const [sub, messageId, leaf] = rest;
  const view = Permission.VIEW_CHANNEL;
  const need = (flags: number[], intent?: number): RouteNeed => ({ kind: "channel", id, flags: [view, ...flags], intent });
  const read = method === "GET";

  if (!sub) return read ? need([]) : need([Permission.MANAGE_CHANNELS]);
  switch (sub) {
    case "messages":
      if (!messageId) {
        return read
          ? need([Permission.READ_MESSAGE_HISTORY], GatewayIntent.MessageContent)
          : method === "POST"
            ? need([Permission.SEND_MESSAGES])
            : deny;
      }
      if (messageId === "bulk-delete") return need([Permission.MANAGE_MESSAGES]);
      if (leaf === "reactions") {
        if (read) return need([]);
        const own = rest[4] === "@me" || (method === "PUT" && rest.length >= 4);
        return need(own ? [Permission.ADD_REACTIONS] : [Permission.MANAGE_MESSAGES]);
      }
      if (leaf === "threads") return need([Permission.CREATE_PUBLIC_THREADS]);
      if (leaf) return deny;
      if (read) return need([Permission.READ_MESSAGE_HISTORY], GatewayIntent.MessageContent);
      if (method === "PATCH") return need([]);
      if (method === "DELETE") {
        return { kind: "channel", id, flags: [view], unlessOwnMessage: { messageId, flags: [Permission.MANAGE_MESSAGES] } };
      }
      return deny;
    case "pins":
      return read ? need([]) : need([Permission.MANAGE_MESSAGES]);
    case "typing":
      return need([Permission.SEND_MESSAGES]);
    case "threads":
      return read ? need([]) : need([Permission.CREATE_PUBLIC_THREADS]);
    case "thread-members":
      return read ? need([]) : need([Permission.SEND_MESSAGES_IN_THREADS]);
    case "webhooks":
      return need([Permission.MANAGE_SERVER]);
    case "invites":
      return read ? need([Permission.MANAGE_SERVER]) : need([Permission.CREATE_INVITES]);
    default:
      return read ? need([]) : deny;
  }
}

export function requiredFor(method: string, segments: string[]): RouteNeed {
  const [head, id, ...rest] = segments;
  switch (head) {
    case "applications":
    case "interactions":
    case "oauth2":
    case "voice":
    case "webhooks":
      return open;
    case "users":
      if (method === "GET") return id === "@me" && rest[0] === "channels" ? deny : open;
      return id === "@me" && !rest.length && method === "PATCH" ? open : deny;
    case "guilds":
      return id ? guildNeed(method, id, rest) : deny;
    case "channels":
      return id ? channelNeed(method, id, rest) : deny;
    default:
      return deny;
  }
}

/** PATCH /guilds/{id}/members/{id}: what each field in the body needs. */
export function memberPatchFlags(body: Record<string, unknown>): number[] {
  const byField: Array<[string, number]> = [
    ["nick", Permission.MANAGE_NICKNAMES],
    ["roles", Permission.MANAGE_ROLES],
    ["mute", Permission.MUTE_MEMBERS],
    ["deaf", Permission.DEAFEN_MEMBERS],
    ["channel_id", Permission.MOVE_MEMBERS],
    ["communication_disabled_until", Permission.MODERATE],
  ];
  const flags = byField.filter(([field]) => body[field] !== undefined).map(([, flag]) => flag);
  return flags.length ? flags : [Permission.MANAGE_SERVER];
}

/** True when `wanted` asks for nothing beyond what the bot itself was granted. */
export function withinGrant(grant: number, wanted: number): boolean {
  if (grant & Permission.ADMINISTRATOR) return true;
  return (wanted & Permission.ADMINISTRATOR) === 0 && (wanted & ~grant) === 0;
}

/** Whether a gateway event reaches a Developer Portal bot with these grants. */
export function botMayReceive(
  grants: Record<string, number>,
  event: { serverId?: string | null; privateChannel?: boolean },
): boolean {
  if (!event.serverId || !Object.hasOwn(grants, event.serverId)) return false;
  const grant = grants[event.serverId];
  if (grant & Permission.ADMINISTRATOR) return true;
  return Boolean(grant & Permission.VIEW_CHANNEL) && !event.privateChannel;
}
