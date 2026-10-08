"use client";

import { useEffect, useRef, useState } from "react";

/** Katakana, digits and a few code symbols, as on the film's screens. */
const GLYPHS =
  "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:=*+-<>|¦";
const CELL = 18;
const FRAME_MS = 50;

function useMatrixTheme(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setOn(root.dataset.customThemeId === "matrix");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-custom-theme-id"] });
    return () => observer.disconnect();
  }, []);
  return on;
}

/**
 * The Matrix theme's digital rain: a fixed canvas behind the app, seen through
 * its slightly transparent panels. Drawn at ~20 fps and device-pixel ratio 1,
 * paused while the tab is hidden, and a single still frame for anyone who
 * asked for reduced motion. Renders nothing under any other theme.
 */
export function MatrixRain() {
  const on = useMatrixTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!on) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let columns: number[] = [];
    let speeds: number[] = [];
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const count = Math.ceil(canvas.width / CELL);
      columns = Array.from({ length: count }, () => Math.random() * -60);
      speeds = Array.from({ length: count }, () => 0.35 + Math.random() * 0.75);
      ctx.fillStyle = "#000400";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    const step = () => {
      // Fade what is there, so each column leaves a trail.
      ctx.fillStyle = "rgba(0, 4, 0, 0.12)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${CELL - 3}px "Share Tech Mono", ui-monospace, monospace`;
      ctx.textBaseline = "top";
      for (let i = 0; i < columns.length; i++) {
        const row = Math.floor(columns[i]);
        if (row >= 0) {
          const x = i * CELL;
          const y = row * CELL;
          // The trail just above the head, in the theme's green...
          ctx.fillStyle = "rgba(0, 200, 80, 0.85)";
          ctx.fillText(glyph(), x, y - CELL);
          // ...and the head itself, nearly white.
          ctx.fillStyle = "#d8ffe4";
          ctx.fillText(glyph(), x, y);
        }
        columns[i] += speeds[i];
        if (columns[i] * CELL > canvas.height && Math.random() > 0.975) {
          columns[i] = Math.random() * -20;
          speeds[i] = 0.35 + Math.random() * 0.75;
        }
      }
    };

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // A still frame of rain, no animation.
      for (let k = 0; k < 120; k++) step();
      return () => window.removeEventListener("resize", resize);
    }

    let timer = 0;
    const loop = () => {
      if (!document.hidden) step();
      timer = window.setTimeout(loop, FRAME_MS);
    };
    loop();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
    };
  }, [on]);

  if (!on) return null;
  return <canvas ref={canvasRef} className="matrix-rain" aria-hidden="true" />;
}
