"use client";

import { isGameLink } from "@/lib/steam";

type Shell = {
  openGameLink?: (url: string) => unknown;
  queueGameJoin?: (game: string, data: { inviteCode: string }) => Promise<boolean> | boolean;
};

/** Where the Stardew mod can be downloaded (public/mods/). */
export const STARDEW_MOD_URL = "/hangout/mods/HofflePlayTogether-Stardew-1.0.0.zip";

/** Per game, from the desktop app's last scan: is its Hoffle mod installed here? */
const localMods = new Map<string, boolean>();

/** Called by the activity detector with each desktop scan's `play` part. */
export function rememberLocalPlay(play: Record<string, { mod?: boolean } | undefined> | null | undefined): void {
  if (!play) return;
  for (const [game, state] of Object.entries(play)) localMods.set(game, Boolean(state?.mod));
}

/** The Hoffle mod for this game is installed on this computer (it has run once). */
export function hasGameMod(game: string): boolean {
  return localMods.get(game) === true;
}

/**
 * Hands an invite code to the game's Hoffle mod, which joins from the title
 * screen. Only desktop apps that know how; false otherwise.
 */
export async function queueGameJoin(game: string, inviteCode: string): Promise<boolean> {
  const desktop = shell();
  if (!desktop?.queueGameJoin || !hasGameMod(game)) return false;
  try {
    return Boolean(await desktop.queueGameJoin(game, { inviteCode }));
  } catch {
    return false;
  }
}

function shell(): Shell | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { huddle?: Shell }).huddle ?? null;
}

/** The desktop app can start games itself, with no extra click or browser prompt. */
export function opensGamesDirectly(): boolean {
  return typeof shell()?.openGameLink === "function";
}

/**
 * Opens a `steam://` link (lib/steam.ts GAME_LINK_PATTERN only):
 * - desktop apps with the bridge open it straight away;
 * - older desktop apps can't, so it goes through /api/play/launch in the
 *   system browser, which hands it to Steam;
 * - a browser opens it itself (it may ask "Open Steam?").
 */
export function openGameLink(url: string): boolean {
  if (!isGameLink(url)) return false;
  const desktop = shell();
  if (desktop?.openGameLink) {
    void Promise.resolve(desktop.openGameLink(url)).catch(() => undefined);
    return true;
  }
  if (desktop) {
    window.open(`${window.location.origin}/hangout/api/play/launch?to=${encodeURIComponent(url)}`, "_blank");
    return true;
  }
  window.location.href = url;
  return true;
}
