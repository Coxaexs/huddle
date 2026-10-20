"use client";

import { useEffect, useRef, useState } from "react";
import { isParticlesEnabled } from "../lib/theme-fx";

const THEME_ID = "star-wars";
/** How long a hyperspace jump lasts, start to finish. */
const JUMP_MS = 1300;
/** Cruising speed and top speed, in depth units per second (a star starts at depth 1). */
const CRUISE = 0.012;
const LIGHTSPEED = 2.4;
/** Between jumps the field only drifts, so ~30 fps is plenty. */
const CRUISE_FRAME_MS = 33;

interface Star {
  x: number;
  y: number;
  z: number;
  tint: string;
  twinkle: number;
}

const TINTS = ["255, 255, 255", "255, 255, 255", "255, 255, 255", "206, 224, 255", "180, 205, 255", "255, 236, 200"];

function useStarWarsTheme(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setOn(root.dataset.customThemeId === THEME_ID && isParticlesEnabled());
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-custom-theme-id", "data-particles"] });
    window.addEventListener("huddle-particles-change", read);
    return () => {
      observer.disconnect();
      window.removeEventListener("huddle-particles-change", read);
    };
  }, []);
  return on;
}

/**
 * Puts a star somewhere on screen at a random depth (or far away, for one
 * that just flew past): `spreadX`/`spreadY` are half the screen in projected
 * units, so stars land evenly over the window instead of bunching up.
 */
function spawn(star: Partial<Star>, far: boolean, spreadX: number, spreadY: number): Star {
  const z = far ? 0.7 + Math.random() * 0.3 : 0.06 + Math.random() * 0.94;
  star.z = z;
  star.x = (Math.random() * 2 - 1) * spreadX * z;
  star.y = (Math.random() * 2 - 1) * spreadY * z;
  star.tint = TINTS[Math.floor(Math.random() * TINTS.length)];
  star.twinkle = Math.random() * Math.PI * 2;
  return star as Star;
}

/** 0 → 1 → 0 over the jump: a slow pull, the streak, then dropping out of it. */
function jumpSpeed(t: number): number {
  if (t < 0.32) return Math.pow(t / 0.32, 2.2);
  if (t < 0.72) return 1;
  return Math.pow(1 - (t - 0.72) / 0.28, 1.6);
}

/**
 * The Star Wars theme's sky: a fixed canvas of stars drifting slowly towards
 * the viewer, behind the app's slightly see-through panels. Changing
 * `jumpKey` (the server you're in) makes the jump to lightspeed: the stars
 * stretch into streaks and snap back. Paused while the tab is hidden, a single
 * still frame (and no jumps) for reduced motion, nothing under other themes.
 */
export function Starfield({ jumpKey }: { jumpKey?: string }) {
  const on = useStarWarsTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jumpRef = useRef<(() => void) | null>(null);
  const lastKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!on) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const root = document.documentElement;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let stars: Star[] = [];
    let width = 0;
    let height = 0;
    let scale = 1;
    let spreadX = 1;
    let spreadY = 1;
    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      scale = Math.max(width, height) * 0.55;
      spreadX = width / 2 / scale;
      spreadY = height / 2 / scale;
      const count = Math.min(900, Math.max(160, Math.round((width * height) / 2000)));
      stars = Array.from({ length: count }, () => spawn({}, false, spreadX, spreadY));
    };
    resize();
    window.addEventListener("resize", resize);

    let jumpStart = -1;
    const draw = (now: number, dt: number) => {
      const cx = width / 2;
      const cy = height / 2;
      const t = jumpStart < 0 ? -1 : (now - jumpStart) / JUMP_MS;
      if (t >= 1) {
        jumpStart = -1;
        delete root.dataset.hyperspace;
      }
      const boost = t >= 0 && t < 1 ? jumpSpeed(t) : 0;
      const speed = CRUISE + (LIGHTSPEED - CRUISE) * boost;

      ctx.clearRect(0, 0, width, height);
      if (boost > 0) {
        // The blue-white glow at the vanishing point while the streaks run.
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.9);
        glow.addColorStop(0, `rgba(190, 220, 255, ${0.28 * boost})`);
        glow.addColorStop(0.35, `rgba(90, 140, 255, ${0.1 * boost})`);
        glow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.lineCap = "round";
      for (const star of stars) {
        star.z -= speed * dt;
        if (star.z <= 0.02) spawn(star, true, spreadX, spreadY);
        const sx = cx + (star.x / star.z) * scale;
        const sy = cy + (star.y / star.z) * scale;
        if (sx < -50 || sx > width + 50 || sy < -50 || sy > height + 50) {
          spawn(star, true, spreadX, spreadY);
          continue;
        }
        const near = 1 - star.z;
        if (boost > 0.02) {
          // A streak back along the star's path; longer the faster we go.
          const tz = Math.min(1.2, star.z + speed * 0.07);
          const tx = cx + (star.x / tz) * scale;
          const ty = cy + (star.y / tz) * scale;
          ctx.strokeStyle = `rgba(215, 232, 255, ${Math.min(1, 0.25 + near) * (0.5 + boost / 2)})`;
          ctx.lineWidth = 0.6 + near * 1.8;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        } else {
          star.twinkle += dt * 2.2;
          const alpha = Math.min(1, 0.4 + near * 0.75) * (0.75 + Math.sin(star.twinkle) * 0.25);
          const size = 1 + near * near * 1.8;
          ctx.fillStyle = `rgba(${star.tint}, ${alpha})`;
          ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
        }
      }
    };

    if (reduced) {
      draw(performance.now(), 0);
      jumpRef.current = null;
      return () => window.removeEventListener("resize", resize);
    }

    let frame = 0;
    let last = performance.now();
    let lastDraw = 0;
    const loop = (now: number) => {
      frame = window.requestAnimationFrame(loop);
      if (document.hidden) {
        last = now;
        return;
      }
      // Smooth while jumping; a calm ~30 fps the rest of the time.
      if (jumpStart < 0 && now - lastDraw < CRUISE_FRAME_MS) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      lastDraw = now;
      draw(now, dt);
    };
    frame = window.requestAnimationFrame(loop);
    jumpRef.current = () => {
      if (document.hidden) return;
      jumpStart = performance.now();
      root.dataset.hyperspace = "on";
    };
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      jumpRef.current = null;
      delete root.dataset.hyperspace;
    };
  }, [on]);

  useEffect(() => {
    // Only a move from one place to another; the first server loading isn't one.
    if (jumpKey && lastKey.current && jumpKey !== lastKey.current) jumpRef.current?.();
    lastKey.current = jumpKey;
  }, [jumpKey, on]);

  if (!on) return null;
  return <canvas ref={canvasRef} className="starfield" aria-hidden="true" />;
}
