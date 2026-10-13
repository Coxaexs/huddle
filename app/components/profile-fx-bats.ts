/*
 * Nightwing: a swarm of bats circles a blood moon, sweeps across the card,
 * then spirals into a vortex of dark mist where a vampire's red eyes open,
 * before the swarm bursts apart and drifts back to the moon.
 */
import type { Scene } from "./particle-scenes";

type Ctx = CanvasRenderingContext2D;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const CYCLE = 10;

interface Bat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  flap: number;
  rate: number;
  size: number;
  slot: number;
  depth: number;
}

function drawBat(ctx: Ctx, b: Bat, alpha: number) {
  const s = b.size;
  const f = Math.sin(b.flap);
  const bank = Math.max(-0.5, Math.min(0.5, b.vx / 400));
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(bank);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    // Wing: up-stroke to down-stroke, with a scalloped trailing edge.
    const lift = -f * 0.55;
    ctx.moveTo(0, -s * 0.05);
    ctx.quadraticCurveTo(side * s * 0.45, -s * (0.35 + lift * 0.6), side * s * 1.05, -s * (0.12 + lift));
    ctx.quadraticCurveTo(side * s * 0.92, s * 0.08, side * s * 0.78, s * (0.14 - lift * 0.3));
    ctx.quadraticCurveTo(side * s * 0.62, s * 0.02, side * s * 0.5, s * (0.16 - lift * 0.2));
    ctx.quadraticCurveTo(side * s * 0.36, s * 0.06, side * s * 0.24, s * 0.2);
    ctx.quadraticCurveTo(side * s * 0.14, s * 0.08, 0, s * 0.14);
  }
  // Body and ears.
  ctx.moveTo(s * 0.11, 0);
  ctx.ellipse(0, s * 0.02, s * 0.11, s * 0.24, 0, 0, Math.PI * 2);
  ctx.moveTo(-s * 0.1, -s * 0.15);
  ctx.lineTo(-s * 0.07, -s * 0.34);
  ctx.lineTo(-s * 0.02, -s * 0.18);
  ctx.lineTo(s * 0.02, -s * 0.18);
  ctx.lineTo(s * 0.07, -s * 0.34);
  ctx.lineTo(s * 0.1, -s * 0.15);
  ctx.fillStyle = `rgba(10,3,8,${alpha})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(255,50,50,${0.28 * alpha})`;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.restore();
}

export function nightwing(): Scene {
  let W = 0, H = 0, clock = 0, burstCycle = -1;
  let bats: Bat[] = [];
  let mx = 0, my = 0, mr = 0;
  let craters: Array<[number, number, number]> = [];

  return {
    init(w, h, density) {
      W = w;
      H = h;
      mr = w * 0.15;
      mx = w * 0.72;
      my = h * 0.13;
      craters = Array.from({ length: 9 }, () => [rand(-0.6, 0.6), rand(-0.6, 0.6), rand(0.08, 0.22)]);
      const n = Math.round(Math.max(14, Math.min(60, 34 * density * (w / 300))));
      bats = Array.from({ length: n }, (_, i) => {
        const depth = Math.random();
        return {
          x: mx + rand(-mr * 2, mr * 2),
          y: my + rand(-mr, mr * 2),
          vx: 0,
          vy: 0,
          flap: rand(0, 6.28),
          rate: rand(11, 17),
          size: w * (0.035 + 0.05 * depth),
          slot: i / n,
          depth,
        };
      });
    },

    frame(ctx, _t, dt) {
      clock += dt;
      const c = clock % CYCLE;
      const cycle = Math.floor(clock / CYCLE);
      // Where the swarm is headed in each part of the cycle.
      const gather = smooth(5.0, 6.0, c) * (1 - smooth(7.4, 7.6, c));
      const sweep = smooth(2.4, 3.0, c) * (1 - smooth(4.8, 5.2, c));
      const vx0 = W * 0.5, vy0 = H * 0.55;
      if (c > 7.4 && burstCycle !== cycle) {
        burstCycle = cycle;
        for (const b of bats) {
          const a = Math.atan2(b.y - vy0, b.x - vx0) + rand(-0.4, 0.4);
          const sp = rand(260, 520) * (W / 300);
          b.vx = Math.cos(a) * sp;
          b.vy = Math.sin(a) * sp;
        }
      }

      for (const b of bats) {
        const ang = b.slot * Math.PI * 2 + clock * (0.8 + b.depth * 0.6);
        let tx: number, ty: number;
        if (gather > 0.5) {
          const rr = W * (0.08 + 0.22 * b.slot) * (1.2 - gather * 0.5);
          tx = vx0 + Math.cos(ang * 2.2) * rr;
          ty = vy0 + Math.sin(ang * 2.2) * rr * 0.6;
        } else if (sweep > 0.5) {
          const k = (c - 2.4) / 2.6;
          tx = W * (1.1 - 1.3 * k) + Math.sin(ang * 3) * W * 0.18;
          ty = H * (0.25 + 0.5 * k + 0.2 * Math.sin(k * 6 + b.slot * 9)) + Math.cos(ang * 2) * H * 0.06;
        } else {
          const rr = mr * (1.5 + 1.4 * b.slot);
          tx = mx + Math.cos(ang) * rr;
          ty = my + Math.sin(ang) * rr * 0.55 + mr * 0.4;
        }
        const pull = gather > 0.5 ? 5 : 2.4;
        b.vx += ((tx - b.x) * pull - b.vx) * Math.min(1, dt * 2.2);
        b.vy += ((ty - b.y) * pull - b.vy) * Math.min(1, dt * 2.2);
        b.vx += Math.sin(clock * 3 + b.slot * 40) * 40 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.flap += b.rate * dt;
      }

      ctx.save();
      ctx.clearRect(0, 0, W, H);

      // Blood moon with its halo and drifting cloud.
      const halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 3);
      halo.addColorStop(0, "rgba(255,40,30,0.35)");
      halo.addColorStop(1, "rgba(255,0,0,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
      const moon = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
      moon.addColorStop(0, "#ff7a5a");
      moon.addColorStop(0.6, "#c41a14");
      moon.addColorStop(1, "#6a0508");
      ctx.fillStyle = moon;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "rgba(90,0,6,0.35)";
      for (const [cx, cy, cr] of craters) {
        ctx.beginPath();
        ctx.arc(mx + cx * mr, my + cy * mr, cr * mr, 0, Math.PI * 2);
        ctx.fill();
      }
      const cloudX = ((clock * 12) % (mr * 5)) - mr * 2.5;
      const cloud = ctx.createRadialGradient(mx + cloudX, my + mr * 0.2, 0, mx + cloudX, my + mr * 0.2, mr * 1.1);
      cloud.addColorStop(0, "rgba(15,5,10,0.65)");
      cloud.addColorStop(1, "rgba(15,5,10,0)");
      ctx.fillStyle = cloud;
      ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      ctx.restore();

      // Low red fog, and the dark vortex the swarm gathers into.
      const fog = ctx.createLinearGradient(0, H * 0.7, 0, H);
      fog.addColorStop(0, "rgba(60,0,8,0)");
      fog.addColorStop(1, "rgba(60,0,8,0.45)");
      ctx.fillStyle = fog;
      ctx.fillRect(0, H * 0.7, W, H * 0.3);
      if (gather > 0.01) {
        for (let i = 0; i < 5; i++) {
          const a = clock * (0.8 + i * 0.3) + i * 1.3;
          const x = vx0 + Math.cos(a) * W * 0.06, y = vy0 + Math.sin(a) * W * 0.04;
          const mist = ctx.createRadialGradient(x, y, 0, x, y, W * (0.28 + i * 0.04));
          mist.addColorStop(0, `rgba(8,0,4,${0.42 * gather})`);
          mist.addColorStop(0.6, `rgba(40,0,8,${0.2 * gather})`);
          mist.addColorStop(1, "rgba(40,0,8,0)");
          ctx.fillStyle = mist;
          ctx.fillRect(0, 0, W, H);
        }
      }

      // Far bats first.
      bats.sort((a, b) => a.depth - b.depth);
      for (const b of bats) drawBat(ctx, b, 0.55 + 0.45 * b.depth);

      // The eyes open in the heart of the vortex.
      const eyes = smooth(5.7, 6.1, c) * (1 - smooth(7.2, 7.5, c));
      if (eyes > 0.01) {
        const open = eyes * (0.85 + 0.15 * Math.sin(clock * 9));
        ctx.save();
        ctx.shadowColor = "rgba(255,20,20,0.95)";
        ctx.shadowBlur = W * 0.06 * (ctx.getTransform().a || 1);
        ctx.fillStyle = `rgba(255,${40 + 60 * eyes},${30 + 30 * eyes},${eyes})`;
        for (const side of [-1, 1]) {
          const ex = vx0 + side * W * 0.075, ey = vy0 - H * 0.02;
          ctx.beginPath();
          ctx.moveTo(ex - side * W * 0.055, ey + W * 0.012);
          ctx.quadraticCurveTo(ex, ey - W * 0.03 * open, ex + side * W * 0.05, ey - W * 0.018);
          ctx.quadraticCurveTo(ex, ey + W * 0.02 * open, ex - side * W * 0.055, ey + W * 0.012);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
    },
  };
}
