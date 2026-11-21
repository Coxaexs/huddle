"use client";

import { isGameLink } from "@/lib/steam";

type Shell = { openGameLink?: (url: string) => unknown };

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
