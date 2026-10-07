/**
 * Winks, the real ones: Messenger's original Flash animations (public/winks,
 * from the MSN/Windows Live Messenger Winks Archive on archive.org), played
 * over the conversation window with a transparent background by Ruffle, a
 * Flash player written in Rust/WebAssembly (public/ruffle, MIT/Apache-2.0).
 *
 * Ruffle's ~14 MB wasm is only fetched the first time a wink plays (or the
 * Winks menu opens), so nobody pays for it until they use winks.
 */
import { basePath } from "./client";

interface RufflePlayerElement extends HTMLElement {
  ruffle(): {
    load(options: Record<string, unknown>): Promise<void>;
    metadata: { numFrames: number; frameRate: number } | null;
  };
}
interface RuffleSource {
  createPlayer(): RufflePlayerElement;
}
type RuffleGlobal = { config?: Record<string, unknown>; newest?: () => RuffleSource | null };
declare global {
  interface Window {
    RufflePlayer?: RuffleGlobal;
  }
}

const RUFFLE_DIR = `${basePath}/ruffle/`;

let ruffleReady: Promise<RuffleSource> | null = null;

/** Loads Ruffle once; later calls share the same promise. */
export function loadRuffle(): Promise<RuffleSource> {
  ruffleReady ||= new Promise<RuffleSource>((resolve, reject) => {
    window.RufflePlayer = window.RufflePlayer || {};
    window.RufflePlayer.config = {
      publicPath: RUFFLE_DIR,
      // Only ever play what we hand it; never rewrite <embed>/<object> on the page.
      polyfills: false,
      autoplay: "on",
      unmuteOverlay: "hidden",
      splashScreen: false,
      wmode: "transparent",
      backgroundColor: null,
      letterbox: "off",
      contextMenu: "off",
      showSwfDownload: false,
      warnOnUnsupportedContent: false,
      allowNetworking: "none",
      openUrlMode: "deny",
      allowScriptAccess: false,
      logLevel: "error",
    };
    const script = document.createElement("script");
    script.src = `${RUFFLE_DIR}ruffle.js`;
    script.async = true;
    script.onload = () => {
      const source = window.RufflePlayer?.newest?.();
      if (source) resolve(source);
      else reject(new Error("Ruffle didn't start"));
    };
    script.onerror = () => reject(new Error("Couldn't load Ruffle"));
    document.head.appendChild(script);
  }).catch((err) => {
    ruffleReady = null;
    throw err;
  });
  return ruffleReady;
}

/** Warms Ruffle up (e.g. when the Winks menu opens) so the first wink starts quickly. */
export function preloadWinkPlayer() {
  void loadRuffle().catch(() => undefined);
}

export const winkSwfUrl = (id: string) => `${basePath}/winks/${id}.swf`;
export const winkThumbUrl = (id: string) => `${basePath}/winks/${id}.png`;

const px = (n: number) => `${Math.round(n)}px`;

let current: { overlay: HTMLDivElement; timer: number } | null = null;

function stopCurrent() {
  if (!current) return;
  window.clearTimeout(current.timer);
  // Removing the player tears down its Flash instance and audio.
  current.overlay.remove();
  current = null;
}

/**
 * Plays a wink over the conversation window (or the whole screen when there
 * isn't one) for as long as its timeline runs. A click skips it. `muted`
 * plays it silently.
 */
export function playWinkScene(id: string, { muted = false }: { muted?: boolean } = {}) {
  stopCurrent();
  const host = document.querySelector<HTMLElement>(".chat-panel .messages");
  const rect = host?.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.className = "wk-overlay";
  overlay.setAttribute("aria-hidden", "true");
  if (rect && rect.width > 240 && rect.height > 200) {
    Object.assign(overlay.style, { left: px(rect.left), top: px(rect.top), width: px(rect.width), height: px(rect.height) });
  } else {
    Object.assign(overlay.style, { left: "0", top: "0", width: "100vw", height: "100dvh" });
  }
  // Clicks land on this shield rather than the movie, so a click always skips.
  const shield = document.createElement("div");
  shield.className = "wk-shield";
  overlay.appendChild(shield);
  document.body.appendChild(overlay);

  const mine = { overlay, timer: 0 };
  current = mine;
  const finish = (ms: number) => {
    window.clearTimeout(mine.timer);
    mine.timer = window.setTimeout(() => {
      if (current === mine) stopCurrent();
    }, ms);
  };
  shield.addEventListener("click", () => {
    if (current === mine) stopCurrent();
  });

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    // No animation: just the wink's still picture, briefly.
    const still = document.createElement("img");
    still.className = "wk-still";
    still.src = winkThumbUrl(id);
    still.alt = "";
    overlay.insertBefore(still, shield);
    finish(2500);
    return;
  }

  // If Ruffle is slow to arrive, don't leave a dead overlay over the chat.
  finish(20000);
  loadRuffle()
    .then((ruffle) => {
      if (current !== mine) return;
      const player = ruffle.createPlayer();
      player.className = "wk-player";
      player.addEventListener("loadedmetadata", () => {
        const meta = player.ruffle().metadata;
        const seconds = meta && meta.frameRate > 0 ? meta.numFrames / meta.frameRate : 8;
        // Winks run 2–16s; hold the last frame a moment like Messenger did.
        finish(Math.min(Math.max(seconds, 2), 18) * 1000 + 400);
      });
      overlay.insertBefore(player, shield);
      return player.ruffle().load({ url: winkSwfUrl(id), volume: muted ? 0 : 1 });
    })
    .catch(() => {
      if (current === mine) stopCurrent();
    });
}
