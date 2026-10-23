/**
 * The Tauri desktop shell talks to the page with its own events, where the
 * Electron one sends DOM events. This turns the first into the second, so the
 * rest of the app has one thing to listen for.
 */

interface TauriEvents {
  event?: { listen?: (name: string, handler: () => void) => Promise<() => void> };
  core?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
}

/** The global mute shortcut (Cmd/Ctrl+Shift+M) arrives from Tauri as "huddle:toggle-mute". Returns the way to stop listening. */
export function installTauriHotkeys(): () => void {
  const listen = (globalThis as { __TAURI__?: TauriEvents }).__TAURI__?.event?.listen;
  if (!listen) return () => undefined;
  let stop: (() => void) | null = null;
  let gone = false;
  void listen("huddle:toggle-mute", () => {
    window.dispatchEvent(new CustomEvent("huddle-hotkey", { detail: "toggle-mute" }));
  }).then((off) => { if (gone) off(); else stop = off; }).catch(() => undefined);
  return () => { gone = true; stop?.(); };
}

/** True inside the Tauri shell, where some browser features (screen capture, fullscreen) are missing. */
export const inTauriShell = (): boolean => Boolean((globalThis as { __TAURI__?: unknown }).__TAURI__);

/**
 * Tells Hoffle Lite whether a call is live, so its self-update never restarts
 * the app in the middle of one (src-tauri/src/updater.rs). Lite builds from
 * before 2.1 have no such command, which is fine.
 */
export function tellTauriInCall(on: boolean): void {
  const invoke = (globalThis as { __TAURI__?: TauriEvents }).__TAURI__?.core?.invoke;
  void invoke?.("set_in_call", { on }).catch(() => undefined);
}
