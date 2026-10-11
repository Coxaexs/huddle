/**
 * Fullscreen that works wherever the page runs. Browsers and Electron have the
 * Fullscreen API; the Mac webview Tauri uses (WKWebView) and other embedded
 * webviews do not. There the element fills the whole window instead, and the
 * window itself goes fullscreen when the desktop shell lets us (Tauri's window
 * API), so a shared screen or the Living Room really does fill the display.
 */

const PSEUDO_CLASS = "huddle-pseudo-fullscreen";
const STYLE_ID = "huddle-pseudo-fullscreen-style";
const STYLE = `.${PSEUDO_CLASS} { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; z-index: 2147483000 !important; border-radius: 0 !important; margin: 0 !important; transform: none !important; background: #000; }`;

interface TauriWindow { setFullscreen: (on: boolean) => Promise<void> }
interface TauriShell { window?: { getCurrentWindow?: () => TauriWindow } }

/** Asks the Tauri shell to take its whole window fullscreen (or back); false where there is no such shell or it refused. */
export async function setWindowFullscreen(on: boolean): Promise<boolean> {
  const win = (globalThis as { __TAURI__?: TauriShell }).__TAURI__?.window?.getCurrentWindow?.();
  if (!win) return false;
  try {
    await win.setFullscreen(on);
    return true;
  } catch {
    // The shell was built without that permission: the page still fills its window.
    return false;
  }
}

let pseudo: HTMLElement | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const onEscape = (event: KeyboardEvent) => {
  if (event.key === "Escape" && pseudo) exitPseudo();
};

function enterPseudo(element: HTMLElement) {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  if (pseudo && pseudo !== element) pseudo.classList.remove(PSEUDO_CLASS);
  pseudo = element;
  element.classList.add(PSEUDO_CLASS);
  window.addEventListener("keydown", onEscape, true);
  void setWindowFullscreen(true);
  notify();
}

function exitPseudo() {
  if (!pseudo) return;
  pseudo.classList.remove(PSEUDO_CLASS);
  pseudo = null;
  window.removeEventListener("keydown", onEscape, true);
  void setWindowFullscreen(false);
  notify();
}

/** Whether `element` is fullscreen, by the real API or by filling the window. */
export const isFullscreen = (element: Element | null): boolean =>
  Boolean(element) && (document.fullscreenElement === element || pseudo === element);

/** Calls back whenever anything enters or leaves fullscreen; returns the way to stop. */
export function onFullscreenChange(callback: () => void): () => void {
  document.addEventListener("fullscreenchange", callback);
  listeners.add(callback);
  return () => {
    document.removeEventListener("fullscreenchange", callback);
    listeners.delete(callback);
  };
}

/** Enters fullscreen with `element`, or leaves it if it is already there. */
export async function toggleFullscreen(element: HTMLElement | null): Promise<void> {
  if (!element) return;
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined);
    return;
  }
  if (pseudo) {
    exitPseudo();
    return;
  }
  if (element.requestFullscreen && document.fullscreenEnabled !== false) {
    try {
      await element.requestFullscreen();
      return;
    } catch {
      // Refused (embedded webviews do): fill the window instead.
    }
  }
  enterPseudo(element);
}
