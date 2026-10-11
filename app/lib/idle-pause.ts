/**
 * Stops the page's looping CSS animations while nobody is looking at it and no
 * call is live. Pulsing rings, glowing avatars and floating decorations keep
 * the GPU compositing every frame, which is a steady drain on a laptop battery
 * for a window sitting behind others. Taking focus back, or joining a call,
 * starts them again.
 */
const STYLE_ID = "huddle-idle-pause";
const RULE = 'html[data-idle="1"] *, html[data-idle="1"] *::before, html[data-idle="1"] *::after { animation-play-state: paused !important; }';

let inCall = false;
let installed = false;

const apply = () => {
  const idle = !inCall && (document.visibilityState === "hidden" || !document.hasFocus());
  if (idle) document.documentElement.dataset.idle = "1";
  else delete document.documentElement.dataset.idle;
};

/** Tell the pauser whether a call is live; calls keep every animation running. */
export function setIdlePauseCallActive(active: boolean) {
  inCall = active;
  if (installed) apply();
}

/** Installs the focus and visibility listeners once; returns a function that removes them. */
export function installIdlePause(): () => void {
  if (installed || typeof document === "undefined") return () => undefined;
  installed = true;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = RULE;
  document.head.appendChild(style);
  window.addEventListener("focus", apply);
  window.addEventListener("blur", apply);
  document.addEventListener("visibilitychange", apply);
  apply();
  return () => {
    installed = false;
    window.removeEventListener("focus", apply);
    window.removeEventListener("blur", apply);
    document.removeEventListener("visibilitychange", apply);
    style.remove();
    delete document.documentElement.dataset.idle;
  };
}
