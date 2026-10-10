/**
 * Theme click effects: pressing a button (mute, deafen, send, anything) lets
 * a little of the theme spill out of it. Vampire drips blood, Matrix rains
 * glyphs, Cyberpunk throws neon sparks, and every other theme has its own.
 * Pure decoration: pointer-events none, capped in number, skipped when the
 * OS asks for reduced motion or `huddle-theme-fx` is "off" in localStorage.
 */

type Spawn = (layer: HTMLElement, rect: DOMRect, x: number) => void;

const MAX_PARTICLES = 40;
let layer: HTMLDivElement | null = null;
let live = 0;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function particle(
  className: string,
  left: number,
  top: number,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
  text?: string,
): void {
  if (!layer || live >= MAX_PARTICLES) return;
  const el = document.createElement("span");
  el.className = `theme-fx ${className}`;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  if (text) el.textContent = text;
  layer.appendChild(el);
  live += 1;
  const done = () => {
    el.remove();
    live -= 1;
  };
  if (typeof el.animate !== "function") {
    window.setTimeout(done, 600);
    return;
  }
  const animation = el.animate(keyframes, { fill: "forwards", ...options });
  animation.onfinish = done;
  animation.oncancel = done;
}

/** Drops that cling to the bottom edge, stretch, then fall. */
const blood: Spawn = (_layer, rect, x) => {
  const count = Math.random() < 0.5 ? 1 : 2;
  for (let i = 0; i < count; i += 1) {
    const left = Math.min(rect.right - 6, Math.max(rect.left + 4, x + rand(-10, 10)));
    const fall = rand(28, 60);
    particle("fx-blood", left, rect.bottom - 3, [
      { transform: "translateY(0) scale(0.7, 0.5)", opacity: 1 },
      { transform: "translateY(2px) scale(1, 1.25)", opacity: 1, offset: 0.35 },
      { transform: `translateY(${fall}px) scale(0.75, 1.6)`, opacity: 0.95, offset: 0.85 },
      { transform: `translateY(${fall + 6}px) scale(1.3, 0.35)`, opacity: 0 },
    ], { duration: rand(900, 1300), delay: i * 140, easing: "cubic-bezier(.55,0,.85,.4)" });
  }
};

const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ01ﾅﾆﾇﾈﾉ";
const glyphs: Spawn = (_layer, rect) => {
  for (let i = 0; i < 4; i += 1) {
    const char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    particle("fx-glyph", rand(rect.left, rect.right - 8), rect.bottom - 6, [
      { transform: "translateY(0)", opacity: 1 },
      { transform: `translateY(${rand(30, 55)}px)`, opacity: 0 },
    ], { duration: rand(700, 1000), delay: i * 70, easing: "linear" }, char);
  }
};

/** Sparks flung outwards, plus a short glitch bar across the button. */
function sparks(className: string, count: number, reach: number): Spawn {
  return (_layer, rect, x) => {
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const distance = rand(reach * 0.5, reach);
      particle(className, x, cy, [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        {
          transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0.2)`,
          opacity: 0,
        },
      ], { duration: rand(380, 620), easing: "cubic-bezier(.2,.8,.3,1)" });
    }
  };
}

const neon: Spawn = (l, rect, x) => {
  sparks("fx-neon", 7, 34)(l, rect, x);
  particle("fx-glitch", rect.left, rect.top + rect.height * rand(0.25, 0.7), [
    { transform: "scaleX(0)", opacity: 0.9 },
    { transform: "scaleX(1) translateX(4px)", opacity: 0.8, offset: 0.4 },
    { transform: "scaleX(1) translateX(-3px)", opacity: 0 },
  ], { duration: 260, easing: "steps(4)" });
  const bar = layer?.lastElementChild as HTMLElement | null;
  if (bar?.classList.contains("fx-glitch")) bar.style.width = `${rect.width}px`;
};

/** Symbols that float up and fade: hearts, stars, ink, petals. */
function floaters(className: string, symbols: string[], count = 3): Spawn {
  return (_layer, rect, x) => {
    for (let i = 0; i < count; i += 1) {
      const drift = rand(-16, 16);
      particle(className, x + rand(-8, 8), rect.top + 2, [
        { transform: "translate(0, 0) scale(0.6) rotate(0deg)", opacity: 0 },
        { transform: `translate(${drift * 0.4}px, -10px) scale(1)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${drift}px, -${rand(28, 42)}px) scale(0.8) rotate(${rand(-40, 40)}deg)`, opacity: 0 },
      ], { duration: rand(800, 1100), delay: i * 90, easing: "ease-out" },
      symbols[Math.floor(Math.random() * symbols.length)]);
    }
  };
}

/** Ink that falls from the button and spreads as a blot. */
const ink: Spawn = (_layer, rect, x) => {
  particle("fx-ink", x, rect.bottom - 2, [
    { transform: "translateY(0) scale(0.3)", opacity: 1 },
    { transform: "translateY(22px) scale(0.6, 1.2)", opacity: 1, offset: 0.55 },
    { transform: "translateY(26px) scale(1.6, 0.5)", opacity: 0 },
  ], { duration: 800, easing: "ease-in" });
  floaters("fx-gold", ["✦", "·"], 2)(_layer, rect, x);
};

const ripple: Spawn = (_layer, rect, x) => {
  particle("fx-ripple", x, rect.top + rect.height / 2, [
    { transform: "translate(-50%, -50%) scale(0)", opacity: 0.55 },
    { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
  ], { duration: 500, easing: "ease-out" });
};

const EFFECTS: Record<string, Spawn> = {
  vampire: blood,
  matrix: glyphs,
  cyberpunk: neon,
  amber: sparks("fx-ember", 6, 26),
  "dark-academia": ink,
  midnight: floaters("fx-star", ["✦", "✧", "⋆"]),
  sunset: floaters("fx-petal", ["❀", "✿", "•"]),
  cozy: floaters("fx-heart", ["♥", "♡"]),
  msn: floaters("fx-msn", ["✶", "☺", "✦"]),
  "msn-dark": floaters("fx-msn", ["✶", "☺", "✦"]),
  light: ripple,
  legacy: ripple,
};

function enabled(): boolean {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return window.localStorage.getItem("huddle-theme-fx") !== "off";
  } catch {
    return true;
  }
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const target = (event.target as Element | null)?.closest?.(
    "button:not(:disabled), [role='button']",
  ) as HTMLElement | null;
  if (!target) return;
  // Inside the 3D room and other canvases the effects would just be noise.
  if (target.closest("canvas, .no-theme-fx")) return;
  const theme = document.documentElement.getAttribute("data-custom-theme-id") || "";
  const spawn = EFFECTS[theme];
  if (!spawn || !enabled()) return;
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  if (!layer || !layer.isConnected) {
    layer = document.createElement("div");
    layer.className = "theme-fx-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }
  spawn(layer, rect, Math.min(rect.right - 4, Math.max(rect.left + 4, event.clientX)));
}

/** Starts listening; returns the cleanup. */
export function installThemeFx(): () => void {
  if (typeof window === "undefined") return () => undefined;
  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  return () => {
    document.removeEventListener("pointerdown", onPointerDown);
    layer?.remove();
    layer = null;
    live = 0;
  };
}
