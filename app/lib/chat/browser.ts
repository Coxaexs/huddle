/** Browser side effects for the chat shell: file picker, notifications, sounds. */

import { playPresetSound } from "@/lib/soundboard-presets";
import { stripTextStyle } from "@/lib/text-style";
import { showPageNotification } from "../web-push";

/** Opens a one-shot file dialog and resolves with the chosen image. */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0] || null);
    // A cancelled dialog fires nothing in some browsers; resolve on focus back.
    window.addEventListener(
      "focus",
      () => window.setTimeout(() => resolve(input.files?.[0] || null), 400),
      { once: true },
    );
    input.click();
  });
}

/** Fires a desktop/web notification, unless the user turned them off. Only
 *  fires when the tab is not the focused/visible one — if you're looking at
 *  the app, the unread badge already tells you. Supports desktop native bridge. */
export function showNotification(rawTitle: string, rawBody: string, tag?: string): void {
  const title = stripTextStyle(rawTitle);
  const body = stripTextStyle(rawBody);
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem("huddle-notify") === "off") return;
    // Don't pop a notification while the user is actively focused on the app; the
    // in-app unread badge is the cue there.
    if (typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus()) return;

    // Desktop shell (Electron) native notification
    const win = typeof window !== "undefined" ? (window as unknown as { huddle?: { notify?: (t: string, b: string) => void } }) : null;
    if (win?.huddle?.notify) {
      win.huddle.notify(title, body);
      return;
    }

    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    void showPageNotification(title, body, tag).catch(() => undefined);
  } catch {
    // Notifications are best-effort.
  }
}

/** Plays a soundboard clip locally (everyone in the room hears their own copy). */
export function playSound(url: string, volume = 0.7): void {
  try {
    const savedVol = typeof localStorage !== "undefined" ? parseFloat(localStorage.getItem("huddle_soundboard_volume") || "0.7") : 0.7;
    const effVol = isNaN(savedVol) ? volume : Math.max(0, Math.min(1, savedVol));
    if (url.startsWith("preset:")) {
      playPresetSound(url.slice(7), effVol);
      return;
    }
    const audio = new Audio(url);
    audio.volume = effVol;
    void audio.play().catch(() => undefined);
  } catch {
    // Non-fatal: a blocked autoplay just means no sound this time.
  }
}
