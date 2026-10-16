"use client";

import { useEffect, useRef, useState } from "react";
import { isParticlesEnabled } from "../lib/theme-fx";
import { crimsonRonin, REAPER } from "./profile-fx-ronin";
import { ANTI_VENOM, CARNAGE, symbiote } from "./profile-fx-symbiote";
import { warpDisc } from "./profile-fx-warp";
import { bloodfall } from "./profile-fx-blood";
import { nightwing } from "./profile-fx-bats";

/*
 * Canvas-driven particle scenes for profile effects. These are too dense
 * (thousands of points) for SVG/CSS, so each scene is a tiny simulation
 * drawn with additive blending onto a canvas that fills the card.
 */

type Ctx = CanvasRenderingContext2D;

export interface Scene {
  /** Called on size change; (re)build particles for a W x H canvas in CSS px. */
  init(w: number, h: number, density: number): void;
  /** Advance and draw. t = seconds since start, dt = seconds since last frame. */
  frame(ctx: Ctx, t: number, dt: number): void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (v: number) => (v < 0.5 ? 2 * v * v : 1 - (-2 * v + 2) ** 2 / 2);
const easeOutCubic = (v: number) => 1 - (1 - v) ** 3;
const easeInQuart = (v: number) => v ** 4;

/* ------------------------------------------------------------------ */
/* Crimson Blade: a particle swordsman who winds up and cuts           */
/* ------------------------------------------------------------------ */

/** Point-in-polygon (even-odd). */
function inPoly(x: number, y: number, poly: number[][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Sample n points uniformly inside a polygon. */
function samplePoly(poly: number[][], n: number) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: number[][] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 40) {
    const x = rand(x0, x1);
    const y = rand(y0, y1);
    if (inPoly(x, y, poly)) out.push([x, y]);
  }
  return out;
}

// Rig in "figure units": origin at the hip, figure is ~1.1 tall, facing left.
const CLOAK = [
  [-0.12, -0.5], [0.04, -0.56], [0.2, -0.5], [0.3, -0.3], [0.42, -0.05], [0.6, 0.2], [0.85, 0.42],
  [0.5, 0.48], [0.15, 0.46], [-0.2, 0.42], [-0.34, 0.3], [-0.3, 0.05], [-0.36, -0.2], [-0.24, -0.4],
];
// Hood seen from the side, with a dark hollow where the face is.
const HOOD = [[-0.06, -0.58], [0.02, -0.74], [0.14, -0.78], [0.24, -0.7], [0.26, -0.56], [0.18, -0.48], [0.02, -0.48]];
const FACE = [[-0.02, -0.58], [0.04, -0.68], [0.12, -0.66], [0.13, -0.56], [0.06, -0.52]];
const SHOULDER = [0.02, -0.46];

type Part = 0 | 1 | 2 | 3; // 0 cloak, 1 arm, 2 blade, 3 hilt
interface BladeP {
  part: Part;
  lx: number; // local coordinates (meaning depends on part)
  ly: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  stiff: number;
  hot: number; // 0..1 brightness bias
}
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; hue: number }

const CYCLE = 4.2;
const IDLE_A = -1.15; // sword over the back shoulder, pointing up and back
const WIND_A = -0.75;
const CUT_A = -3.75; // forward and down

/** Sword angle (radians, screen space) for a moment in the cycle. */
function swordAngle(c: number) {
  if (c < 1.5) return IDLE_A + Math.sin(c * 2.4) * 0.03;
  if (c < 2.15) return IDLE_A + (WIND_A - IDLE_A) * easeInOut((c - 1.5) / 0.65);
  if (c < 2.38) return WIND_A + (CUT_A - WIND_A) * easeInQuart((c - 2.15) / 0.23);
  if (c < 2.95) return CUT_A + Math.sin(((c - 2.38) / 0.57) * Math.PI) * -0.08;
  return CUT_A + (IDLE_A - CUT_A) * easeInOut((c - 2.95) / (CYCLE - 2.95));
}

function crimsonBlade(): Scene {
  let W = 0, H = 0, S = 0, OX = 0, OY = 0;
  let ps: BladeP[] = [];
  let sparks: Spark[] = [];
  let streaks: { x: number; y: number; v: number; len: number; a: number; red: boolean }[] = [];
  let trail: { x: number; y: number; bx: number; by: number; life: number }[] = [];
  let lastCycle = -1;
  let flash = 0;
  let cutLine: { x0: number; y0: number; x1: number; y1: number; life: number } | null = null;

  const toScreen = (x: number, y: number): [number, number] => [OX + x * S, OY + y * S];

  return {
    init(w, h, density) {
      W = w; H = h;
      S = Math.min(w * 0.95, h * 0.78);
      OX = w * 0.56;
      OY = h * 0.66;
      const k = clamp01((w * h) / (340 * 480)) * 0.6 + 0.4;
      const n = Math.round(2200 * k * density);
      ps = [];
      const add = (part: Part, pts: number[][], stiff: [number, number], hot = 0) =>
        pts.forEach(([lx, ly]) => ps.push({ part, lx, ly, x: 0, y: 0, vx: 0, vy: 0, stiff: rand(...stiff), hot: hot + Math.random() * 0.3 }));

      const hood = samplePoly(HOOD, Math.round(n * 0.08)).filter(([x, y]) => !inPoly(x, y, FACE));
      add(0, samplePoly(CLOAK, Math.round(n * 0.5)), [10, 22]);
      add(0, hood, [14, 26], 0.1);
      // Arm: a sleeve from shoulder to hand, local = (t along arm, offset)
      add(1, Array.from({ length: Math.round(n * 0.1) }, () => [Math.random(), rand(-0.045, 0.045)]), [26, 40], 0.1);
      // Blade: local = (distance along blade, offset)
      add(2, Array.from({ length: Math.round(n * 0.24) }, () => {
        const d = Math.random() ** 0.85 * 0.78;
        const half = 0.026 * (1 - d / 0.85);
        return [d + 0.06, rand(-half, half)];
      }), [60, 90], 0.55);
      // Hilt + guard
      add(3, [
        ...Array.from({ length: Math.round(n * 0.03) }, () => [rand(-0.12, 0.04), rand(-0.016, 0.016)]),
        ...Array.from({ length: Math.round(n * 0.025) }, () => [rand(0.04, 0.07), rand(-0.07, 0.07)]),
      ], [60, 90], 0.4);

      streaks = Array.from({ length: Math.round(40 * k * density) }, () => ({
        x: Math.random() * w, y: Math.random() * h, v: rand(140, 380), len: rand(8, 26), a: rand(0.15, 0.55), red: Math.random() < 0.55,
      }));
      sparks = [];
      trail = [];
      lastCycle = -1;
      cutLine = null;
    },

    frame(ctx, t, dt) {
      const c = t % CYCLE;
      const cycleIdx = Math.floor(t / CYCLE);
      const a = swordAngle(c);
      const breathe = Math.sin(t * 1.7) * 0.006;
      // Arm follows the sword; the body leans into the cut.
      const armA = 3.3 - ((a - WIND_A) / (CUT_A - WIND_A)) * 0.9;
      const cutting = c > 2.15 && c < 2.6;
      const lean = c > 2.15 && c < 3.4 ? Math.sin(clamp01((c - 2.15) / 1.25) * Math.PI) * -0.05 : 0;
      const shX = SHOULDER[0] + lean;
      const shY = SHOULDER[1] + breathe + Math.abs(lean) * 0.4;
      const hx = shX + Math.cos(armA) * 0.26;
      const hy = shY + Math.sin(armA) * 0.26;
      const ca = Math.cos(a), sa = Math.sin(a);

      // Spring every particle toward its rig target. Fast parts lag a little,
      // which gives the swing its smeared, cloth-and-steel motion.
      for (const p of ps) {
        let tx: number, ty: number;
        if (p.part === 0) {
          const sway = Math.sin(t * 1.3 + p.ly * 5 + p.lx * 3) * 0.01 * (p.ly + 0.6);
          tx = p.lx + sway + lean * clamp01(-p.ly * 2 + 0.2);
          ty = p.ly + breathe * (0.5 - p.ly);
        } else if (p.part === 1) {
          tx = shX + (hx - shX) * p.lx - Math.sin(armA) * p.ly;
          ty = shY + (hy - shY) * p.lx + Math.cos(armA) * p.ly;
        } else {
          tx = hx + ca * p.lx - sa * p.ly;
          ty = hy + sa * p.lx + ca * p.ly;
        }
        const [sx, sy] = toScreen(tx, ty);
        if (p.x === 0 && p.y === 0) { p.x = sx; p.y = sy; }
        const f = 1 - Math.exp(-p.stiff * dt);
        const nx = p.x + (sx - p.x) * f, ny = p.y + (sy - p.y) * f;
        p.vx = (nx - p.x) / Math.max(dt, 1e-3);
        p.vy = (ny - p.y) / Math.max(dt, 1e-3);
        p.x = nx;
        p.y = ny;
        // Cloak bleeds particles that drift off down and to the right.
        if (p.part === 0 && Math.random() < 0.004) {
          sparks.push({ x: p.x, y: p.y, vx: rand(10, 50), vy: rand(10, 60), life: 0, max: rand(0.6, 1.4), hue: rand(352, 372) });
        }
      }

      // Blade-tip trail during the cut.
      const [tipX, tipY] = toScreen(hx + ca * 0.84, hy + sa * 0.84);
      const [baseX, baseY] = toScreen(hx + ca * 0.12, hy + sa * 0.12);
      if (cutting) trail.push({ x: tipX, y: tipY, bx: baseX, by: baseY, life: 1 });

      // The moment the cut lands: flash, a slash line across the card, sparks.
      if (cycleIdx !== lastCycle && c > 2.38) {
        lastCycle = cycleIdx;
        flash = 1;
        const m = Math.max(W, H);
        const ang = -0.55;
        const cx = W * 0.38, cy = H * 0.52;
        cutLine = { x0: cx - Math.cos(ang) * m, y0: cy - Math.sin(ang) * m, x1: cx + Math.cos(ang) * m, y1: cy + Math.sin(ang) * m, life: 1 };
        for (let i = 0; i < 160; i++) {
          const u = Math.random();
          const sp = rand(60, 520);
          const dir = ang + (Math.random() < 0.5 ? -1 : 1) * Math.PI / 2 + rand(-0.6, 0.6);
          sparks.push({ x: cutLine.x0 + (cutLine.x1 - cutLine.x0) * u, y: cutLine.y0 + (cutLine.y1 - cutLine.y0) * u, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, life: 0, max: rand(0.35, 1.1), hue: rand(345, 375) });
        }
        for (let i = 0; i < 70; i++) {
          const dir = rand(0, Math.PI * 2), sp = rand(80, 420);
          sparks.push({ x: tipX, y: tipY, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, life: 0, max: rand(0.3, 0.8), hue: rand(10, 40) });
        }
      }

      /* ---- draw ---- */
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,40,40,${flash * 0.22})`;
        ctx.fillRect(0, 0, W, H);
        flash = Math.max(0, flash - dt * 3.5);
      }
      ctx.globalCompositeOperation = "lighter";

      // Diagonal ambient streaks
      ctx.lineWidth = 1;
      for (const s of streaks) {
        s.x -= s.v * 0.45 * dt;
        s.y += s.v * dt;
        if (s.y > H + 30 || s.x < -30) { s.y = -20; s.x = Math.random() * (W + 80); }
        ctx.strokeStyle = s.red ? `rgba(255,50,40,${s.a})` : `rgba(200,210,255,${s.a * 0.6})`;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + s.len * 0.42, s.y - s.len);
        ctx.stroke();
      }

      // Slash arc ribbon
      for (let i = trail.length - 1; i >= 0; i--) {
        const q = trail[i];
        q.life -= dt * 2.2;
        if (q.life <= 0) { trail.splice(i, 1); continue; }
        const nxt = trail[i + 1];
        if (!nxt) continue;
        ctx.fillStyle = `rgba(255,${60 + 140 * q.life},${40 + 60 * q.life},${q.life * 0.35})`;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(nxt.x, nxt.y);
        ctx.lineTo(nxt.bx * 0.4 + nxt.x * 0.6, nxt.by * 0.4 + nxt.y * 0.6);
        ctx.lineTo(q.bx * 0.4 + q.x * 0.6, q.by * 0.4 + q.y * 0.6);
        ctx.closePath();
        ctx.fill();
      }

      // Figure particles: short strokes along their velocity, so motion smears.
      for (const p of ps) {
        const v = Math.hypot(p.vx, p.vy);
        const heat = clamp01(p.hot + v / 900);
        const r = 255, g = Math.round(30 + heat * 150), b = Math.round(20 + heat * 70);
        const alpha = 0.45 + heat * 0.45;
        const len = Math.min(18, 1.6 + v * 0.02);
        const ux = v > 1 ? p.vx / v : 0.5, uy = v > 1 ? p.vy / v : 0.7;
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = p.part >= 2 ? 1.4 : 1.1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - ux * len, p.y - uy * len);
        ctx.stroke();
      }

      // Glow at the hands
      const [gx, gy] = toScreen(hx, hy);
      const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, S * 0.09);
      glow.addColorStop(0, "rgba(255,200,120,.9)");
      glow.addColorStop(0.3, "rgba(255,60,30,.45)");
      glow.addColorStop(1, "rgba(255,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(gx - S * 0.1, gy - S * 0.1, S * 0.2, S * 0.2);

      // Cut line
      if (cutLine) {
        const L = cutLine;
        const grow = easeOutCubic(clamp01((1 - L.life) * 6));
        const ex = L.x0 + (L.x1 - L.x0) * grow, ey = L.y0 + (L.y1 - L.y0) * grow;
        ctx.lineCap = "round";
        ctx.strokeStyle = `rgba(255,40,40,${L.life * 0.5})`;
        ctx.lineWidth = 9 * L.life;
        ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = `rgba(255,235,225,${L.life})`;
        ctx.lineWidth = 2 * L.life + 0.5;
        ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.lineCap = "butt";
        L.life -= dt * 1.4;
        if (L.life <= 0) cutLine = null;
      }

      // Sparks / shed particles
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += dt;
        if (s.life >= s.max) { sparks.splice(i, 1); continue; }
        s.vx *= 1 - dt * 1.8;
        s.vy = s.vy * (1 - dt * 1.8) + 120 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const f = 1 - s.life / s.max;
        ctx.strokeStyle = `hsla(${s.hue},100%,${55 + f * 25}%,${f})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
        ctx.stroke();
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Hyperdrive: a disc of light streaks rushing toward and past you     */
/* ------------------------------------------------------------------ */

function hyperdrive(): Scene {
  let W = 0, H = 0;
  let ps: { th: number; r: number; dz: number; dy: number; b: number }[] = [];
  const PERIOD = 2.6;
  return {
    init(w, h, density) {
      W = w; H = h;
      const k = clamp01((w * h) / (340 * 480)) * 0.6 + 0.4;
      ps = Array.from({ length: Math.round(2600 * k * density) }, () => ({
        th: Math.random() * Math.PI * 2,
        r: Math.sqrt(Math.random()),
        dz: rand(-0.25, 0.25),
        dy: rand(-1, 1),
        b: rand(0.4, 1),
      }));
    },
    frame(ctx, t) {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      const f = Math.min(W, H) * 0.9;
      const cx = W / 2, cy = H * 0.5;
      ctx.lineWidth = 1;
      // Two discs, half a period apart, so there's always one approaching.
      for (let pass = 0; pass < 2; pass++) {
        const ph = ((t / PERIOD + pass * 0.5) % 1);
        const zc = 9 - ph * 10.5; // far -> past the camera
        const spread = 0.12 + ph * 0.9; // the disc thickens as it nears
        const R = 3.2;
        const fadeIn = clamp01(ph * 6);
        for (const p of ps) {
          const x = Math.cos(p.th) * p.r * R;
          const z = zc + Math.sin(p.th) * p.r * R * 0.35 + p.dz;
          if (z < 0.08) continue;
          const y = 0.9 + p.dy * spread;
          const z2 = z + 0.12 + 0.25 / z;
          const sx = cx + (x / z) * f, sy = cy + (y / z) * f - f * 0.25;
          const ex = cx + (x / z2) * f, ey = cy + (y / z2) * f - f * 0.25;
          if ((sx < -20 && ex < -20) || (sx > W + 20 && ex > W + 20) || (sy > H + 20 && ey > H + 20) || (sy < -20 && ey < -20)) continue;
          const a = clamp01((1.6 / z) * p.b) * fadeIn;
          if (a < 0.03) continue;
          ctx.strokeStyle = `rgba(230,236,255,${a})`;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Astral Vortex: thousands of motes spiralling into a glowing core    */
/* ------------------------------------------------------------------ */

function astralVortex(): Scene {
  let W = 0, H = 0;
  let ps: { a: number; r: number; sp: number; hue: number; s: number }[] = [];
  return {
    init(w, h, density) {
      W = w; H = h;
      const k = clamp01((w * h) / (340 * 480)) * 0.6 + 0.4;
      ps = Array.from({ length: Math.round(1600 * k * density) }, () => ({
        a: Math.random() * Math.PI * 2,
        r: Math.random(),
        sp: rand(0.05, 0.16),
        hue: Math.random() < 0.7 ? rand(250, 290) : rand(180, 200),
        s: rand(0.6, 1.8),
      }));
    },
    frame(ctx, _t, dt) {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      const cx = W / 2, cy = H * 0.42, M = Math.hypot(W, H) * 0.6;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, M * 0.25);
      core.addColorStop(0, "rgba(220,200,255,.55)");
      core.addColorStop(0.25, "rgba(140,90,255,.2)");
      core.addColorStop(1, "rgba(60,0,120,0)");
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, W, H);
      for (const p of ps) {
        const pa = p.a, pr = p.r;
        p.r -= p.sp * dt * (0.4 + p.r);
        p.a += dt * (0.5 / (p.r + 0.08));
        if (p.r < 0.015) { p.r = 1; p.a = Math.random() * Math.PI * 2; continue; }
        const x0 = cx + Math.cos(pa) * pr * M, y0 = cy + Math.sin(pa) * pr * M * 0.62;
        const x1 = cx + Math.cos(p.a) * p.r * M, y1 = cy + Math.sin(p.a) * p.r * M * 0.62;
        ctx.strokeStyle = `hsla(${p.hue},100%,${60 + (1 - p.r) * 30}%,${clamp01((1 - p.r) * 1.2) * 0.9})`;
        ctx.lineWidth = p.s;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Shared: tapered, wriggling tendrils                                 */
/* ------------------------------------------------------------------ */

type Pt = [number, number];

interface Tendril { bx: number; by: number; ang: number; len: number; w: number; ph: number; sp: number; amp: number; curl: number }

/** Points along a tendril whose bend travels from root to tip. */
function tendrilPts(td: Tendril, t: number, lenMul = 1, n = 22): Pt[] {
  const pts: Pt[] = [[td.bx, td.by]];
  const step = (td.len * lenMul) / n;
  let x = td.bx, y = td.by;
  for (let i = 1; i <= n; i++) {
    const s = i / n;
    const a = td.ang + Math.sin(t * td.sp - s * 4 + td.ph) * td.amp * s + td.curl * s * s;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y]);
  }
  return pts;
}

/** Stroke a polyline that tapers from w0 at the root to a point. */
function strokeTaper(ctx: Ctx, pts: Pt[], w0: number, color: string, taper = 0.9) {
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (let i = 0; i < pts.length - 1; i++) {
    ctx.lineWidth = w0 * (1 - i / (pts.length - 1)) ** taper + 0.6;
    ctx.beginPath();
    ctx.moveTo(pts[i][0], pts[i][1]);
    ctx.lineTo(pts[i + 1][0], pts[i + 1][1]);
    ctx.stroke();
  }
}

/** A glossy highlight running along one side of a tapered polyline. */
function strokeShine(ctx: Ctx, pts: Pt[], w0: number, color: string, side = -0.28) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.8, w0 * 0.12);
  ctx.beginPath();
  for (let i = 0; i < pts.length - 2; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const d = Math.hypot(x1 - x0, y1 - y0) || 1;
    const w = w0 * (1 - i / (pts.length - 1)) ** 0.9;
    const nx = (-(y1 - y0) / d) * w * side, ny = ((x1 - x0) / d) * w * side;
    if (i === 0) ctx.moveTo(x0 + nx, y0 + ny);
    else ctx.lineTo(x0 + nx, y0 + ny);
  }
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/* Kraken: tentacles curling up the sides and a giant eye from below   */
/* ------------------------------------------------------------------ */

function kraken(): Scene {
  let W = 0, H = 0;
  let arms: Tendril[] = [];
  let bubbles: { x: number; y: number; r: number; v: number }[] = [];
  const CYC = 7;
  return {
    init(w, h, density) {
      W = w; H = h;
      const m = Math.min(w, h);
      arms = [
        { bx: w * 0.02, by: h + 10, ang: -1.45, len: h * 0.8, w: m * 0.1, ph: 0, sp: 0.9, amp: 0.9, curl: 2.6 },
        { bx: w * 0.2, by: h + 20, ang: -1.75, len: h * 0.5, w: m * 0.08, ph: 2, sp: 1.1, amp: 1.1, curl: -2.8 },
        { bx: w * 0.98, by: h + 10, ang: -1.7, len: h * 0.78, w: m * 0.1, ph: 1, sp: 0.85, amp: 0.9, curl: -2.6 },
        { bx: w * 0.8, by: h + 20, ang: -1.4, len: h * 0.48, w: m * 0.08, ph: 3, sp: 1.2, amp: 1.1, curl: 2.8 },
      ];
      bubbles = Array.from({ length: Math.round(18 * density) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: rand(1.5, 5), v: rand(20, 55) }));
    },
    frame(ctx, t, dt) {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      const deep = ctx.createLinearGradient(0, H * 0.4, 0, H);
      deep.addColorStop(0, "rgba(10,30,60,0)");
      deep.addColorStop(1, "rgba(6,18,40,.75)");
      ctx.fillStyle = deep;
      ctx.fillRect(0, 0, W, H);

      // Giant eye rising from the deep
      const c = t % CYC;
      const rise = c < 1.5 ? 0 : c < 2.5 ? easeOutCubic(c - 1.5) : c < 5.5 ? 1 : c < 6.5 ? 1 - easeInOut(c - 5.5) : 0;
      if (rise > 0) {
        const R = Math.min(W, H) * 0.2;
        const ex = W / 2, ey = H + R * 0.6 - rise * R * 1.5;
        ctx.save();
        ctx.translate(ex, ey);
        const lid = (c > 3.8 && c < 3.95) ? 0.1 : 1;
        ctx.fillStyle = "#3b1a52";
        ctx.beginPath(); ctx.ellipse(0, 0, R * 1.35, R * 0.95, 0, 0, Math.PI * 2); ctx.fill();
        ctx.scale(1, lid);
        const iris = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        iris.addColorStop(0, "#fff7a0");
        iris.addColorStop(0.6, "#f2b81c");
        iris.addColorStop(1, "#8a4b00");
        ctx.fillStyle = iris;
        ctx.beginPath(); ctx.ellipse(0, 0, R * 1.05, R * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        const look = Math.sin(t * 0.9) * R * 0.3;
        ctx.fillStyle = "#0a0410";
        ctx.beginPath(); ctx.ellipse(look, 0, R * 0.5, R * 0.1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.8)";
        ctx.beginPath(); ctx.arc(-R * 0.35, -R * 0.25, R * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Tentacles with suckers on the inner curve
      for (const a of arms) {
        const reach = 0.85 + 0.15 * Math.sin(t * 0.6 + a.ph);
        const pts = tendrilPts(a, t, reach, 26);
        strokeTaper(ctx, pts, a.w + 4, "#24102f", 0.8);
        strokeTaper(ctx, pts, a.w, "#6b2f8e", 0.8);
        strokeShine(ctx, pts, a.w, "rgba(230,170,255,.35)", -0.3);
        const side = a.curl > 0 ? 1 : -1;
        for (let i = 2; i < pts.length - 3; i += 2) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
          const d = Math.hypot(x1 - x0, y1 - y0) || 1;
          const w = a.w * (1 - i / (pts.length - 1)) ** 0.8;
          const sx = x0 + (-(y1 - y0) / d) * w * 0.32 * side, sy = y0 + ((x1 - x0) / d) * w * 0.32 * side;
          ctx.fillStyle = "#f2c4e6";
          ctx.beginPath(); ctx.arc(sx, sy, w * 0.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#a45a9c";
          ctx.beginPath(); ctx.arc(sx, sy, w * 0.09, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Bubbles
      ctx.strokeStyle = "rgba(190,230,255,.6)";
      ctx.lineWidth = 1;
      for (const b of bubbles) {
        b.y -= b.v * dt;
        b.x += Math.sin(t * 2 + b.r * 3) * 10 * dt;
        if (b.y < -10) { b.y = H + 10; b.x = Math.random() * W; }
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Storm Serpent: a lightning dragon slithering around the card        */
/* ------------------------------------------------------------------ */

function stormSerpent(): Scene {
  let W = 0, H = 0, seg = 0, maxW = 0;
  let nodes: Pt[] = [];
  let bolts: { pts: Pt[]; life: number }[] = [];
  let flash = 0;
  const N = 56;
  return {
    init(w, h) {
      W = w; H = h;
      seg = Math.min(w, h) * 0.03;
      maxW = Math.min(w, h) * 0.06;
      nodes = Array.from({ length: N }, (_, i) => [w / 2 - i * seg, h / 2] as Pt);
      bolts = [];
    },
    frame(ctx, t, dt) {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      if (flash > 0) {
        ctx.fillStyle = `rgba(150,200,255,${flash * 0.18})`;
        ctx.fillRect(0, 0, W, H);
        flash = Math.max(0, flash - dt * 4);
      }

      // Head chases a wandering target; the body follows like a chain.
      const tx = W * (0.5 + 0.36 * Math.sin(t * 0.7) * Math.cos(t * 0.23));
      const ty = H * (0.5 + 0.36 * Math.sin(t * 1.05 + 1));
      const h0 = nodes[0];
      const f = 1 - Math.exp(-3 * dt);
      h0[0] += (tx - h0[0]) * f;
      h0[1] += (ty - h0[1]) * f;
      for (let i = 1; i < N; i++) {
        const [px, py] = nodes[i - 1];
        const n = nodes[i];
        const d = Math.hypot(n[0] - px, n[1] - py) || 1;
        n[0] = px + ((n[0] - px) / d) * seg;
        n[1] = py + ((n[1] - py) / d) * seg;
      }

      const width = (i: number) => maxW * (0.25 + 0.75 * Math.sin(Math.min(1, (1 - i / N) * 1.6) * Math.PI / 2)) * (i === 0 ? 1 : 1);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 16;
      for (let i = N - 1; i > 0; i--) {
        ctx.strokeStyle = `hsl(${200 - (i / N) * 30},90%,${45 + Math.sin(t * 6 - i * 0.4) * 10}%)`;
        ctx.lineWidth = width(i);
        ctx.beginPath(); ctx.moveTo(nodes[i][0], nodes[i][1]); ctx.lineTo(nodes[i - 1][0], nodes[i - 1][1]); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // Bright spine + dorsal fins
      ctx.strokeStyle = "rgba(235,250,255,.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      nodes.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.fillStyle = "rgba(180,230,255,.7)";
      for (let i = 3; i < N - 4; i += 3) {
        const [x0, y0] = nodes[i], [x1, y1] = nodes[i - 1];
        const d = Math.hypot(x1 - x0, y1 - y0) || 1;
        const nx = -(y1 - y0) / d, ny = (x1 - x0) / d;
        const w = width(i) * 0.5;
        ctx.beginPath();
        ctx.moveTo(x0 + nx * w, y0 + ny * w);
        ctx.lineTo(x0 + nx * w * 2.2 - (x1 - x0) * 0.6, y0 + ny * w * 2.2 - (y1 - y0) * 0.6);
        ctx.lineTo(x1 + nx * w, y1 + ny * w);
        ctx.fill();
      }

      // Head
      const [hx, hy] = nodes[0], [nx1, ny1] = nodes[2];
      const ang = Math.atan2(hy - ny1, hx - nx1);
      const s = maxW * 1.1;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(ang);
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowColor = "#7dd3fc";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#bfeaff";
      ctx.beginPath();
      ctx.moveTo(s * 1.3, 0);
      ctx.quadraticCurveTo(s * 0.6, -s * 0.7, -s * 0.5, -s * 0.55);
      ctx.lineTo(-s * 0.3, 0);
      ctx.lineTo(-s * 0.5, s * 0.55);
      ctx.quadraticCurveTo(s * 0.6, s * 0.7, s * 1.3, 0);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#e0f6ff";
      ctx.lineWidth = 2;
      for (const sd of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(-s * 0.2, sd * s * 0.4); ctx.quadraticCurveTo(-s * 0.8, sd * s * 0.9, -s * 1.4, sd * s * 0.7); ctx.stroke();
        // whiskers
        ctx.strokeStyle = "rgba(200,240,255,.7)";
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(s * 0.9, sd * s * 0.2);
        for (let k = 1; k <= 8; k++) ctx.lineTo(s * 0.9 - k * s * 0.35, sd * (s * 0.3 + k * s * 0.12) + Math.sin(t * 6 + k) * s * 0.15);
        ctx.stroke();
        ctx.strokeStyle = "#e0f6ff";
        ctx.lineWidth = 2;
        ctx.fillStyle = "#fde047";
        ctx.beginPath(); ctx.ellipse(s * 0.45, sd * s * 0.28, s * 0.14, s * 0.07, sd * 0.3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // Lightning crackling off the body
      if (Math.random() < dt * 9) {
        const i = Math.floor(rand(4, N - 4));
        const [x, y] = nodes[i];
        const a = rand(0, Math.PI * 2), L = rand(30, 90);
        const pts: Pt[] = [[x, y]];
        for (let k = 1; k <= 7; k++) pts.push([x + Math.cos(a) * L * (k / 7) + rand(-10, 10), y + Math.sin(a) * L * (k / 7) + rand(-10, 10)]);
        bolts.push({ pts, life: 1 });
        if (Math.random() < 0.15) flash = 1;
      }
      ctx.globalCompositeOperation = "lighter";
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.life -= dt * 6;
        if (b.life <= 0) { bolts.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(200,235,255,${b.life})`;
        ctx.shadowColor = "#60a5fa";
        ctx.shadowBlur = 10;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        b.pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    },
  };
}

export const CANVAS_SCENES: Record<string, () => Scene> = {
  "crimson-ronin": () => crimsonRonin(),
  "soul-reaper": () => crimsonRonin("card", REAPER),
  "warp-disc": warpDisc,
  "crimson-blade": crimsonBlade,
  hyperdrive,
  "astral-vortex": astralVortex,
  symbiote: () => symbiote(),
  carnage: () => symbiote(CARNAGE),
  "anti-venom": () => symbiote(ANTI_VENOM),
  bloodfall,
  nightwing,
  kraken,
  "storm-serpent": stormSerpent,
};

/** Fills its (position: relative) parent with a running canvas scene. */
export function useParticlesSetting(): boolean {
  const [on, setOn] = useState<boolean>(() => isParticlesEnabled());
  useEffect(() => {
    setOn(isParticlesEnabled());
    const handler = () => setOn(isParticlesEnabled());
    window.addEventListener("huddle-particles-change", handler);
    return () => window.removeEventListener("huddle-particles-change", handler);
  }, []);
  return on;
}

export function CanvasScene({ id, density = 1 }: { id: string; density?: number }) {
  const particlesOn = useParticlesSetting();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!particlesOn) return;
    const canvas = ref.current;
    const make = CANVAS_SCENES[id];
    if (!canvas || !make) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scene = make();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, visible = true, last = performance.now(), t = 0;

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.init(width, height, Math.max(0.3, density));
      // Settle springs so the first visible frame is already formed.
      for (let i = 0; i < 40; i++) scene.frame(ctx, t, 1 / 60);
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      scene.frame(ctx, t, dt);
      if (visible && !reduced) raf = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting && !document.hidden;
      if (visible && !was && !reduced) { last = performance.now(); raf = requestAnimationFrame(loop); }
      if (!visible) cancelAnimationFrame(raf);
    });
    io.observe(canvas);
    if (!reduced) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [id, density, particlesOn]);

  if (!particlesOn) return null;
  return (
    <div className={`pfx pfx-canvas pfx-canvas-${id}`} aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
