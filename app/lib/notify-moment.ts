/**
 * A good moment to offer notifications: you just sent something, or someone
 * wrote to you. The chat raises it; app/components/notify-prompt.tsx decides
 * whether to ask, with mayOfferNotifications below.
 */
import { isNativeApp } from "./native-app";

export const NOTIFY_MOMENT = "hoffle:notify-moment";

export type NotifyMomentReason = "sent" | "dm" | "mention";

export function notifyMoment(reason: NotifyMomentReason): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NotifyMomentReason>(NOTIFY_MOMENT, { detail: reason }));
}

const SNOOZE_KEY = "hoffle-notify-prompt";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
/** After this many "Not now"s it stops asking; Settings → Notifications stays. */
export const MAX_SNOOZES = 2;

/**
 * Whether to offer: the browser can notify, nobody has answered its question
 * yet, and this person has not turned notifications off or said "not now"
 * lately. The desktop and phone apps notify through their own shells, and an
 * iPhone in Safari (no Notification at all there) is told about the Home
 * Screen by InstallPrompt instead.
 */
export function mayOfferNotifications(now: number = Date.now()): boolean {
  if (typeof window === "undefined" || typeof Notification === "undefined") return false;
  if (!("serviceWorker" in navigator) || Notification.permission !== "default") return false;
  const shell = window as unknown as { huddle?: unknown; __TAURI__?: unknown };
  if (shell.huddle || shell.__TAURI__ || isNativeApp()) return false;
  try {
    if (localStorage.getItem("huddle-notify") === "off") return false;
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (raw) {
      const snooze = JSON.parse(raw) as { until?: number; count?: number };
      if ((snooze.count ?? 0) >= MAX_SNOOZES || now < (snooze.until ?? 0)) return false;
    }
  } catch {
    // Without storage a "Not now" can't be remembered, so don't ask at all.
    return false;
  }
  return true;
}

/** "Not now": quiet for a week, and for good after MAX_SNOOZES of them. */
export function snoozeNotifyPrompt(now: number = Date.now()): void {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    const count = (raw ? (JSON.parse(raw) as { count?: number }).count ?? 0 : 0) + 1;
    localStorage.setItem(SNOOZE_KEY, JSON.stringify({ until: now + SNOOZE_MS, count }));
  } catch {}
}
