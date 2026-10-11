/**
 * Theme click effects: pressing a button (mute, deafen, send, anything) lets
 * a little of the theme spill out of it. Vampire drips blood, Matrix rains
 * glyphs, Cyberpunk glitches, and every other theme has its own.
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
): HTMLElement | null {
  if (!layer || live >= MAX_PARTICLES) return null;
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
    return el;
  }
  const animation = el.animate(keyframes, { fill: "forwards", ...options });
  animation.onfinish = done;
  animation.oncancel = done;
  return el;
}

/**
 * Blood that wells at the bottom edge, runs down in a thin stream with a
 * heavy bead at its tip, then the bead lets go, falls and splats while the
 * stream thins out and fades.
 */
const blood: Spawn = (_layer, rect, x) => {
  const count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i += 1) {
    const offset = i === 0 ? rand(-5, 5) : (i % 2 === 1 ? rand(14, 28) : -rand(14, 28));
    const left = Math.min(rect.right - 6, Math.max(rect.left + 6, x + offset));
    const top = rect.bottom;
    const run = rand(14, 30);
    const fall = rand(36, 70);
    const total = rand(1300, 1700);
    const delay = i * rand(120, 240);
    const options = { duration: total, delay, easing: "linear" } as const;
    // Pool clinging to the edge.
    particle("fx-blood-pool", left, top, [
      { transform: "translate(-50%, 0) scale(0.2, 0.2)", opacity: 0 },
      { transform: "translate(-50%, 0) scale(1, 1)", opacity: 1, offset: 0.15 },
      { transform: "translate(-50%, 0) scale(1, 1)", opacity: 1, offset: 0.5 },
      { transform: "translate(-50%, 0) scale(0.6, 0.5)", opacity: 0 },
    ], options);
    // Stream: grows while the bead runs, then retracts upwards and fades.
    particle("fx-blood-stream", left, top, [
      { height: "0px", opacity: 1, easing: "cubic-bezier(.3,.6,.4,1)" },
      { height: `${run}px`, opacity: 1, offset: 0.4 },
      { height: `${run * 0.9}px`, opacity: 0.9, offset: 0.55, easing: "ease-in" },
      { height: `${run * 0.15}px`, opacity: 0 },
    ], options);
    // Bead: swells at the tip, detaches at 40%, falls, stretching as it speeds up.
    particle("fx-blood-bead", left, top, [
      { transform: "translateY(0) scale(0.5, 0.5)", opacity: 1, easing: "cubic-bezier(.3,.6,.4,1)" },
      { transform: `translateY(${run}px) scale(1, 1.05)`, opacity: 1, offset: 0.4, easing: "cubic-bezier(.5,0,.9,.5)" },
      { transform: `translateY(${run + fall}px) scale(0.8, 1.45)`, opacity: 1, offset: 0.72 },
      { transform: `translateY(${run + fall + 2}px) scale(0.8, 1.45)`, opacity: 0, offset: 0.73 },
      { transform: `translateY(${run + fall + 2}px) scale(0.8, 1.45)`, opacity: 0 },
    ], options);
    // Splat where it lands.
    particle("fx-blood-splat", left, top + run + fall, [
      { transform: "translate(-50%, -50%) scale(0, 0)", opacity: 0 },
      { transform: "translate(-50%, -50%) scale(0, 0)", opacity: 0, offset: 0.72 },
      { transform: "translate(-50%, -50%) scale(1, 1)", opacity: 0.9, offset: 0.78 },
      { transform: "translate(-50%, -50%) scale(1.4, 0.8)", opacity: 0 },
    ], options);
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

/** Glitch: an RGB-split outline pulse and torn slices that jitter across the button. */
const neon: Spawn = (_layer, rect, x) => {
  const box = (className: string, to: number, ms: number) => {
    const el = particle(className, rect.left, rect.top, [
      { transform: "scale(1)", opacity: 0.9 },
      { transform: `scale(${to})`, opacity: 0 },
    ], { duration: ms, easing: "cubic-bezier(.1,.7,.3,1)" });
    if (el) {
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
    }
  };
  box("fx-neon-box", 1.18, 420);
  box("fx-neon-box fx-neon-box-b", 1.32, 520);
  for (let i = 0; i < 4; i += 1) {
    const h = rand(2, Math.max(3, rect.height / 3));
    const dx = rand(6, 16) * (Math.random() < 0.5 ? -1 : 1);
    const el = particle(i % 2 ? "fx-slice fx-slice-b" : "fx-slice", rect.left, rect.top + rand(0, rect.height - h), [
      { transform: "translateX(0)", opacity: 0 },
      { transform: `translateX(${dx}px)`, opacity: 0.85, offset: 0.2 },
      { transform: `translateX(${-dx * 0.6}px)`, opacity: 0.5, offset: 0.5 },
      { transform: `translateX(${dx * 0.3}px)`, opacity: 0.8, offset: 0.7 },
      { transform: "translateX(0)", opacity: 0 },
    ], { duration: rand(260, 380), delay: i * 45, easing: "steps(5)" });
    if (el) {
      el.style.width = `${rect.width}px`;
      el.style.height = `${h}px`;
    }
  }
  for (let i = 0; i < 5; i += 1) {
    const side = Math.random() < 0.5 ? -1 : 1;
    particle("fx-pixel", x + rand(-rect.width / 2, rect.width / 2), rect.top + rand(0, rect.height), [
      { transform: "translate(0, 0)", opacity: 1 },
      { transform: `translate(${side * rand(8, 26)}px, ${rand(-14, 14)}px)`, opacity: 0 },
    ], { duration: rand(300, 520), delay: rand(0, 120), easing: "steps(4)" });
  }
};

/** Embers lifting off the button: they sway, cool from yellow to red and die out. */
const embers: Spawn = (_layer, rect) => {
  const glow = particle("fx-amber-glow", rect.left, rect.top, [
    { opacity: 0.7 },
    { opacity: 0 },
  ], { duration: 520, easing: "ease-out" });
  if (glow) {
    glow.style.width = `${rect.width}px`;
    glow.style.height = `${rect.height}px`;
  }
  for (let i = 0; i < 9; i += 1) {
    const size = rand(2, 4.5);
    const sway = rand(5, 14) * (Math.random() < 0.5 ? -1 : 1);
    const rise = rand(34, 78);
    const el = particle("fx-ember", rand(rect.left + 4, rect.right - 4), rect.top + rect.height * 0.4, [
      { transform: "translate(0, 0) scale(1)", opacity: 0, background: "#fff1b0" },
      { transform: `translate(${sway * 0.5}px, ${-rise * 0.25}px) scale(1)`, opacity: 1, offset: 0.12, background: "#ffc933" },
      { transform: `translate(${-sway * 0.6}px, ${-rise * 0.55}px) scale(0.8)`, opacity: 0.95, offset: 0.45, background: "#ff8a00" },
      { transform: `translate(${sway}px, ${-rise * 0.8}px) scale(0.55)`, opacity: 0.6, offset: 0.75, background: "#d63a00" },
      { transform: `translate(${-sway * 0.4}px, ${-rise}px) scale(0.2)`, opacity: 0, background: "#7a1500" },
    ], { duration: rand(900, 1500), delay: rand(0, 180), easing: "ease-out" });
    if (el) {
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    }
  }
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
  amber: embers,
  "dark-academia": ink,
  midnight: floaters("fx-star", ["✦", "✧", "⋆"]),
  sunset: floaters("fx-petal", ["❀", "✿", "•"]),
  cozy: floaters("fx-heart", ["♥", "♡"]),
  msn: floaters("fx-msn", ["✶", "☺", "✦"]),
  "msn-dark": floaters("fx-msn", ["✶", "☺", "✦"]),
  light: ripple,
  legacy: ripple,
};

export function isThemeFxEnabled(themeId?: string): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    const pref = window.localStorage.getItem("huddle-theme-fx");
    if (pref === "on") return true;
    if (pref === "off") return false;
    const theme = themeId || document.documentElement.getAttribute("data-custom-theme-id") || "";
    // Default closed for cozy, light, and legacy themes
    if (theme === "cozy" || theme === "light" || theme === "legacy") {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export function setThemeFxEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem("huddle-theme-fx", enabled ? "on" : "off");
  } catch {
    // Ignore quota issues
  }
}

function enabled(): boolean {
  return isThemeFxEnabled();
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
