/** Links to one message: copied from its menu, previewed and opened in-app. */
import { apiFetch, basePath } from "../client";

export interface MessageLinkTarget {
  messageId: string;
  /** Hints only: the message itself says where it lives when it is opened. */
  channelId?: string;
  serverId?: string;
}

/** Other addresses of this same Hoffle, whose message links open here too. */
const HOFFLE_HOSTS = new Set(["chat.hoffle.online", "deeppixel.online", "www.deeppixel.online"]);

/** `https://host/hangout?server=…&channel=…&message=…` (no server for a DM). */
export function buildMessageLink(target: MessageLinkTarget): string {
  const params = new URLSearchParams();
  if (target.serverId) params.set("server", target.serverId);
  if (target.channelId) params.set("channel", target.channelId);
  params.set("message", target.messageId);
  return `${window.location.origin}${basePath}?${params.toString()}`;
}

/**
 * The message a link points at, when it is a message link to this Hoffle
 * (this host or another address of it, the app's own path, a ?message= id).
 * Anything else is null.
 */
export function parseMessageLink(url: string): MessageLinkTarget | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.host !== window.location.host && !HOFFLE_HOSTS.has(parsed.host)) return null;
    const path = parsed.pathname.replace(/\/+$/, "");
    if (path !== "" && path !== basePath) return null;
    const messageId = parsed.searchParams.get("message")?.trim();
    if (!messageId || !/^[\w-]{1,64}$/.test(messageId)) return null;
    return {
      messageId,
      channelId: parsed.searchParams.get("channel") || undefined,
      serverId: parsed.searchParams.get("server") || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Where a linked message lives, asked of the server (which also checks the
 * viewer may read it): the server to switch to (null for a DM) and the channel
 * to open. Throws with a readable message when it cannot be opened.
 */
export async function resolveMessageLink(
  target: MessageLinkTarget,
): Promise<{ serverId: string | null; channelId: string; messageId: string }> {
  const data = await apiFetch<{ serverId: string | null; channelId: string | null }>(
    `/api/messages/${encodeURIComponent(target.messageId)}`,
  );
  if (!data.channelId) throw new Error("That message can't be opened.");
  return { serverId: data.serverId, channelId: data.channelId, messageId: target.messageId };
}
