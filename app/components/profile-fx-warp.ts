/*
 * Warp Disc: a disc of white light streaks rushing outward, seen in
 * perspective. It tilts from edge-on, through a full face-on burst, to
 * edge-on again, where it collapses into a line that throws off long rays.
 */
import type { Scene } from "./particle-scenes";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (x: number) => 0.5 - Math.cos(Math.PI * clamp01(x)) / 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const CYCLE = 5.2;
const SWEEP = 4.0;

export function warpDisc(): Scene {
  let W = 0, H = 0, R = 0;
  let n = 0;
  let sR = new Float32Array(0), sT = new Float32Array(0), sL = new Float32Array(0);
  let sV = new Float32Array(0), sB = new Float32Array(0);
  const rays: Array<{ x: number; len: number; a: number }> = [];
  let clock = 0, burstCycle = -1;

  return {
    init(w, h, density) {
      W = w;
      H = h;
      R = Math.max(w, h) * 0.62;
      n = Math.round(Math.max(400, Math.min(3200, 1700 * ((w * h) / (300 * 440)) * density)));
      sR = new Float32Array(n); sT = new Float32Array(n); sL = new Float32Array(n);
      sV = new Float32Array(n); sB = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        sR[i] = 0.08 + Math.sqrt(Math.random()) * 0.97;
        sT[i] = Math.random() * Math.PI * 2;
        sL[i] = rand(0.04, 0.2);
        sV[i] = rand(0.12, 0.45);
        sB[i] = Math.random();
      }
    },

    frame(ctx, _t, dt) {
      clock += dt;
      const c = clock % CYCLE;
      const cycle = Math.floor(clock / CYCLE);
      const k = easeInOut(c / SWEEP);
      // Tilt: edge-on seen from below, face-on, then edge-on from above.
      const phi = 0.14 + k * (Math.PI - 0.17);
      const sinP = Math.sin(phi), cosP = Math.cos(phi);
      const cx = W / 2;
      const cy = H * (0.22 + 0.3 * k);
      const fade = c < 0.35 ? c / 0.35 : c > SWEEP + 0.5 ? clamp01(1 - (c - SWEEP - 0.5) / (CYCLE - SWEEP - 0.5)) : 1;
      const D = 2.6, F = 2.6;

      if (c > SWEEP - 0.05 && burstCycle !== cycle) {
        burstCycle = cycle;
        rays.length = 0;
        for (let i = 0; i < 26; i++) rays.push({ x: (Math.random() - 0.5) * W * 1.1, len: rand(0.05, 0.55) * H, a: rand(0.3, 0.9) });
      }

      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      const paths = [new Path2D(), new Path2D(), new Path2D()];
      for (let i = 0; i < n; i++) {
        let r = sR[i] + sV[i] * dt * (0.6 + 1.6 * Math.sin(Math.PI * k));
        if (r > 1.08) r = 0.08 + Math.random() * 0.1;
        sR[i] = r;
        const ct = Math.cos(sT[i]), st = Math.sin(sT[i]);
        const r1 = r + sL[i] * r;
        // Disc point (x, 0, z) turned about the x axis, then perspective.
        const z0 = r * st, z1 = r1 * st;
        const k0 = F / (D - z0 * cosP), k1 = F / (D - z1 * cosP);
        const x0 = cx + r * ct * k0 * R / F, y0 = cy - z0 * sinP * k0 * R / F;
        const x1 = cx + r1 * ct * k1 * R / F, y1 = cy - z1 * sinP * k1 * R / F;
        const a = (0.25 + 0.75 * sB[i]) * clamp01((r - 0.08) * 6) * fade;
        if (a < 0.06) continue;
        const p = paths[a < 0.35 ? 0 : a < 0.65 ? 1 : 2];
        p.moveTo(x0, y0);
        p.lineTo(x1, y1);
      }
      const lw = Math.max(0.6, Math.min(1.3, W / 320));
      ([0.22, 0.45, 0.8] as const).forEach((a, i) => {
        ctx.strokeStyle = `rgba(232,238,255,${a})`;
        ctx.lineWidth = lw * (0.7 + i * 0.2);
        ctx.stroke(paths[i]);
      });

      // Collapsed to a line: a bright seam with rays shooting off it.
      const edge = clamp01((c - (SWEEP - 0.35)) / 0.35) * clamp01(1 - (c - SWEEP - 0.3) / 0.8);
      if (edge > 0) {
        const g = ctx.createLinearGradient(0, cy, W, cy);
        g.addColorStop(0, "rgba(230,238,255,0)");
        g.addColorStop(0.5, `rgba(240,245,255,${0.85 * edge})`);
        g.addColorStop(1, "rgba(230,238,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, cy - 1.5 * lw, W, 3 * lw);
        ctx.lineWidth = lw * 0.6;
        for (const ray of rays) {
          const grow = clamp01((c - SWEEP + 0.1) / 0.25);
          ctx.strokeStyle = `rgba(230,238,255,${ray.a * edge})`;
          ctx.beginPath();
          ctx.moveTo(cx + ray.x, cy);
          ctx.lineTo(cx + ray.x * 1.15, cy - ray.len * grow);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  };
}
