/*
 * Crimson Ronin: a hooded swordsman made of a few thousand red embers that
 * stream down the strands of his cloak. He holds a high guard, winds up, cuts
 * across the card and lifts the blade back up.
 *
 * The figure is traced from the clip this recreates: its frames averaged,
 * stroke directions taken from a structure tensor, and evenly spaced
 * streamlines drawn through them. STRANDS holds those in a unit square (the
 * clip's frame), one per space-separated word: weight (1 char), x and y
 * (2 chars each, /4095), then one char per 3/256 step giving its direction out
 * of 64. The sword is not part of the tracing; it is drawn here so it can swing.
 */
import type { Scene } from "./particle-scenes";

type Ctx = CanvasRenderingContext2D;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const STEP = 3 / 256;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const easeSine = (x: number) => 0.5 - Math.cos(Math.PI * x) / 2;
const easeCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* ---------------------------------------------------------------- rig -- */

// Same unit square as STRANDS.
const SHOULDER_X = 0.43, SHOULDER_Y = 0.47;
const HANDS_X = 0.293, HANDS_Y = 0.41;
const SLEEVE_X = 0.215, SLEEVE_Y = 0.55;
const ARM_LEN = Math.hypot(HANDS_X - SHOULDER_X, HANDS_Y - SHOULDER_Y);
const ARM_HERO = Math.atan2(HANDS_Y - SHOULDER_Y, HANDS_X - SHOULDER_X);
const BLADE_HERO = Math.atan2(0.016 - HANDS_Y, 0.523 - HANDS_X);
const BLADE_LEN = 0.455;
const GRIP_LEN = 0.058;
/** The cross-guard sits ~81° clockwise of the blade, longer on the near side. */
const GUARD_TURN = 1.416;
const GUARD_NEAR = -0.094, GUARD_FAR = 0.078;
/** How far the upper body leans into the cut. */
const LUNGE_X = -0.014, LUNGE_Y = 0.008;

// One cycle: hold the guard, wind up, cut, follow through, lift back.
const CYCLE = 6.4;
const WIND = 3.3;
const CUT = 3.88;
const HIT = 4.06;
const BACK = 4.7;
const HOME = 5.9;
const WIND_ARM = ARM_HERO + 0.42, WIND_BLADE = BLADE_HERO + 0.33;
const HIT_ARM = ARM_HERO - 1.05, HIT_BLADE = BLADE_HERO - 2.36;

interface Pose {
  arm: number;
  blade: number;
  lunge: number;
  heat: number;
}

function pose(c: number, out: Pose): Pose {
  let arm = ARM_HERO, blade = BLADE_HERO, lunge = 0, heat = 0;
  if (c < WIND) {
    // Breathing, faded in and out so the wind-up starts from the exact guard.
    const w = smooth(0, 0.8, c) * (1 - smooth(WIND - 0.8, WIND, c));
    arm += Math.sin(c * 1.7) * 0.012 * w;
    blade += Math.sin(c * 1.7 + 0.6) * 0.02 * w;
  } else if (c < CUT) {
    const k = easeSine((c - WIND) / (CUT - WIND));
    arm += (WIND_ARM - ARM_HERO) * k;
    blade += (WIND_BLADE - BLADE_HERO) * k;
    heat = k;
  } else if (c < HIT) {
    const k = easeCubic((c - CUT) / (HIT - CUT));
    arm = WIND_ARM + (HIT_ARM - WIND_ARM) * k;
    blade = WIND_BLADE + (HIT_BLADE - WIND_BLADE) * k;
    lunge = easeSine(k);
    heat = 1;
  } else if (c < BACK) {
    const x = (c - HIT) / (BACK - HIT);
    const over = Math.sin(Math.PI * Math.min(1, x * 2.2)) * (1 - x);
    arm = HIT_ARM - over * 0.05;
    blade = HIT_BLADE - over * 0.12;
    lunge = 1;
    heat = Math.exp(-x * 4);
  } else if (c < HOME) {
    const k = easeSine((c - BACK) / (HOME - BACK));
    arm = HIT_ARM + (ARM_HERO - HIT_ARM) * k;
    blade = HIT_BLADE + (BLADE_HERO - HIT_BLADE) * k;
    lunge = 1 - k;
  }
  out.arm = arm;
  out.blade = blade;
  out.lunge = lunge;
  out.heat = heat;
  return out;
}

/* ------------------------------------------------------------ strands -- */

interface Strand {
  n: number;
  len: number;
  weight: number;
  /** x0, y0, x1, y1… in unit coords. */
  pts: Float32Array;
  /** Unit tangent of the segment that starts at each point. */
  tan: Float32Array;
  /** How far each point follows the sword arm, 0..1. */
  arm: Float32Array;
  /** How freely each point billows (the trailing cloak), 0..1. */
  loose: Float32Array;
  /** Ends in the trailing cloak, so embers fly off its end. */
  sheds: boolean;
}

/** Distance from p to segment ab, and how far along it (0..1) p projects. */
function capsule(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax, vy = by - ay;
  const u = clamp01(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy));
  return { u, d: Math.hypot(px - ax - vx * u, py - ay - vy * u) };
}

function armWeight(x: number, y: number) {
  const fore = capsule(x, y, HANDS_X, HANDS_Y, SHOULDER_X, SHOULDER_Y);
  const sleeve = capsule(x, y, HANDS_X, HANDS_Y, SLEEVE_X, SLEEVE_Y);
  const a = (1 - smooth(0.025, 0.075, fore.d)) * (1 - fore.u) ** 0.8;
  const b = (1 - smooth(0.03, 0.085, sleeve.d)) * (1 - 0.45 * sleeve.u);
  return clamp01(Math.max(a, b));
}

let decoded: Strand[] | null = null;

function strandsOf(): Strand[] {
  if (decoded) return decoded;
  decoded = STRANDS.trim().split(/\s+/).map((word) => {
    const v = (i: number) => B64.indexOf(word[i]);
    const n = word.length - 4;
    const pts = new Float32Array(n * 2);
    let x = ((v(1) << 6) | v(2)) / 4095;
    let y = ((v(3) << 6) | v(4)) / 4095;
    pts[0] = x;
    pts[1] = y;
    for (let i = 5; i < word.length; i++) {
      const a = (v(i) / 64) * Math.PI * 2;
      x += Math.cos(a) * STEP;
      y += Math.sin(a) * STEP;
      pts[(i - 4) * 2] = x;
      pts[(i - 4) * 2 + 1] = y;
    }
    const tan = new Float32Array(n * 2);
    const arm = new Float32Array(n);
    const loose = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = Math.min(i, n - 2);
      const dx = pts[j * 2 + 2] - pts[j * 2], dy = pts[j * 2 + 3] - pts[j * 2 + 1];
      const l = Math.hypot(dx, dy) || 1;
      tan[i * 2] = dx / l;
      tan[i * 2 + 1] = dy / l;
      arm[i] = armWeight(pts[i * 2], pts[i * 2 + 1]);
      loose[i] = smooth(0.62, 1.15, pts[i * 2] * 0.55 + pts[i * 2 + 1] * 0.75);
    }
    const ex = pts[n * 2 - 2], ey = pts[n * 2 - 1];
    return {
      n,
      len: (n - 1) * STEP,
      weight: v(0) / 63,
      pts,
      tan,
      arm,
      loose,
      sheds: ex > 0.97 || ey > 0.97 || (ex > 0.6 && ey > 0.55) || ey > 0.8,
    };
  });
  return decoded;
}

/* -------------------------------------------------------------- style -- */

const RED = 0, DEEP = 1, HOT = 2, GOLD = 3, ASH = 4, WHITE = 5;
const ALPHAS = [0.18, 0.34, 0.56, 0.85];

/** Colours ("r,g,b") and weapon: the same figure can be other characters. */
export interface RoninLook {
  /** Embers: main, deep, hot, gold, ash, white (indexed by RED…WHITE). */
  colors: [string, string, string, string, string, string];
  /** Hand flare: halo, core, core edge, ray, ray edge, glint. */
  flare: [string, string, string, string, string, string];
  /** Slash trail bands from the soft outer fill to the hot edge. */
  trail: [string, string, string, string];
  flash: string;
  weapon: "sword" | "scythe";
}

export const CRIMSON: RoninLook = {
  colors: ["255,26,16", "185,0,10", "255,78,34", "255,160,70", "196,192,204", "255,236,222"],
  flare: ["255,50,20", "255,190,110", "255,110,40", "255,160,80", "255,70,30", "255,170,120"],
  trail: ["220,14,10", "255,50,30", "255,60,40", "255,228,214"],
  flash: "255,20,20",
  weapon: "sword",
};

/** A spectral reaper: the same cloaked figure in ghost-green, with a scythe. */
export const REAPER: RoninLook = {
  colors: ["60,255,196", "0,130,110", "150,255,226", "215,255,244", "160,186,196", "236,255,250"],
  flare: ["30,255,190", "220,255,242", "80,255,205", "170,255,232", "30,210,170", "180,255,232"],
  trail: ["0,150,120", "40,255,200", "70,255,212", "228,255,248"],
  flash: "40,255,190",
  weapon: "scythe",
};

// The scythe: a long staff, its blade curving forward and down off the top.
const SNATH = 0.4;
const SNATH_BUTT = -0.17;
function crescent(s: number) {
  return { u: SNATH + 0.06 * Math.sin(Math.PI * s) - 0.15 * s * s, v: -0.31 * s };
}
const level = (a: number) => (a < 0.29 ? 0 : a < 0.49 ? 1 : a < 0.73 ? 2 : 3);

/* -------------------------------------------------------------- scene -- */

/**
 * `layout` "card" keeps the swing on a portrait card (the cloak's far tail is
 * cropped); "full" maps the clip's frame to the whole canvas.
 */
export function crimsonRonin(layout: "card" | "full" = "card", look: RoninLook = CRIMSON): Scene {
  const STYLES = look.colors.flatMap((rgb) => ALPHAS.map((a) => `rgba(${rgb},${a})`));
  const scythe = look.weapon === "scythe";
  /** A point along the striking part, 0 (hands) to 1 (tip), in blade space. */
  const strike = (s: number) => (scythe ? (s < 0.5 ? { u: SNATH * s * 2, v: 0 } : crescent((s - 0.5) * 2)) : { u: s * BLADE_LEN, v: 0 });
  let W = 0, H = 0, S = 0, OX = 0, OY = 0, LW = 1;
  let strands: Strand[] = [];
  let pick = new Uint16Array(0);

  // Cloak embers, one strand each.
  let np = 0;
  let pStrand = new Uint16Array(0);
  let pS = new Float32Array(0), pSpeed = new Float32Array(0), pOff = new Float32Array(0);
  let pLen = new Float32Array(0), pJc = new Float32Array(0), pJs = new Float32Array(0), pA = new Float32Array(0);
  let pCol = new Uint8Array(0);

  // Blade embers in blade space: u along the blade from the hands, v across.
  let nb = 0;
  let bU = new Float32Array(0), bV = new Float32Array(0), bSpeed = new Float32Array(0);
  let bLen = new Float32Array(0), bA = new Float32Array(0);
  let bCol = new Uint8Array(0);
  let bS = new Float32Array(0), bW = new Float32Array(0);

  // Loose embers in screen space (shed by the cloak, thrown by the cut).
  const NE = 1400;
  const eX = new Float32Array(NE), eY = new Float32Array(NE), eVX = new Float32Array(NE), eVY = new Float32Array(NE);
  const eAge = new Float32Array(NE).fill(1), eMax = new Float32Array(NE).fill(1), eA = new Float32Array(NE);
  const eCol = new Uint8Array(NE);
  let eHead = 0;

  // Rain: depth z, angle, kind (0 grey, 1 blue, 2 red, 3 dotted, 4 rgb dotted, 5 fringed).
  let nr = 0;
  let rX = new Float32Array(0), rY = new Float32Array(0), rZ = new Float32Array(0), rAng = new Float32Array(0);
  let rKind = new Uint8Array(0);

  // The slash: tip and inner edge of the blade sampled through the cut.
  const NT = 200;
  const tTipX = new Float32Array(NT), tTipY = new Float32Array(NT), tInX = new Float32Array(NT), tInY = new Float32Array(NT);
  const tTime = new Float32Array(NT);
  let tCount = 0;

  let clock = 0, lastC = -1, hitCycle = -1;
  let flash = 0, shake = 0, gust = 0;
  const cur: Pose = { arm: ARM_HERO, blade: BLADE_HERO, lunge: 0, heat: 0 };
  const sub: Pose = { arm: 0, blade: 0, lunge: 0, heat: 0 };
  let prevHX = 0, prevHY = 0, prevBlade = BLADE_HERO;
  const rays: number[] = [];

  let shadow: HTMLCanvasElement | null = null;
  let glowA: HTMLCanvasElement | null = null, glowB: HTMLCanvasElement | null = null;

  const toX = (x: number) => OX + x * S;
  const toY = (y: number) => OY + y * S;

  /** Hands in unit coords for a pose. */
  const handsX = (p: Pose) => SHOULDER_X + LUNGE_X * p.lunge * 0.6 + Math.cos(p.arm) * ARM_LEN;
  const handsY = (p: Pose) => SHOULDER_Y + LUNGE_Y * p.lunge * 0.6 + Math.sin(p.arm) * ARM_LEN;

  function ember(x: number, y: number, vx: number, vy: number, max: number, col: number, a: number) {
    const i = eHead;
    eHead = (eHead + 1) % NE;
    eX[i] = x; eY[i] = y; eVX[i] = vx; eVY[i] = vy; eAge[i] = 0; eMax[i] = max; eCol[i] = col; eA[i] = a;
  }

  function spawnCloak(i: number, anywhere: boolean) {
    const k = pick[(Math.random() * pick.length) | 0];
    const st = strands[k];
    pStrand[i] = k;
    pS[i] = anywhere ? Math.random() * st.len : Math.random() * STEP * 1.5;
    pSpeed[i] = rand(0.07, 0.2);
    // Spread across the strand, wider where the cloak trails off.
    const loose = st.loose[Math.min(st.n - 1, Math.floor(pS[i] / STEP))];
    pOff[i] = (Math.random() - 0.5) * 0.022 * (1 + loose * 1.6) * (0.4 + Math.random() * 0.8);
    pLen[i] = 0.0045 + Math.random() ** 2 * 0.0135;
    const j = (Math.random() - 0.5) * 0.55;
    pJc[i] = Math.cos(j);
    pJs[i] = Math.sin(j);
    const r = Math.random();
    pCol[i] = r < 0.035 ? ASH : r < 0.12 ? DEEP : r < 0.14 ? HOT : RED;
    pA[i] = rand(0.35, 1) * (pCol[i] === ASH ? 0.6 : 1);
  }

  function spawnBlade(i: number, anywhere: boolean) {
    if (scythe) {
      const staff = Math.random() < 0.38;
      bS[i] = staff ? -1 : anywhere ? Math.random() : Math.random() * 0.06;
      bW[i] = (Math.random() * 2 - 1) * (Math.random() < 0.3 ? 1.6 : 1);
      bU[i] = staff ? rand(SNATH_BUTT, SNATH) : 0;
      bV[i] = staff ? (Math.random() - 0.5) * 0.008 : 0;
      bSpeed[i] = staff ? 0 : rand(0.35, 0.8);
      bLen[i] = rand(0.005, 0.014);
      bA[i] = rand(0.4, 0.95);
      const c = Math.random();
      bCol[i] = c < 0.05 ? ASH : c < 0.2 ? HOT : staff && c < 0.45 ? DEEP : RED;
      return;
    }
    const grip = Math.random() < 0.1;
    const u = grip ? -Math.random() * GRIP_LEN : anywhere ? Math.random() ** 0.9 * BLADE_LEN : rand(-0.01, 0.05);
    bU[i] = u;
    const hw = grip ? 0.0045 : 0.014 * (1 - (Math.max(0, u) / BLADE_LEN) ** 1.3) + 0.0025;
    const r = Math.random();
    bV[i] = r < 0.3 ? (Math.random() < 0.5 ? -1 : 1) * hw * rand(0.75, 1.05)
      : r < 0.5 ? (Math.random() - 0.5) * hw * 0.5
      : r < 0.78 ? (Math.random() * 2 - 1) * hw
      : (Math.random() * 2 - 1) * hw * 2.3;
    bSpeed[i] = grip ? 0 : rand(0.16, 0.42);
    bLen[i] = rand(0.005, 0.016);
    bA[i] = rand(0.4, 0.95);
    const c = Math.random();
    bCol[i] = c < 0.03 ? ASH : u < 0.07 && c < 0.45 ? (c < 0.15 ? GOLD : HOT) : c < 0.1 ? HOT : RED;
  }

  function spawnRain(i: number, initial: boolean) {
    const z = Math.random() ** 1.6;
    rZ[i] = 0.25 + z * 0.75;
    rAng[i] = rand(0.78, 1.2);
    const k = Math.random();
    rKind[i] = k < 0.74 ? 0 : k < 0.8 ? 1 : k < 0.87 ? 2 : k < 0.93 ? 3 : k < 0.97 ? 4 : 5;
    if (initial) {
      rX[i] = Math.random() * W;
      rY[i] = Math.random() * H;
    } else if (Math.random() < W / (W + H)) {
      rX[i] = Math.random() * W * 1.1 - W * 0.15;
      rY[i] = -rand(10, 80);
    } else {
      rX[i] = -rand(10, 80);
      rY[i] = Math.random() * H;
    }
  }

  /** Bakes a soft dark silhouette that sits behind the figure. */
  function bakeShadow() {
    if (typeof document === "undefined") return;
    const sw = Math.max(8, Math.round(W / 4)), sh = Math.max(8, Math.round(H / 4));
    shadow = shadow || document.createElement("canvas");
    shadow.width = sw;
    shadow.height = sh;
    const s = shadow.getContext("2d");
    if (!s) return;
    s.clearRect(0, 0, sw, sh);
    s.lineCap = "round";
    s.lineJoin = "round";
    s.strokeStyle = "rgba(0,0,0,0.5)";
    s.lineWidth = Math.max(1, (0.03 * S) / 4);
    for (const st of strands) {
      s.beginPath();
      for (let i = 0; i < st.n; i++) {
        const x = toX(st.pts[i * 2]) / 4, y = toY(st.pts[i * 2 + 1]) / 4;
        if (i) s.lineTo(x, y);
        else s.moveTo(x, y);
      }
      s.stroke();
    }
    s.filter = "blur(3px)";
    s.globalCompositeOperation = "copy";
    s.drawImage(shadow, 0, 0);
    s.filter = "none";
    s.globalCompositeOperation = "source-over";
  }

  function impact() {
    flash = 1;
    shake = 1;
    gust = 1;
    const hx = handsX(cur), hy = handsY(cur);
    const ca = Math.cos(cur.blade), sa = Math.sin(cur.blade);
    const tip = strike(1);
    const tx = toX(hx + ca * tip.u - sa * tip.v), ty = toY(hy + sa * tip.u + ca * tip.v);
    // The blade was turning counter-clockwise: its tip was moving this way.
    const mx = sa, my = -ca;
    for (let i = 0; i < 70; i++) {
      const sp = rand(40, 420) * (S / 280);
      const a = Math.atan2(my, mx) + rand(-1.1, 1.1);
      ember(tx, ty, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.25, 0.8), Math.random() < 0.3 ? WHITE : Math.random() < 0.6 ? HOT : GOLD, rand(0.6, 1));
    }
  }

  /** Samples the blade between two cycle times for the slash trail. */
  function sampleTrail(c0: number, c1: number) {
    const steps = 10;
    for (let k = 1; k <= steps; k++) {
      const c = c0 + ((c1 - c0) * k) / steps;
      if (c < CUT - 0.02 || c > HIT + 0.08) continue;
      pose(c, sub);
      const hx = handsX(sub), hy = handsY(sub);
      const ca = Math.cos(sub.blade), sa = Math.sin(sub.blade);
      const i = tCount % NT;
      const tip = strike(1.03), inner = strike(0.32);
      tTipX[i] = toX(hx + ca * tip.u - sa * tip.v);
      tTipY[i] = toY(hy + sa * tip.u + ca * tip.v);
      tInX[i] = toX(hx + ca * inner.u - sa * inner.v);
      tInY[i] = toY(hy + sa * inner.u + ca * inner.v);
      tTime[i] = clock - (c1 - c);
      tCount++;
      // Dust thrown off the edge of the cut.
      if (c < HIT && Math.random() < 0.9) {
        for (let d = 0; d < 3; d++) {
          const at = strike(rand(0.45, 1));
          const sp = rand(20, 160) * (S / 280);
          ember(toX(hx + ca * at.u - sa * at.v), toY(hy + sa * at.u + ca * at.v), sa * sp + rand(-30, 30), -ca * sp + rand(-30, 30), rand(0.25, 0.65),
            Math.random() < 0.25 ? WHITE : Math.random() < 0.5 ? GOLD : HOT, rand(0.5, 1));
        }
      }
    }
  }

  function drawTrail(ctx: Ctx) {
    const n = Math.min(tCount, NT);
    if (n < 2) return;
    const first = tCount - n;
    for (let k = first; k < tCount - 1; k++) {
      const a = k % NT, b = (k + 1) % NT;
      // Never join the end of one cut to the start of the next.
      if (tTime[b] - tTime[a] > 0.05) continue;
      const age = clock - tTime[b];
      // The fill only trails the blade briefly; the hot edge lingers.
      const fill = 1 - age / 0.11;
      const life = 1 - age / 0.3;
      if (life <= 0) continue;
      const band = (from: number, to: number, style: string) => {
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.moveTo(tInX[a] + (tTipX[a] - tInX[a]) * from, tInY[a] + (tTipY[a] - tInY[a]) * from);
        ctx.lineTo(tInX[a] + (tTipX[a] - tInX[a]) * to, tInY[a] + (tTipY[a] - tInY[a]) * to);
        ctx.lineTo(tInX[b] + (tTipX[b] - tInX[b]) * to, tInY[b] + (tTipY[b] - tInY[b]) * to);
        ctx.lineTo(tInX[b] + (tTipX[b] - tInX[b]) * from, tInY[b] + (tTipY[b] - tInY[b]) * from);
        ctx.closePath();
        ctx.fill();
      };
      if (fill > 0) {
        band(0.62, 1, `rgba(${look.trail[0]},${(0.08 * fill * fill).toFixed(3)})`);
        band(0.84, 1, `rgba(${look.trail[1]},${(0.16 * fill).toFixed(3)})`);
      }
      const edge = life * life;
      band(0.93, 1, `rgba(${look.trail[2]},${(0.26 * edge).toFixed(3)})`);
      band(0.978, 1, `rgba(${look.trail[3]},${(0.8 * edge * life).toFixed(3)})`);
    }
  }

  function drawFlare(ctx: Ctx, hx: number, hy: number, guardA: number, heat: number) {
    const X = toX(hx), Y = toY(hy);
    const I = 0.85 + heat * 0.7 + Math.sin(clock * 41) * 0.06 + Math.sin(clock * 23) * 0.05;
    const halo = ctx.createRadialGradient(X, Y, 0, X, Y, 0.11 * S);
    halo.addColorStop(0, `rgba(${look.flare[0]},${0.2 * I})`);
    halo.addColorStop(1, `rgba(${look.flare[0]},0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(X - 0.11 * S, Y - 0.11 * S, 0.22 * S, 0.22 * S);
    const core = ctx.createRadialGradient(X, Y, 0, X, Y, 0.026 * S);
    core.addColorStop(0, `rgba(${look.flare[1]},${Math.min(1, 0.9 * I)})`);
    core.addColorStop(0.3, `rgba(${look.flare[2]},${0.55 * I})`);
    core.addColorStop(1, `rgba(${look.flare[2]},0)`);
    ctx.fillStyle = core;
    ctx.fillRect(X - 0.026 * S, Y - 0.026 * S, 0.052 * S, 0.052 * S);

    const ray = (ang: number, len: number, width: number, alpha: number) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      const ex = X + c * len * S, ey = Y + s * len * S;
      const g = ctx.createLinearGradient(X, Y, ex, ey);
      g.addColorStop(0, `rgba(${look.flare[3]},${alpha})`);
      g.addColorStop(0.35, `rgba(${look.flare[4]},${alpha * 0.5})`);
      g.addColorStop(1, `rgba(${look.flare[4]},0)`);
      ctx.fillStyle = g;
      const w = width * LW;
      ctx.beginPath();
      ctx.moveTo(X - s * w, Y + c * w);
      ctx.lineTo(ex, ey);
      ctx.lineTo(X + s * w, Y - c * w);
      ctx.closePath();
      ctx.fill();
    };
    // Long glints along the guard, shorter ones across it.
    ray(guardA + Math.PI, 0.12 * (0.9 + 0.2 * I), 0.9, Math.min(1, 0.75 * I));
    ray(guardA, 0.1 * (0.9 + 0.2 * I), 0.85, Math.min(1, 0.7 * I));
    ray(guardA + Math.PI / 2, 0.04, 0.7, 0.5 * I);
    ray(guardA - Math.PI / 2, 0.045, 0.7, 0.5 * I);
    if (rays.length === 0 || Math.random() < 0.25) {
      rays.length = 0;
      for (let i = 0; i < 12; i++) rays.push(Math.random() * Math.PI * 2, rand(0.014, 0.05));
    }
    for (let i = 0; i < rays.length; i += 2) ray(rays[i], rays[i + 1], 0.5, 0.45 * I);
  }

  function star(ctx: Ctx, X: number, Y: number, ang: number, size: number, alpha: number) {
    ctx.strokeStyle = `rgba(${look.flare[5]},${alpha})`;
    ctx.lineWidth = LW * 0.7;
    ctx.beginPath();
    const c = Math.cos(ang), s = Math.sin(ang);
    ctx.moveTo(X - c * size, Y - s * size);
    ctx.lineTo(X + c * size, Y + s * size);
    ctx.moveTo(X + s * size * 0.6, Y - c * size * 0.6);
    ctx.lineTo(X - s * size * 0.6, Y + c * size * 0.6);
    ctx.stroke();
  }

  const paths: Path2D[] = [];

  return {
    init(w, h, density) {
      W = w;
      H = h;
      if (layout === "full") {
        S = Math.min(w, h);
        OX = (w - S) / 2;
        OY = (h - S) / 2;
      } else {
        // x from -0.18 (the far end of the cut) to 0.8; the trailing cloak runs off the edge.
        S = Math.min(w / 0.98, h / 0.97);
        OX = w - 0.8 * S;
        OY = h - S;
      }
      LW = Math.max(0.8, Math.min(1.4, S / 480));
      strands = strandsOf();

      // Strands are picked by length and brightness.
      const weights = strands.map((st) => st.len * (0.3 + 0.7 * st.weight));
      const total = weights.reduce((a, b) => a + b, 0);
      pick = new Uint16Array(4096);
      let k = 0, acc = 0;
      for (let i = 0; i < pick.length; i++) {
        const target = ((i + 0.5) / pick.length) * total;
        while (k < strands.length - 1 && acc + weights[k] < target) acc += weights[k++];
        pick[i] = k;
      }

      const scale = (S / 280) ** 2;
      np = Math.round(Math.max(500, Math.min(7000, 3200 * scale * density)));
      pStrand = new Uint16Array(np);
      pS = new Float32Array(np); pSpeed = new Float32Array(np); pOff = new Float32Array(np);
      pLen = new Float32Array(np); pJc = new Float32Array(np); pJs = new Float32Array(np); pA = new Float32Array(np);
      pCol = new Uint8Array(np);
      for (let i = 0; i < np; i++) spawnCloak(i, true);

      nb = Math.round(Math.max(100, Math.min(800, 300 * (S / 280) * density)));
      bU = new Float32Array(nb); bV = new Float32Array(nb); bSpeed = new Float32Array(nb);
      bLen = new Float32Array(nb); bA = new Float32Array(nb); bCol = new Uint8Array(nb);
      bS = new Float32Array(nb); bW = new Float32Array(nb);
      for (let i = 0; i < nb; i++) spawnBlade(i, true);

      nr = Math.round(Math.max(10, Math.min(110, 46 * ((w * h) / (300 * 440)) * density)));
      rX = new Float32Array(nr); rY = new Float32Array(nr); rZ = new Float32Array(nr); rAng = new Float32Array(nr);
      rKind = new Uint8Array(nr);
      for (let i = 0; i < nr; i++) spawnRain(i, true);

      eAge.fill(1);
      tCount = 0;
      bakeShadow();
      if (typeof document !== "undefined") {
        glowA = glowA || document.createElement("canvas");
        glowB = glowB || document.createElement("canvas");
      }
      prevHX = handsX(cur);
      prevHY = handsY(cur);
      prevBlade = cur.blade;
    },

    frame(ctx, _t, dt) {
      clock += dt;
      const c = clock % CYCLE;
      const cycle = Math.floor(clock / CYCLE);
      const c0 = lastC < 0 || lastC > c ? c : lastC;
      lastC = c;
      pose(c, cur);
      if (c >= CUT - 0.02 && c <= HIT + 0.08) sampleTrail(c0, c);
      if (c >= HIT && hitCycle !== cycle) {
        hitCycle = cycle;
        impact();
      }
      flash = Math.max(0, flash - dt * 3.2);
      shake *= Math.exp(-dt * 10);
      gust *= Math.exp(-dt * 2.2);

      const hx = handsX(cur), hy = handsY(cur);
      const dArm = cur.arm - ARM_HERO;
      const lx = LUNGE_X * cur.lunge, ly = LUNGE_Y * cur.lunge;
      const sx = SHOULDER_X + lx * 0.6, sy = SHOULDER_Y + ly * 0.6;
      const flow = 1 + gust * 2.6;
      const billow = 0.0045 * (1 + gust * 2.4);
      const ca = Math.cos(cur.blade), sa = Math.sin(cur.blade);

      // Arm rotation, by how firmly a point follows the arm (0..32).
      const rc = new Float32Array(33), rs = new Float32Array(33);
      for (let q = 0; q <= 32; q++) {
        rc[q] = Math.cos((dArm * q) / 32);
        rs[q] = Math.sin((dArm * q) / 32);
      }

      for (let b = 0; b < STYLES.length; b++) paths[b] = new Path2D();

      /* cloak */
      for (let i = 0; i < np; i++) {
        const st = strands[pStrand[i]];
        let s = pS[i] + pSpeed[i] * flow * dt;
        if (s >= st.len) {
          if (st.sheds && Math.random() < 0.7) {
            const ex = st.pts[st.n * 2 - 2], ey = st.pts[st.n * 2 - 1];
            const tx = st.tan[st.n * 2 - 2], ty = st.tan[st.n * 2 - 1];
            const sp = pSpeed[i] * flow * S * rand(1.6, 3.2);
            ember(toX(ex), toY(ey), tx * sp + rand(5, 40), ty * sp + rand(0, 30), rand(0.6, 1.7), pCol[i] === ASH ? ASH : pCol[i] === DEEP ? DEEP : RED, pA[i] * 0.75);
          }
          spawnCloak(i, false);
          s = pS[i];
        }
        pS[i] = s;
        const f = s / STEP;
        let k = f | 0;
        if (k > st.n - 2) k = st.n - 2;
        const fr = f - k;
        const P = st.pts, T = st.tan;
        let x = P[k * 2] + (P[k * 2 + 2] - P[k * 2]) * fr;
        let y = P[k * 2 + 1] + (P[k * 2 + 3] - P[k * 2 + 1]) * fr;
        let tx = T[k * 2], ty = T[k * 2 + 1];
        x += -ty * pOff[i];
        y += tx * pOff[i];
        const loose = st.loose[k];
        if (loose > 0) {
          x += Math.sin(clock * 1.7 + y * 9 + x * 4) * billow * loose;
          y += Math.sin(clock * 1.3 + x * 7) * billow * 0.6 * loose;
        }
        // Upper body leans into the cut.
        const upper = 1 - smooth(0.5, 0.82, y);
        x += lx * upper;
        y += ly * upper;
        const aw = st.arm[k];
        if (aw > 0.01 && dArm !== 0) {
          const q = Math.round(aw * 32);
          const dx = x - sx, dy = y - sy;
          x = sx + dx * rc[q] - dy * rs[q];
          y = sy + dx * rs[q] + dy * rc[q];
          const ntx = tx * rc[q] - ty * rs[q];
          ty = tx * rs[q] + ty * rc[q];
          tx = ntx;
        }
        // Jitter the stroke angle a little, like hand-drawn hatching.
        const dx = tx * pJc[i] - ty * pJs[i], dy = tx * pJs[i] + ty * pJc[i];
        const half = pLen[i] * S * 0.5;
        const u = s / st.len;
        const a = pA[i] * (0.45 + 0.55 * st.weight) * smooth(0, 0.1, u) * (st.sheds ? 1 : 1 - smooth(0.85, 1, u));
        if (a < 0.08) continue;
        const X = toX(x), Y = toY(y);
        const p = paths[pCol[i] * 4 + level(a)];
        p.moveTo(X - dx * half, Y - dy * half);
        p.lineTo(X + dx * half, Y + dy * half);
      }

      /* blade */
      const fast = Math.abs(cur.blade - prevBlade) > 0.025;
      const pca = Math.cos(prevBlade), psa = Math.sin(prevBlade);
      for (let i = 0; i < nb; i++) {
        let u: number, v: number, tipFade: number;
        if (scythe) {
          if (bS[i] >= 0) {
            bS[i] += bSpeed[i] * dt * (1 + cur.heat * 0.8);
            if (bS[i] > 0.99) spawnBlade(i, false);
          } else if (Math.random() < dt * 1.5) spawnBlade(i, false);
          if (bS[i] >= 0) {
            const at = crescent(bS[i]);
            // Thick at the heel, a hair at the point; the edge is the inner curve.
            const hw = 0.034 * (1 - bS[i]) ** 0.8 + 0.002;
            u = at.u - bW[i] * hw;
            v = at.v;
            tipFade = 1 - smooth(0.85, 0.99, bS[i]);
          } else {
            u = bU[i];
            v = bV[i];
            tipFade = 1;
          }
        } else {
          u = bU[i] + bSpeed[i] * dt * (1 + cur.heat * 0.8);
          if (u > BLADE_LEN * 0.97 || (bSpeed[i] === 0 && Math.random() < dt * 1.5)) {
            spawnBlade(i, false);
            u = bU[i];
          }
          bU[i] = u;
          v = bV[i];
          tipFade = 1 - smooth(BLADE_LEN * 0.82, BLADE_LEN * 0.97, u);
        }
        const x = hx + ca * u - sa * v, y = hy + sa * u + ca * v;
        const X = toX(x), Y = toY(y);
        const a = bA[i] * tipFade * (0.8 + cur.heat * 0.3);
        if (a < 0.08) continue;
        const col = cur.heat > 0.6 && bCol[i] === RED && i % 3 === 0 ? HOT : bCol[i];
        if (fast) {
          if (i % 3) continue;
          const p = paths[col * 4 + Math.max(0, level(Math.min(1, a)) - 1)];
          // Smear back over half of where this point travelled since last frame.
          const ox = toX(prevHX + pca * u - psa * v), oy = toY(prevHY + psa * u + pca * v);
          p.moveTo(X + (ox - X) * 0.5, Y + (oy - Y) * 0.5);
          p.lineTo(X, Y);
        } else {
          const p = paths[col * 4 + level(Math.min(1, a))];
          const half = bLen[i] * S * 0.5;
          p.moveTo(X - ca * half, Y - sa * half);
          p.lineTo(X + ca * half, Y + sa * half);
        }
        // The blade fizzes: now and then a spark jumps off its edge.
        if (Math.random() < dt * (0.9 + cur.heat * 4) && u > 0.02) {
          const side = v >= 0 ? 1 : -1;
          const sp = rand(20, 90) * (S / 280);
          ember(X, Y, -sa * side * sp + ca * sp * 0.4, ca * side * sp + sa * sp * 0.4, rand(0.12, 0.35), Math.random() < 0.4 ? HOT : RED, rand(0.5, 0.9));
        }
      }
      // Cross-guard: a shimmering bar of embers.
      const gA = cur.blade + GUARD_TURN;
      const gc = Math.cos(gA), gs = Math.sin(gA);
      const gn = scythe ? 0 : Math.round(45 * (S / 280));
      for (let i = 0; i < gn; i++) {
        const g = rand(GUARD_NEAR, GUARD_FAR);
        const v = (Math.random() - 0.5) * 0.007;
        const X = toX(hx + gc * g - gs * v), Y = toY(hy + gs * g + gc * v);
        const half = rand(0.004, 0.012) * S * 0.5;
        const p = paths[(Math.abs(g) < 0.02 ? HOT : RED) * 4 + 2 + (Math.random() < 0.4 ? 1 : 0)];
        p.moveTo(X - gc * half, Y - gs * half);
        p.lineTo(X + gc * half, Y + gs * half);
      }

      /* loose embers */
      const wind = S * 0.25 * (1 + gust * 2);
      for (let i = 0; i < NE; i++) {
        if (eAge[i] >= eMax[i]) continue;
        eAge[i] += dt;
        const drag = 1 - Math.min(0.9, dt * 1.6);
        eVX[i] = eVX[i] * drag + wind * 0.5 * dt;
        eVY[i] = eVY[i] * drag + wind * 0.35 * dt;
        eX[i] += eVX[i] * dt;
        eY[i] += eVY[i] * dt;
        const life = 1 - eAge[i] / eMax[i];
        const a = eA[i] * life;
        if (a < 0.08) continue;
        const v = Math.hypot(eVX[i], eVY[i]) || 1;
        const len = Math.min(10, Math.max(1.4, v * 0.028)) * 0.5;
        const p = paths[eCol[i] * 4 + level(a)];
        p.moveTo(eX[i] - (eVX[i] / v) * len, eY[i] - (eVY[i] / v) * len);
        p.lineTo(eX[i] + (eVX[i] / v) * len, eY[i] + (eVY[i] / v) * len);
      }

      /* ---- draw ---- */
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      if (shake > 0.02) ctx.translate((Math.random() - 0.5) * 6 * shake * LW, (Math.random() - 0.5) * 6 * shake * LW);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      // Rain and glitchy dotted streaks behind everything.
      const rainMul = 1 + gust * 1.6;
      const greyPath = new Path2D(), bluePath = new Path2D(), redPath = new Path2D();
      for (let i = 0; i < nr; i++) {
        const z = rZ[i], ang = rAng[i] - gust * 0.25;
        const sp = (0.8 + 1.7 * z) * S * rainMul;
        const cx = Math.cos(ang), cy = Math.sin(ang);
        rX[i] += cx * sp * dt;
        rY[i] += cy * sp * dt;
        if (rX[i] > W + 90 || rY[i] > H + 90) spawnRain(i, false);
        const len = (0.035 + 0.11 * z) * S;
        const x0 = rX[i], y0 = rY[i], x1 = x0 - cx * len, y1 = y0 - cy * len;
        const kind = rKind[i];
        if (kind <= 2) {
          const p = kind === 0 ? greyPath : kind === 1 ? bluePath : redPath;
          p.moveTo(x1, y1);
          p.lineTo(x0, y0);
        } else if (kind === 5) {
          ctx.lineWidth = LW * 0.6;
          const nx = -cy * 0.9 * LW, ny = cx * 0.9 * LW;
          const al = 0.12 + 0.3 * z;
          for (const [rgb, o] of [["255,40,40", 1], ["40,255,120", 0], ["60,90,255", -1]] as const) {
            ctx.strokeStyle = `rgba(${rgb},${al})`;
            ctx.beginPath();
            ctx.moveTo(x1 + nx * o, y1 + ny * o);
            ctx.lineTo(x0 + nx * o, y0 + ny * o);
            ctx.stroke();
          }
        } else {
          const gap = 0.012 * S;
          const dots = Math.max(3, Math.floor(len / gap));
          const al = 0.18 + 0.4 * z;
          const d = Math.max(1, LW * 1.1);
          for (let j = 0; j < dots; j++) {
            const x = x0 - cx * gap * j, y = y0 - cy * gap * j;
            ctx.fillStyle = kind === 3 ? `rgba(230,236,255,${al * (1 - j / dots)})`
              : `rgba(${j % 3 === 0 ? "255,60,60" : j % 3 === 1 ? "60,255,140" : "80,110,255"},${al * (1 - j / dots)})`;
            ctx.fillRect(x - d / 2, y - d / 2, d, d);
          }
        }
      }
      ctx.lineWidth = LW * 0.6;
      ctx.strokeStyle = "rgba(205,210,225,0.17)";
      ctx.stroke(greyPath);
      ctx.strokeStyle = "rgba(70,90,255,0.24)";
      ctx.stroke(bluePath);
      ctx.strokeStyle = `rgba(${look.colors[RED]},0.3)`;
      ctx.stroke(redPath);

      drawTrail(ctx);

      for (let b = 0; b < STYLES.length; b++) {
        ctx.strokeStyle = STYLES[b];
        ctx.lineWidth = b >= ASH * 4 && b < WHITE * 4 ? LW * 0.75 : LW;
        ctx.stroke(paths[b]);
      }

      // Star glints at both ends of the guard, and the flare at the hands.
      const glint = 0.7 + cur.heat * 0.3 + Math.sin(clock * 9) * 0.1;
      if (!scythe) {
        star(ctx, toX(hx + gc * GUARD_NEAR), toY(hy + gs * GUARD_NEAR), gA, 0.014 * S, glint * 0.7);
        star(ctx, toX(hx + gc * GUARD_FAR), toY(hy + gs * GUARD_FAR), gA, 0.012 * S, glint * 0.6);
      } else {
        const tip = strike(1);
        star(ctx, toX(hx + ca * tip.u - sa * tip.v), toY(hy + sa * tip.u + ca * tip.v), gA, 0.016 * S, glint * 0.8);
      }
      drawFlare(ctx, hx, hy, gA, cur.heat);

      // Bloom: shrink the frame twice and add it back blurred.
      if (glowA && glowB && W > 120) {
        const cw = ctx.canvas.width, ch = ctx.canvas.height;
        const aw = Math.max(4, Math.round(cw / 4)), ah = Math.max(4, Math.round(ch / 4));
        const bw = Math.max(2, Math.round(cw / 12)), bh = Math.max(2, Math.round(ch / 12));
        if (glowA.width !== aw || glowA.height !== ah) { glowA.width = aw; glowA.height = ah; }
        if (glowB.width !== bw || glowB.height !== bh) { glowB.width = bw; glowB.height = bh; }
        const ga = glowA.getContext("2d"), gb = glowB.getContext("2d");
        if (ga && gb) {
          ga.globalCompositeOperation = "copy";
          ga.drawImage(ctx.canvas, 0, 0, aw, ah);
          gb.globalCompositeOperation = "copy";
          gb.drawImage(glowA, 0, 0, bw, bh);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 0.34;
          ctx.drawImage(glowA, 0, 0, cw, ch);
          ctx.globalAlpha = 0.6;
          ctx.drawImage(glowB, 0, 0, cw, ch);
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();

      // Behind it all: the dark silhouette, then the flash of the cut.
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      if (shadow) ctx.drawImage(shadow, 0, 0, W, H);
      if (flash > 0) {
        ctx.fillStyle = `rgba(${look.flash},${(flash * flash * 0.12).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();

      prevHX = hx;
      prevHY = hy;
      prevBlade = cur.blade;
    },
  };
}

/* The traced figure (format in the header comment). */
const STRANDS = `
hhAUsjhebXVTSUUUTSTSSSSRRQOFA/9 3eSUacZXVRPQ
agx4Qroooprrqrrrrqrqqrrssstrqrrttsootz3AEEEEDCB//++99877666753454667/BGHIJIJKMOPMKIJKKJJHFEDEFHIHI
0e7U1UTTUZY papkLB///9++888779++98881x28ACFG 5eVVEUSUW ujmhN7999830
eVkkZy2+FEEEEECBAABCA+8+/ABBDHIJIIIIGHHHHJKK ofoU7UTTSZbYXVT xn5eObWaba
WefkF/9+9///AA+88/BCEGKKJJKLLMMLNMLMMMLLIIFDCFDEF qfaUCgecZXUTQQRRRSSTR
WSthSUOMLLLMMPSTQLLLMNMONOONLMMML jUOh9VQLJHHKN sp9cTifbaZYZYXXZaaaa pb5knA//AAA/++ABB
XZfkVIKHDGIKJIKKLK eQKeQXQKGHLNLLLLLLNRUSM dXNjaFEIKKGCEIJJIKKL jP2eDXVSSTUUW
ggLigcddeefghjjkkkkjjgdUOMLKLLMQRQPON khbjJ+98+99878+CHJL oYZkTLKH jbDk+DBCBCB+989/ jXMjvJKKHHEBDG
OWpjSOMKJIHFDEFIIIJJKKJJJIIIIJJJJFEEFGFEGFEEFGGFFEDECCCDDDDDEECC
ZYScYA+91xxwxwxz03468+BDFGJLLLLLLMNOQSW lRfgdLO fPodmYWUTSSUUP knZd79/99 mjgjdBCG fQnbiTW
fPpgGKKIKKLKLLM WPRfsQOKHHJLLLLMNRROKJJLMNN lVdiJaUN ZWYjXSPLMNMLKMN dYQc7BA
ZRoeGLJIFFEFEEFEEDDB//+9+8867564323645659BCEIK hQDfDG+GHGDE fj1i6+/977+BFG baak7HEDDDCB/7989AABCEF
SSDdnMKIFFFFEEFEEDCB//9998775642ysrqqqpppohebYWUTTSTTS Tr1kYsutrpops3+CEGHJLONMKJJKJJ egFVWUTSR
WXvdeCDDKOP bTyh1VQLKJJIMLLJJK XqOjWkhfdbRKKJ RSRcj++ WW9dkECCE WgxVGVUSRP
OWfkXMKKJJFEEFIHJJJJJIJJIJIIJJJIHEFGHGGEEEDDFHFFEDDCCDDFDDEEGFFEFFEED VpbfFMGHHGGHJJ
RgKnS389+/ABCEFHHHGG Vjzeoz453658+BCDFKLL QU/mILMLMMMM Wp4fIDEHIJK TQDbjTVXXVUTSSUSO
OcmmRFEEEIJKIJJJJKJIJJIIKKJIIGFFGGIGGFEEEFFEDEEDDD Vp3fbGFHH UfeZNhdaWVTTTTT Rrlk9nnljgdYMKKJKIJ
PqTglHJJLLJJJJJLKIHHHHHGGHGFEEEEDDBCDDCA/ Owlo7IKLLLLLMNOKGEEEEDCBB/AAACC
NtnlTKKMLLLNNMNMLLLKJEEFEEEEDC QYGb9A+7zxwxxxy013578/BDEHHJJJJJKKJIGCBCBDFHLLNKJJKNOPMIHJJKLM
PSOdY99/BEHHDCCFMOO PPVYX/43 PVenzOPPPPONNNOPOOLMMN WPChVRSYa Pu7mAKJJGFFEECEFGHH OW2ZMUSM
PPWiYHGJNOPP QheVCTUTRPNLKKKKKL YeHmsCD OiSWaPQQPONKKM MoHkeIHIIIJKKKJKJJILLLLKIHGIJKKHHGG
PiAZARNLKKL Pz3rgJIDDD OyRqWJKMMOOOJFEEEECCCB//CBCC PvfpKNONNMMMKK NyCpbGEEEEEFGGF iQFfuE+
Kyyw6FFFEFGGEECBBBDDDDD Nl6zcEGFFFFEEDFGGFFDD ProiaNOLKKLLMMMMO
MdKm5HGHHIIIIJKJKJJJKIKLKJIIFFEFFFHFGFEEEE MovlcJIJKJJJI Ou7nBLKJKLMLLLKMMP MWwpQKKKMMMLLLLLKKIJKK
MSsdj+/DFGFEBCGL VYwmSHEDCGHIIJK NnkkO7ADGHGHJLLMLLM LWUplOQONMLNQQONMLK
LSteGKHGEFFFEFEDDCA/+998875642vrqrqopnkgbXUUTTSUTTRP OinYfMOMLLO QwSpwMNMLKLLN
LoNsDrqpnmllmnmjeRMKKKJIJJIJHHIHHHGIIIJJIIHFEEFEGFEF N0Aq7EFFFFFEECCBBDCCA M0cyHGHIIGFECCBDFFEEDC
OjBWjJKJKKKLUXV M1yyzHHGFDCCCDDDDCD OhHotrw5/BDFG NhtVXRTSRP
KXdmjLKHFEFGHIKJIIJIJIJJIIJJHHFGHIHHHGHHIHGGGGIJI Ls6jjJHHHJKIGFFEEDDGHHI
NPXhtIHHKMMNNPQPMLJJKLMNNNOOMLLN LiwmfBAADEFGHGGFGF Kj3m9CCEFHGIHIJLLLLKKLKIHIJKKIIIHFEFFHHGF
KXGbMCC+4ywxwxyz134578/ADEFHIJJIJKJKIHFCBCCEGILMM K0ZtY/BCDDFEEFEFFEEDG Ni6XkOMNNMN
MhNpEJKJJJJJIJIHIIHHHHIHIJIHGFEE KXNspKLNPQNMMKJ MSnUkWWXXYagg
J+lxliiihgijijjkklnv+BBDEEFGGGFDDCDE JzdxlIIJIIHFFDCBCDGFFEDC LX7n/KKNNNMMLKKKLKLMNLLLLJII
KouktGHHHJKLKLKKJ JPcbJSTWXWVTRSTTQKD+7+J Js/wcJIJKKJIJKHFFEHGFDFFDDCCD LXuX5TUTS
KwJ15GGFFFGHEDDEECCCCCCCD K5muWDDDDDDA/ KsMiSIHIHHJJKIG KNVkBA66DIMPPP Km+0yHHGFGGGGHGEFH
Jwx9iHHGGDCA LiAW0RRS J+O/MEB Jqc2pEEEHFFEECDDDDFEEDEFFFDEFEED Jj3njGGGH Kw645CCCDEDDDEFGEFGFF
K3qzSDDBABBDDEDC MjpX2KLKMO JjSy3HGGGIHHHHHHHHHHGHHHH KoSkPBFHGHIKLLMKLLJ JhdncEFHGFE gozftNH
Mmxv0JJIHIGGH J1U+2CF I7WtTBDDCBA ZUxolSP IqH3RHHHGGFFIKK IuFwlGHKKKIIIFEEGHI
IYPsvMLMMMLKJJIJJLKKJHIJKKJ dYqdPCCL LnxkhLKJJKJJII
`;
