/**
 * The right-click menus of the bots in each server (lib/bot-menus.ts), fetched
 * once per server and kept here so a right click can answer at once: a menu
 * has to open on the click itself, not after a round trip.
 */
import type { PublicBotMenu } from "@/lib/bot-menus";
import { apiFetch } from "./client";

const byServer = new Map<string, Map<string, PublicBotMenu>>();
const loading = new Map<string, Promise<void>>();

/** Fetches a server's bot menus. Safe to call often: one request at a time per server. */
export function loadBotMenus(serverId: string): Promise<void> {
  const running = loading.get(serverId);
  if (running) return running;
  const request = apiFetch<{ menus: PublicBotMenu[] }>(`/api/bot-menus?${new URLSearchParams({ serverId })}`)
    .then((data) => {
      byServer.set(serverId, new Map((data.menus || []).map((menu) => [menu.applicationId, menu])));
    })
    // No menus is the safe answer: the ordinary message menu opens instead.
    .catch(() => undefined)
    .finally(() => loading.delete(serverId));
  loading.set(serverId, request);
  return request;
}

/** A bot's menu in a server, if it has one and it has been fetched. */
export function botMenuFor(serverId: string | null | undefined, botId: string | null | undefined): PublicBotMenu | null {
  if (!serverId || !botId) return null;
  return byServer.get(serverId)?.get(botId) ?? null;
}
