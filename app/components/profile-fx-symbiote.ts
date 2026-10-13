/*
 * Symbiote: a glossy black symbiote rises out of a pool of goo at the bottom
 * of the card while tendrils creep in from the edges. It opens its eyes,
 * grins, roars with a lashing tongue, lunges at you and snaps its jaws shut,
 * then sinks back into the goo.
 *
 * Rendered by a WebGL shader (symbiote-gl.ts) as one glossy, wet surface; the
 * vector drawing here is the fallback when WebGL is unavailable. The head is
 * built in its own units (1 = head width, origin between the eyes, y down).
 */
import type { Scene } from "./particle-scenes";
import { renderSymbiote, symbioteRenderer, type SymbioteLook } from "./symbiote-gl";

type Ctx = CanvasRenderingContext2D;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const outCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const inCubic = (x: number) => clamp01(x) ** 3;
const outBack = (x: number) => {
  const v = clamp01(x) - 1;
  return 1 + 2.4 * v * v * v + 1.4 * v * v;
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** Stable pseudo-random 0..1 per integer. */
const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export interface SymbiotePalette {
  /** Head shading: lit, mid, shadow. */
  skin: [string, string, string];
  /** Rim light and specular sheen, as "r,g,b". */
  rim: string;
  shine: string;
  eye: [string, string];
  eyeGlow: string;
  mouth: [string, string];
  tongue: [string, string];
  /** Optional streaks over the skin (Carnage's black veins), as "r,g,b". */
  veins?: string;
  /** Linear colours for the WebGL renderer. */
  gl: SymbioteLook;
}

export const VENOM: SymbiotePalette = {
  skin: ["#26304a", "#0b0e18", "#020205"],
  rim: "120,150,235",
  shine: "205,220,255",
  eye: ["#ffffff", "#d3dceb"],
  eyeGlow: "rgba(210,228,255,0.85)",
  mouth: ["#2b0207", "#7d0c1c"],
  tongue: ["#d0244f", "#ff6f8e"],
  gl: {
    skin: [0.012, 0.014, 0.022],
    vein: [0, 0, 0],
    veins: 0,
    tint: [0.55, 0.68, 1],
    throat: [0.09, 0, 0.015],
    gum: [0.42, 0.03, 0.08],
    tongue: [0.62, 0.06, 0.16],
    eye: [0.95, 0.97, 1],
    eyeGlow: 1,
  },
};

export const CARNAGE: SymbiotePalette = {
  skin: ["#e0262a", "#8d0a10", "#2a0204"],
  rim: "255,120,90",
  shine: "255,210,190",
  eye: ["#ffffff", "#f1dccc"],
  eyeGlow: "rgba(255,230,210,0.8)",
  mouth: ["#1a0003", "#5a0410"],
  tongue: ["#7a0a18", "#d33045"],
  veins: "18,0,2",
  gl: {
    skin: [0.42, 0.015, 0.02],
    vein: [0.015, 0, 0],
    veins: 1,
    tint: [1, 0.55, 0.45],
    throat: [0.05, 0, 0.01],
    gum: [0.3, 0.02, 0.05],
    tongue: [0.45, 0.03, 0.08],
    eye: [0.97, 0.95, 0.92],
    eyeGlow: 1,
  },
};

/** The white symbiote: pearl skin, black markings, black eyes. */
export const ANTI_VENOM: SymbiotePalette = {
  skin: ["#f4f6fa", "#c3c9d4", "#6f7888"],
  rim: "235,242,255",
  shine: "255,255,255",
  eye: ["#08080b", "#1c1c24"],
  eyeGlow: "rgba(0,0,0,0)",
  mouth: ["#2b0207", "#7d0c1c"],
  tongue: ["#d0244f", "#ff6f8e"],
  veins: "12,12,16",
  gl: {
    skin: [0.62, 0.64, 0.68],
    vein: [0.015, 0.015, 0.02],
    veins: 1,
    tint: [0.85, 0.9, 1],
    throat: [0.09, 0, 0.015],
    gum: [0.42, 0.03, 0.08],
    tongue: [0.62, 0.06, 0.16],
    eye: [0.015, 0.015, 0.02],
    eyeGlow: 0,
  },
};

// One cycle, in seconds.
const CYCLE = 10.5;

interface State {
  rise: number;
  eyes: number;
  grin: number;
  jaw: number;
  tongue: number;
  whip: number;
  lunge: number;
  squint: number;
  reach: number;
  rumble: number;
}

function stateAt(c: number, out: State): State {
  const up = outBack((c - 0.5) / 1.5);
  const down = inCubic((c - 6.0) / 1.3);
  out.rise = c < 6 ? up : 1 - down;
  out.eyes = smooth(1.2, 1.8, c) * (1 - smooth(6.0, 6.7, c));
  out.grin = smooth(2.0, 2.6, c) * (1 - 0.5 * smooth(3.2, 3.5, c) * (1 - smooth(4.9, 5.1, c)));
  const open = outCubic((c - 3.2) / 0.5) * (1 - inCubic((c - 4.85) / 0.17));
  out.jaw = c < 3.2 ? 0 : open + (c > 3.7 && c < 4.85 ? Math.sin(c * 31) * 0.025 : 0);
  out.tongue = smooth(3.35, 3.9, c) * (1 - smooth(4.55, 4.85, c));
  out.whip = smooth(3.4, 3.7, c) * (1 - smooth(4.4, 4.8, c));
  // The lunge peaks as the jaws snap shut at 5.0s.
  out.lunge = c < 4.72 ? 0 : c < 5.0 ? inCubic((c - 4.72) / 0.28) : 1 - outCubic((c - 5.0) / 0.9);
  out.squint = 0.45 * smooth(2.0, 2.6, c) * (1 - smooth(3.2, 3.4, c)) + 0.6 * smooth(4.9, 5.05, c) * (1 - smooth(5.8, 6.2, c));
  out.reach = 0.35 + 0.35 * smooth(0.4, 2.0, c) + 0.35 * smooth(3.3, 3.7, c) * (1 - smooth(4.9, 5.6, c)) - 0.45 * smooth(6.0, 7.2, c);
  out.rumble = smooth(3.3, 3.5, c) * (1 - smooth(4.5, 4.8, c));
  return out;
}

/* ------------------------------------------------------------- head -- */

const CORNER_X = 0.47;

/** The upper lip line: a wide grin that curls up at the corners. */
function upperLip(x: number, grin: number) {
  const u = Math.min(1, Math.abs(x) / CORNER_X);
  const corner = 0.05 - 0.08 * grin;
  return corner + (0.17 - corner) * (1 - u * u) ** 0.9;
}

/** The lower lip line drops with the jaw, most in the middle. */
function lowerLip(x: number, grin: number, jaw: number) {
  const u = Math.min(1, Math.abs(x) / CORNER_X);
  return upperLip(x, grin) + jaw * 0.52 * (1 - u * u) ** 0.65;
}

function eyePath(ctx: Ctx, side: number, squint: number, blink: number) {
  // Right eye; the left is its mirror. Inner corner low by the nose, a sharp
  // tip sweeping up to the temple.
  const s = side;
  const q = squint;
  const ix = 0.075 * s, iy = -0.115;
  const ox = 0.49 * s, oy = -0.47;
  const lo1x = 0.17 * s, lo1y = -0.03, lo2x = 0.36 * s, lo2y = -0.075;
  let up1x = 0.37 * s, up1y = -0.41 + q * 0.2, up2x = 0.2 * s, up2y = -0.34 + q * 0.21;
  // Blinking folds the upper lid down onto the lower one.
  up1y += (lo2y - up1y) * blink;
  up2y += (lo1y - up2y) * blink;
  up1x += (lo2x - up1x) * blink;
  up2x += (lo1x - up2x) * blink;
  ctx.beginPath();
  ctx.moveTo(ix, iy);
  ctx.bezierCurveTo(lo1x, lo1y, lo2x, lo2y, ox, oy);
  ctx.bezierCurveTo(up1x, up1y, up2x, up2y, ix, iy);
  ctx.closePath();
}

function craniumPath(ctx: Ctx, grin: number) {
  const yc = upperLip(CORNER_X, grin);
  ctx.beginPath();
  ctx.moveTo(-CORNER_X, yc);
  ctx.bezierCurveTo(-0.53, yc - 0.03, -0.57, -0.1, -0.54, -0.3);
  ctx.bezierCurveTo(-0.5, -0.56, -0.27, -0.67, 0, -0.66);
  ctx.bezierCurveTo(0.27, -0.67, 0.5, -0.56, 0.54, -0.3);
  ctx.bezierCurveTo(0.57, -0.1, 0.53, yc - 0.03, CORNER_X, yc);
  for (let i = 1; i < 24; i++) {
    const x = CORNER_X - (2 * CORNER_X * i) / 24;
    ctx.lineTo(x, upperLip(x, grin));
  }
  ctx.closePath();
}

function jawPath(ctx: Ctx, grin: number, jaw: number) {
  const yc = upperLip(CORNER_X, grin);
  const drop = jaw * 0.5;
  ctx.beginPath();
  ctx.moveTo(-CORNER_X, yc);
  for (let i = 1; i < 24; i++) {
    const x = -CORNER_X + (2 * CORNER_X * i) / 24;
    ctx.lineTo(x, lowerLip(x, grin, jaw));
  }
  ctx.lineTo(CORNER_X, yc);
  ctx.bezierCurveTo(0.5, yc + 0.2 + drop * 0.6, 0.3, 0.52 + drop, 0, 0.56 + drop);
  ctx.bezierCurveTo(-0.3, 0.52 + drop, -0.5, yc + 0.2 + drop * 0.6, -CORNER_X, yc);
  ctx.closePath();
}

function mouthPath(ctx: Ctx, grin: number, jaw: number) {
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const x = -CORNER_X + (2 * CORNER_X * i) / 24;
    if (i) ctx.lineTo(x, upperLip(x, grin));
    else ctx.moveTo(x, upperLip(x, grin));
  }
  for (let i = 24; i >= 0; i--) {
    const x = -CORNER_X + (2 * CORNER_X * i) / 24;
    ctx.lineTo(x, lowerLip(x, grin, jaw));
  }
  ctx.closePath();
}

/** Needle teeth along both lips; they interlock when the jaw is shut. */
function teethPath(ctx: Ctx, grin: number, jaw: number) {
  ctx.beginPath();
  const row = (n: number, upper: boolean, seed: number) => {
    const span = 2 * (CORNER_X - 0.035);
    const w = (span / (n - 1)) * 0.46;
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (span * i) / (n - 1);
      const u = Math.abs(x) / CORNER_X;
      const fang = i === 2 || i === n - 3 ? 1.55 : 1;
      const len = (0.07 + 0.055 * hash(i + seed)) * (1 - 0.55 * u * u) * fang;
      const lean = -Math.sign(x) * 0.012 * u;
      const y = upper ? upperLip(x, grin) - 0.012 : lowerLip(x, grin, jaw) + 0.012;
      const dir = upper ? 1 : -1;
      ctx.moveTo(x - w, y);
      ctx.quadraticCurveTo(x - w * 0.35 + lean, y + dir * len * 0.6, x + lean * 1.6, y + dir * len);
      ctx.quadraticCurveTo(x + w * 0.35 + lean, y + dir * len * 0.6, x + w, y);
      ctx.closePath();
    }
  };
  row(15, true, 3);
  row(14, false, 41);
}

/* -------------------------------------------------------------- scene -- */

export function symbiote(palette: SymbiotePalette = VENOM): Scene {
  let W = 0, H = 0, HW = 0, DPR = 1;
  let clock = 0, snapCycle = -1;
  let shake = 0, blink = 0, blinkAmt = 0, nextBlink = 2.5;
  const st: State = { rise: 0, eyes: 0, grin: 0, jaw: 0, tongue: 0, whip: 0, lunge: 0, squint: 0, reach: 0, rumble: 0 };

  interface Tendril { x: number; y: number; ang: number; len: number; w: number; phase: number; speed: number; curl: number }
  let tendrils: Tendril[] = [];
  const glTendrils = new Float32Array(48 * 4);
  const glTongue = new Float32Array(12 * 4);

  /** 8 points down a tendril for the shader: x, y, radius (0 when retracted). */
  function tendrilPoints(td: Tendril, len: number, wave: number, phase: number, o: number) {
    let a = td.ang + Math.sin(clock * 0.6 + td.phase) * 0.15, x = td.x, y = td.y;
    const n = 7;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      glTendrils[o + k * 4] = x;
      glTendrils[o + k * 4 + 1] = y;
      glTendrils[o + k * 4 + 2] = len > 3 ? td.w * 0.5 * (1 - t) ** 0.85 + 0.8 : 0;
      for (let sub = 0; sub < 3; sub++) {
        const tt = (k + sub / 3) / n;
        a += (Math.sin(phase - tt * 6) * wave + td.curl * tt) * (1.6 / (n * 3)) * (0.4 + tt);
        x += (Math.cos(a) * len) / (n * 3);
        y += (Math.sin(a) * len) / (n * 3);
      }
    }
  }

  /** 12 points down the tongue in head units: x, y, radius. */
  function tonguePoints(grin: number, jaw: number) {
    const n = 11;
    const len = (0.3 + 1.6 * st.tongue) * (0.6 + 0.4 * jaw);
    let a = Math.PI / 2 - 0.35;
    let x = 0, y = (upperLip(0, grin) + lowerLip(0, grin, jaw)) / 2 + 0.03;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      glTongue[k * 4] = x;
      glTongue[k * 4 + 1] = y;
      glTongue[k * 4 + 2] = 0.072 * (1 - 0.8 * t ** 0.8) * (k === n ? 0.7 : 1);
      // A slithering wave down its length, the tip curling back up.
      a += (Math.sin(clock * 5.2 - t * 4.2) * 1.1 * st.whip + Math.sin(clock * 2.1 - t * 2.5) * 0.3 - 0.22 * t) * (0.3 + t * 1.4) * (10 / n);
      x += (Math.cos(a) * len) / n;
      y += (Math.sin(a) * len) / n;
    }
  }

  // Goo droplets in screen space.
  const ND = 160;
  const dX = new Float32Array(ND), dY = new Float32Array(ND), dVX = new Float32Array(ND), dVY = new Float32Array(ND);
  const dR = new Float32Array(ND), dAge = new Float32Array(ND).fill(1), dMax = new Float32Array(ND).fill(1);
  const dWet = new Uint8Array(ND);
  let dHead = 0;

  const drop = (x: number, y: number, vx: number, vy: number, r: number, max: number, wet = 0) => {
    const i = dHead;
    dHead = (dHead + 1) % ND;
    dX[i] = x; dY[i] = y; dVX[i] = vx; dVY[i] = vy; dR[i] = r; dAge[i] = 0; dMax[i] = max; dWet[i] = wet;
  };

  /** A tapered, wriggling limb from (x, y): filled body plus a rim-lit edge. */
  function tendril(ctx: Ctx, x: number, y: number, ang: number, len: number, w: number, phase: number, wave: number, curl: number) {
    if (len < 2) return;
    const n = 26;
    const pts: number[] = [];
    let a = ang, px = x, py = y;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      pts.push(px, py);
      a += (Math.sin(phase - t * 6) * wave + curl * t) * (1.6 / n) * (0.4 + t);
      px += (Math.cos(a) * len) / n;
      py += (Math.sin(a) * len) / n;
    }
    const left: number[] = [], right: number[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const i = Math.min(k, n - 1) * 2;
      let tx = pts[i + 2] - pts[i], ty = pts[i + 3] - pts[i + 1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const hw = w * (1 - t) ** 0.85 * 0.5 + 0.35;
      left.push(pts[k * 2] - ty * hw, pts[k * 2 + 1] + tx * hw);
      right.push(pts[k * 2] + ty * hw, pts[k * 2 + 1] - tx * hw);
    }
    ctx.beginPath();
    ctx.moveTo(left[0], left[1]);
    for (let k = 1; k <= n; k++) ctx.lineTo(left[k * 2], left[k * 2 + 1]);
    for (let k = n; k >= 0; k--) ctx.lineTo(right[k * 2], right[k * 2 + 1]);
    ctx.closePath();
    ctx.fillStyle = palette.skin[2];
    ctx.fill();
    // Rim light along one edge, a softer sheen inside it.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(left[0], left[1]);
    for (let k = 1; k < n; k++) ctx.lineTo(left[k * 2], left[k * 2 + 1]);
    ctx.strokeStyle = `rgba(${palette.rim},0.8)`;
    ctx.lineWidth = Math.max(0.8, w * 0.09);
    ctx.stroke();
    ctx.beginPath();
    for (let k = 2; k < n - 4; k++) {
      const mx = (left[k * 2] * 0.7 + pts[k * 2] * 0.3), my = (left[k * 2 + 1] * 0.7 + pts[k * 2 + 1] * 0.3);
      if (k === 2) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.strokeStyle = `rgba(${palette.shine},0.24)`;
    ctx.lineWidth = Math.max(0.6, w * 0.12);
    ctx.stroke();
  }

  function drawPool(ctx: Ctx, rise: number) {
    const top = H - HW * (0.1 + 0.08 * rise);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i <= 30; i++) {
      const x = (W * i) / 30;
      const y = top + Math.sin(i * 1.3 + clock * 1.4) * HW * 0.025 + Math.sin(i * 0.55 - clock * 0.9) * HW * 0.03 + (Math.abs(x - W / 2) / W) * HW * 0.08;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, top - HW * 0.05, 0, H);
    g.addColorStop(0, palette.skin[1]);
    g.addColorStop(1, palette.skin[2]);
    ctx.fillStyle = g;
    ctx.fill();
    // Glints riding on the bumps.
    ctx.strokeStyle = `rgba(${palette.rim},0.3)`;
    ctx.lineWidth = Math.max(0.7, HW * 0.006);
    ctx.beginPath();
    for (let i = 2; i < 30; i += 5) {
      const x = (W * i) / 30;
      const y = top + Math.sin(i * 1.3 + clock * 1.4) * HW * 0.025 + Math.sin(i * 0.55 - clock * 0.9) * HW * 0.03 + (Math.abs(x - W / 2) / W) * HW * 0.08;
      ctx.moveTo(x - HW * 0.04, y + HW * 0.012);
      ctx.quadraticCurveTo(x, y - HW * 0.004, x + HW * 0.04, y + HW * 0.014);
    }
    ctx.stroke();
  }

  function drawHead(ctx: Ctx, hx: number, hy: number, scale: number, tilt: number) {
    const { grin, jaw, eyes, squint } = st;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(tilt);
    ctx.scale(HW * scale, HW * scale);
    const px = 1 / (HW * scale);

    // Neck: a thick column of goo down into the pool, with strands beside it.
    ctx.fillStyle = palette.skin[2];
    const reach = (H - hy) / (HW * scale) + 0.2;
    ctx.beginPath();
    ctx.moveTo(-0.34, 0.2);
    ctx.bezierCurveTo(-0.3, 0.6, -0.42 + Math.sin(clock * 1.7) * 0.03, reach * 0.7, -0.55, reach);
    ctx.lineTo(0.55, reach);
    ctx.bezierCurveTo(0.42 + Math.sin(clock * 1.5) * 0.03, reach * 0.7, 0.3, 0.6, 0.34, 0.2);
    ctx.closePath();
    ctx.fill();

    // Jaw, then cranium over it.
    const lit = ctx.createRadialGradient(-0.18, -0.38, 0.02, -0.05, -0.1, 0.85);
    lit.addColorStop(0, palette.skin[0]);
    lit.addColorStop(0.45, palette.skin[1]);
    lit.addColorStop(1, palette.skin[2]);
    if (jaw > 0.01) {
      mouthPath(ctx, grin, jaw);
      const m = ctx.createLinearGradient(0, upperLip(0, grin), 0, lowerLip(0, grin, jaw));
      m.addColorStop(0, palette.mouth[1]);
      m.addColorStop(0.5, palette.mouth[0]);
      m.addColorStop(1, palette.mouth[1]);
      ctx.fillStyle = m;
      ctx.fill();
    }
    jawPath(ctx, grin, jaw);
    ctx.fillStyle = lit;
    ctx.fill();
    craniumPath(ctx, grin);
    ctx.fillStyle = lit;
    ctx.fill();
    ctx.strokeStyle = `rgba(${palette.rim},0.4)`;
    ctx.lineWidth = 1.6 * px;
    ctx.stroke();

    if (palette.veins) {
      ctx.strokeStyle = `rgba(${palette.veins},0.55)`;
      ctx.lineWidth = 0.012;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a0 = -2.6 + i * 0.6 + Math.sin(i * 3.1) * 0.2;
        ctx.moveTo(Math.cos(a0) * 0.2, -0.25 + Math.sin(a0) * 0.2);
        ctx.quadraticCurveTo(Math.cos(a0 + 0.3) * 0.42, -0.25 + Math.sin(a0 + 0.3) * 0.38, Math.cos(a0 + 0.1) * 0.55, -0.25 + Math.sin(a0 + 0.1) * 0.45);
      }
      ctx.stroke();
    }

    // Specular sheen over the skull and cheeks.
    ctx.lineCap = "round";
    const sheen = (pts: number[], w: number, a: number) => {
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      ctx.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
      ctx.strokeStyle = `rgba(${palette.shine},${a * 0.35})`;
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${palette.shine},${a})`;
      ctx.lineWidth = w * 0.25;
      ctx.stroke();
    };
    sheen([-0.4, -0.38, -0.3, -0.62, 0.02, -0.63], 0.05, 0.5);
    sheen([0.33, -0.58, 0.5, -0.5, 0.52, -0.3], 0.035, 0.32);
    sheen([0.01, -0.3, 0.02, -0.24, 0.005, -0.17], 0.02, 0.16);
    sheen([-0.47, -0.16, -0.46, -0.04, -0.4, 0.02], 0.03, 0.25);
    sheen([-0.22, 0.5 + jaw * 0.5, 0, 0.56 + jaw * 0.5, 0.2, 0.51 + jaw * 0.5], 0.03, 0.2);

    // Teeth, the tongue lolling over them, and spit strung across the jaws.
    teethPath(ctx, grin, jaw);
    const tg = ctx.createLinearGradient(0, -0.1, 0, 0.6 + jaw * 0.5);
    tg.addColorStop(0, "#fbf8ef");
    tg.addColorStop(1, "#cfc8b8");
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = px;
    ctx.stroke();

    if (st.tongue > 0.02) drawTongue(ctx, grin, jaw);

    if (jaw > 0.08) {
      const a = Math.sin(Math.PI * clamp01((jaw - 0.08) / 0.85)) * 0.55;
      ctx.strokeStyle = `rgba(225,235,255,${a})`;
      ctx.lineWidth = 1.1 * px;
      ctx.beginPath();
      for (const [sx, dx] of [[-0.3, 0.02], [-0.16, -0.015], [0.07, 0.02], [0.22, 0.01], [0.33, -0.02]]) {
        const y0 = upperLip(sx, grin) + 0.05, y1 = lowerLip(sx + dx, grin, jaw) - 0.04;
        if (y1 - y0 < 0.03) continue;
        ctx.moveTo(sx, y0);
        ctx.quadraticCurveTo(sx + dx * 0.5, (y0 + y1) / 2 + jaw * 0.06, sx + dx, y1);
      }
      ctx.stroke();
    }

    // Eyes glow white out of the black.
    if (eyes > 0.01) {
      ctx.save();
      ctx.shadowColor = palette.eyeGlow;
      ctx.shadowBlur = HW * scale * 0.07 * DPR * eyes;
      ctx.globalAlpha = eyes;
      for (const side of [-1, 1]) {
        eyePath(ctx, side, squint, Math.max(blinkAmt, 1 - smooth(0, 0.5, eyes)));
        const eg = ctx.createRadialGradient(0.22 * side, -0.2, 0.01, 0.25 * side, -0.22, 0.32);
        eg.addColorStop(0, palette.eye[0]);
        eg.addColorStop(1, palette.eye[1]);
        ctx.fillStyle = eg;
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawTongue(ctx: Ctx, grin: number, jaw: number) {
    const ext = st.tongue;
    const n = 22;
    const ax = 0, ay = (upperLip(0, grin) + lowerLip(0, grin, jaw)) / 2 + 0.03;
    const len = (0.25 + 1.45 * ext) * (0.6 + 0.4 * jaw);
    const pts: number[] = [];
    let a = Math.PI / 2 - 0.15, x = ax, y = ay;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      pts.push(x, y);
      a += (Math.sin(clock * 6 - t * 4.5) * 0.75 * st.whip + Math.sin(clock * 2.3 - t * 2) * 0.16 + 0.04) * (0.25 + t * 1.3) * (5 / n);
      x += (Math.cos(a) * len) / n;
      y += (Math.sin(a) * len) / n;
    }
    const left: number[] = [], right: number[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const i = Math.min(k, n - 1) * 2;
      let tx = pts[i + 2] - pts[i], ty = pts[i + 3] - pts[i + 1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const hw = 0.065 * (1 - 0.68 * t) * (k === n ? 0.6 : 1);
      left.push(pts[k * 2] - ty * hw, pts[k * 2 + 1] + tx * hw);
      right.push(pts[k * 2] + ty * hw, pts[k * 2 + 1] - tx * hw);
    }
    ctx.beginPath();
    ctx.moveTo(left[0], left[1]);
    for (let k = 1; k <= n; k++) ctx.lineTo(left[k * 2], left[k * 2 + 1]);
    const tipX = pts[n * 2], tipY = pts[n * 2 + 1];
    ctx.quadraticCurveTo(tipX + (pts[n * 2] - pts[n * 2 - 2]) * 1.5, tipY + (pts[n * 2 + 1] - pts[n * 2 - 1]) * 1.5, right[n * 2], right[n * 2 + 1]);
    for (let k = n - 1; k >= 0; k--) ctx.lineTo(right[k * 2], right[k * 2 + 1]);
    ctx.closePath();
    const g = ctx.createLinearGradient(ax, ay, tipX, tipY);
    g.addColorStop(0, palette.tongue[0]);
    g.addColorStop(1, palette.tongue[1]);
    ctx.fillStyle = g;
    ctx.fill();
    // Groove down the middle and a wet highlight.
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let k = 1; k < n - 2; k++) {
      if (k === 1) ctx.moveTo(pts[k * 2], pts[k * 2 + 1]);
      else ctx.lineTo(pts[k * 2], pts[k * 2 + 1]);
    }
    ctx.strokeStyle = "rgba(60,0,10,0.45)";
    ctx.lineWidth = 0.012;
    ctx.stroke();
    ctx.beginPath();
    for (let k = 2; k < n - 2; k++) {
      const mx = left[k * 2] * 0.6 + pts[k * 2] * 0.4, my = left[k * 2 + 1] * 0.6 + pts[k * 2 + 1] * 0.4;
      if (k === 2) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.strokeStyle = "rgba(255,225,235,0.5)";
    ctx.lineWidth = 0.01;
    ctx.stroke();
    // Drool off the tip now and then.
    if (Math.random() < 0.06 * ext) {
      const m = ctx.getTransform();
      const sx = (m.a * tipX + m.c * tipY + m.e) / DPR, sy = (m.b * tipX + m.d * tipY + m.f) / DPR;
      drop(sx, sy, rand(-20, 20), rand(10, 60), rand(1, 2.4) * (HW / 200), rand(0.8, 1.4), 1);
    }
  }

  return {
    init(w, h) {
      W = w;
      H = h;
      HW = Math.min(w * 0.62, h * 0.44);
      // The first six are the ones the WebGL renderer draws.
      const anchors: Array<[number, number, number, number]> = [
        [0, h * 0.98, -0.95, 0.42],
        [0, h * 0.7, -0.15, 0.38],
        [w, h * 0.56, Math.PI + 0.2, 0.4],
        [w, h * 0.82, Math.PI - 0.25, 0.36],
        [w * 0.82, 0, 1.95, 0.26],
        [0, h * 0.44, 0.2, 0.3],
        [w, h * 0.99, -2.3, 0.45],
        [w * 0.12, 0, 1.25, 0.22],
      ];
      tendrils = anchors.map(([x, y, ang, len], i) => ({
        x, y, ang, len: len * w, w: w * rand(0.035, 0.055), phase: rand(0, 6), speed: rand(1.3, 2.2), curl: (i % 2 ? 1 : -1) * rand(0.6, 1.4),
      }));
      dAge.fill(1);
      if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        // Only one frame will be drawn: make it the grin.
        clock = 2.9 - 40 / 60;
      }
    },

    frame(ctx, _t, dt) {
      DPR = ctx.getTransform().a || 1;
      clock += dt;
      const c = clock % CYCLE;
      const cycle = Math.floor(clock / CYCLE);
      stateAt(c, st);

      // Blink every few seconds while it is calm.
      nextBlink -= dt;
      if (nextBlink <= 0) {
        blink = 1;
        nextBlink = rand(2, 4.5);
      }
      blink = Math.max(0, blink - dt * 7);
      blinkAmt = st.jaw > 0.1 ? 0 : Math.sin(Math.PI * blink);

      // The jaws snap shut on the lunge.
      if (c >= 5.0 && snapCycle !== cycle) {
        snapCycle = cycle;
        shake = 1;
        for (let i = 0; i < 26; i++) {
          const a = rand(0, Math.PI * 2), sp = rand(60, 260) * (HW / 200);
          drop(W / 2 + Math.cos(a) * HW * 0.3, H - HW * 0.7 + Math.sin(a) * HW * 0.2, Math.cos(a) * sp, Math.sin(a) * sp - 80, rand(1.2, 3.2) * (HW / 200), rand(0.6, 1.2));
        }
      }
      shake *= Math.exp(-dt * 7);

      ctx.save();
      ctx.clearRect(0, 0, W, H);
      const sh = shake * 7 + st.rumble * 1.4;
      if (sh > 0.05) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

      const hx = W / 2 + Math.sin(clock * 0.9) * HW * 0.02;
      const restY = H - HW * 0.74;
      const hy = restY + (1 - st.rise) * (H - restY + HW * 0.75) - st.whip * HW * 0.03;
      const scale = 1 + st.lunge * 0.5;
      const tilt = Math.sin(clock * 1.1) * 0.05 - st.whip * 0.07 + st.grin * 0.03;

      const gl = symbioteRenderer();
      if (gl) {
        const wave = 0.55 + st.whip * 0.9 + st.lunge * 0.6;
        glTendrils.fill(0);
        tendrils.slice(0, 6).forEach((td, i) => {
          const len = td.len * Math.max(0, st.reach) * (0.85 + 0.15 * Math.sin(clock * 0.7 + td.phase));
          tendrilPoints(td, len, wave, clock * td.speed * (1 + st.whip) + td.phase, i * 32);
        });
        const tongue = st.tongue > 0.02 && st.rise > 0.01;
        if (tongue) tonguePoints(st.grin, st.jaw);
        const img = renderSymbiote(gl, palette.gl, {
          width: W,
          height: H,
          px: Math.min(DPR, 1.5),
          time: clock,
          head: [hx, st.rise > 0.01 ? hy : H + HW * 3, HW * scale, tilt],
          face: [st.jaw, st.grin, st.squint, blinkAmt],
          mood: [st.eyes, clamp01(st.rise * 1.2), palette.gl.eyeGlow, 0],
          pool: [H - HW * (0.1 + 0.08 * st.rise), HW * 0.025, clock, 0],
          tongue: tongue ? glTongue : null,
          tendrils: glTendrils,
        });
        ctx.drawImage(img, 0, 0, W, H);
      } else {
        // Darkness gathers behind it.
        const vis = clamp01(st.rise * 1.2);
        if (vis > 0.01) {
          const aura = ctx.createRadialGradient(hx, hy, HW * 0.1, hx, hy, HW * 1.15 * scale);
          aura.addColorStop(0, `rgba(0,0,0,${0.7 * vis})`);
          aura.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = aura;
          ctx.fillRect(0, 0, W, H);
        }
        const bottom = ctx.createLinearGradient(0, H * 0.55, 0, H);
        bottom.addColorStop(0, "rgba(0,0,0,0)");
        bottom.addColorStop(1, `rgba(0,0,0,${0.35 + 0.3 * vis})`);
        ctx.fillStyle = bottom;
        ctx.fillRect(0, H * 0.55, W, H * 0.45);

        // Tendrils creep in from the edges and lash out when it roars.
        for (const td of tendrils) {
          const len = td.len * Math.max(0, st.reach) * (0.85 + 0.15 * Math.sin(clock * 0.7 + td.phase));
          const wave = 0.55 + st.whip * 0.9 + st.lunge * 0.6;
          tendril(ctx, td.x, td.y, td.ang + Math.sin(clock * 0.6 + td.phase) * 0.15, len, td.w, clock * td.speed * (1 + st.whip) + td.phase, wave, td.curl);
        }

        drawPool(ctx, st.rise);
        if (st.rise > 0.01) drawHead(ctx, hx, hy, scale, tilt);
      }

      // Goo droplets.
      for (let i = 0; i < ND; i++) {
        if (dAge[i] >= dMax[i]) continue;
        dAge[i] += dt;
        dVY[i] += 520 * (HW / 200) * dt;
        dX[i] += dVX[i] * dt;
        dY[i] += dVY[i] * dt;
        const life = 1 - dAge[i] / dMax[i];
        const r = dR[i] * (0.5 + 0.5 * life);
        ctx.fillStyle = dWet[i] ? palette.tongue[0] : palette.skin[2];
        ctx.beginPath();
        ctx.ellipse(dX[i], dY[i], r, r * 1.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${palette.shine},${0.6 * life})`;
        ctx.beginPath();
        ctx.arc(dX[i] - r * 0.35, dY[i] - r * 0.45, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}
