"use client";

import { useEffect } from "react";

const PRESSABLE = 'button, [role="button"], .channel, .voice-room, a.btn';

/** What each theme leaves behind where a button was pressed. */
const EFFECTS: Record<string, { kind: string; count: number; glyphs?: string; ms: number }> = {
  vampire: { kind: "blood", count: 3, ms: 1600 },
  cyberpunk: { kind: "spark", count: 6, ms: 500 },
  matrix: { kind: "glyph", count: 4, glyphs: "ｱｶｻﾀﾅﾊﾏ01", ms: 900 },
  cozy: { kind: "float", count: 3, glyphs: "♥✿♥", ms: 1000 },
  "dark-academia": { kind: "ink", count: 1, ms: 900 },
  amber: { kind: "ring", count: 1, ms: 500 },
  midnight: { kind: "float", count: 4, glyphs: "✦✧⋆", ms: 1000 },
  sunset: { kind: "ring", count: 2, ms: 700 },
  msn: { kind: "float", count: 3, glyphs: "✨☺♪", ms: 900 },
  "msn-dark": { kind: "float", count: 3, glyphs: "✨☺♪", ms: 900 },
  light: { kind: "ring", count: 1, ms: 450 },
};

const MAX_LIVE = 40;

/**
 * Small per-theme flourish on button presses: blood drips under Vampire, neon
 * sparks under Cyberpunk, falling glyphs under Matrix, and so on. Particles
 * are plain spans in a fixed, click-through layer, animated by CSS in
 * theme-flavors.css and removed when done. Off for reduced motion.
 */
export function ThemeClickFx() {
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const layer = document.createElement("div");
    layer.className = "click-fx-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    const onDown = (event: PointerEvent) => {
      if (motion.matches || event.button !== 0) return;
      const fx = EFFECTS[document.documentElement.dataset.customThemeId ?? ""];
      if (!fx) return;
      const target = (event.target as Element | null)?.closest?.(PRESSABLE);
      if (!target || (target as HTMLButtonElement).disabled) return;
      if (layer.childElementCount > MAX_LIVE) return;

      const rect = target.getBoundingClientRect();
      for (let i = 0; i < fx.count; i++) {
        const p = document.createElement("span");
        p.className = `click-fx click-fx-${fx.kind}`;
        let x = event.clientX;
        let y = event.clientY;
        if (fx.kind === "blood") {
          // Drips hang from the button's bottom edge, spread around the press.
          x = Math.min(rect.right - 4, Math.max(rect.left + 4, x + (Math.random() - 0.5) * Math.min(rect.width, 60)));
          y = rect.bottom - 2;
          p.style.setProperty("--len", `${14 + Math.random() * 26}px`);
          p.style.setProperty("--w", `${3 + Math.random() * 3}px`);
          p.style.animationDelay = `${i * 90}ms`;
        } else {
          const angle = Math.random() * Math.PI * 2;
          const dist = 18 + Math.random() * 22;
          p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
          p.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
          p.style.animationDelay = `${i * 60}ms`;
        }
        if (fx.glyphs) p.textContent = fx.glyphs[Math.floor(Math.random() * fx.glyphs.length)];
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        p.style.animationDuration = `${fx.ms}ms`;
        layer.appendChild(p);
        window.setTimeout(() => p.remove(), fx.ms + i * 90 + 50);
      }
    };

    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      layer.remove();
    };
  }, []);
  return null;
}
