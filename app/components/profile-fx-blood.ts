/*
 * Bloodfall: glossy blood seeps over the top of the card, runs down in drips
 * that swell, let go and splash into a pool along the bottom.
 *
 * Drawn by a WebGL shader (the drips are merged distance fields lit as a wet
 * surface); without WebGL the same shapes are filled flat.
 */
import type { Scene } from "./particle-scenes";
import { beginFrame, shaderRenderer } from "./symbiote-gl";

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uPx;
uniform float uTime;
uniform vec4 uTop;      // y, wave amplitude
uniform vec4 uPool;     // top y, ripple amplitude, ripple centre x
uniform vec4 uDrips[8]; // x, length, radius, bulb radius
uniform vec4 uDrops[10];// x, y, radius, stretch

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float capsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
float bloodD(vec2 p) {
  float top = uTop.x + uTop.y * (0.6 * sin(p.x * 0.05 + uTime * 0.5) + 0.4 * sin(p.x * 0.021 - uTime * 0.3));
  float d = p.y - top;
  for (int i = 0; i < 8; i++) {
    vec4 dr = uDrips[i];
    if (dr.z <= 0.0) continue;
    vec2 a = vec2(dr.x, top - 4.0);
    vec2 b = vec2(dr.x + sin(dr.x + uTime * 0.7) * 1.5, top + dr.y);
    d = smin(d, capsule(p, a, b, dr.z * 1.7, dr.z * 0.75), 9.0);
    d = smin(d, length(p - b) - dr.w, 6.0);
  }
  for (int i = 0; i < 10; i++) {
    vec4 dp = uDrops[i];
    if (dp.z <= 0.0) continue;
    vec2 q = p - dp.xy;
    q.y /= dp.w;
    d = smin(d, (length(q) - dp.z) * min(1.0, dp.w), 5.0);
  }
  float dx = p.x - uPool.z;
  float pool = uPool.x - uPool.y * exp(-dx * dx / 900.0) * sin(dx * 0.35 - uTime * 14.0) - 1.5 * sin(p.x * 0.07 + uTime);
  return smin(d, pool - p.y, 8.0);
}
vec3 env(vec3 r) {
  vec3 c = vec3(0.02, 0.0, 0.0) + vec3(0.2, 0.12, 0.12) * smoothstep(-0.2, 1.0, -r.y);
  c += vec3(1.0, 0.95, 0.95) * smoothstep(0.86, 0.97, dot(r, normalize(vec3(-0.45, -0.6, 0.66)))) * 1.6;
  c += vec3(0.9, 0.6, 0.6) * smoothstep(0.92, 0.99, dot(r, normalize(vec3(0.85, -0.3, 0.3)))) * 0.8;
  return c;
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uPx - gl_FragCoord.y) / uPx;
  float d = bloodD(p);
  if (d > 2.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float R = 7.0;
  float t = clamp(-d / R, 0.0, 1.0);
  vec2 n2 = vec2(0.0, -1.0);
  if (t < 1.0) {
    vec2 g = vec2(bloodD(p + vec2(0.75, 0.0)) - d, bloodD(p + vec2(0.0, 0.75)) - d);
    n2 = g / max(length(g), 1e-5);
  }
  vec3 N = normalize(vec3(n2 * (1.0 - t), sqrt(max(1.0 - (1.0 - t) * (1.0 - t), 0.0)) + 0.001));
  // Thin edges let light through; the body is nearly black-red.
  vec3 albedo = mix(vec3(0.62, 0.02, 0.035), vec3(0.17, 0.0, 0.012), smoothstep(0.0, 1.0, t));
  vec3 L = normalize(vec3(-0.5, -0.65, 0.6));
  float F = 0.04 + 0.96 * pow(1.0 - max(N.z, 0.0), 5.0);
  vec3 col = albedo * (0.35 + 0.65 * max(dot(N, L), 0.0));
  col += env(reflect(vec3(0.0, 0.0, -1.0), N)) * mix(0.05, 1.0, F);
  col += vec3(1.0) * pow(max(dot(N, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 140.0) * 0.9;
  float a = clamp(0.5 - d * uPx, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ND = 8, NP = 10;

export function bloodfall(): Scene {
  let W = 0, H = 0, DPR = 1, clock = 0;
  const drips = Array.from({ length: ND }, () => ({ x: 0, len: 0, max: 0, speed: 0, r: 0, bulb: 0 }));
  const drops = Array.from({ length: NP }, () => ({ x: 0, y: 0, vy: 0, r: 0, live: false }));
  const splash: Array<{ x: number; y: number; vx: number; vy: number; r: number; age: number; max: number }> = [];
  let poolY = 0, ripple = 0, rippleX = 0;
  const uDrips = new Float32Array(ND * 4), uDrops = new Float32Array(NP * 4);

  const reset = (d: (typeof drips)[number], first: boolean) => {
    d.len = first ? rand(0, 0.15) * H : rand(2, 8);
    d.max = rand(0.18, 0.5) * H;
    d.speed = rand(10, 26) * (H / 440);
    d.r = rand(2.2, 4.2) * (W / 300);
    d.bulb = d.r * 1.2;
  };

  return {
    init(w, h) {
      W = w;
      H = h;
      drips.forEach((d, i) => {
        d.x = ((i + 0.5) / ND) * W + rand(-0.04, 0.04) * W;
        reset(d, true);
      });
      drops.forEach((p) => (p.live = false));
      poolY = H - 6;
    },

    frame(ctx, _t, dt) {
      DPR = ctx.getTransform().a || 1;
      clock += dt;
      const seep = Math.min(1, clock / 1.6);
      const topY = -14 + seep * (H * 0.045 + 14);

      for (const d of drips) {
        // Runs fast at first, then creeps as it thins out; the bead swells.
        d.len += d.speed * dt * (1.4 - d.len / d.max) * seep;
        d.bulb = d.r * (1.2 + 1.1 * (d.len / d.max));
        if (d.len >= d.max * 0.97) {
          const free = drops.find((p) => !p.live);
          if (free) Object.assign(free, { x: d.x, y: topY + d.len, vy: 30, r: d.bulb * 0.95, live: true });
          reset(d, false);
        }
      }
      for (const p of drops) {
        if (!p.live) continue;
        p.vy += 1500 * (H / 440) * dt;
        p.y += p.vy * dt;
        if (p.y + p.r > poolY) {
          p.live = false;
          ripple = 3.5 * (W / 300);
          rippleX = p.x;
          poolY = Math.max(H - 16 * (H / 440), poolY - 0.6);
          for (let i = 0; i < 9; i++) {
            const a = -Math.PI / 2 + rand(-1.2, 1.2);
            const sp = rand(60, 200) * (H / 440);
            splash.push({ x: p.x, y: poolY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rand(0.8, 2.2) * (W / 300), age: 0, max: rand(0.35, 0.7) });
          }
        }
      }
      ripple *= Math.exp(-dt * 3);

      ctx.save();
      ctx.clearRect(0, 0, W, H);
      // A faint red stain darkening the card behind the blood.
      const stain = ctx.createLinearGradient(0, 0, 0, H * 0.4);
      stain.addColorStop(0, `rgba(70,0,6,${0.35 * seep})`);
      stain.addColorStop(1, "rgba(70,0,6,0)");
      ctx.fillStyle = stain;
      ctx.fillRect(0, 0, W, H * 0.4);

      const r = shaderRenderer(FRAG, "blood");
      if (r) {
        const px = Math.min(DPR, 1.5);
        beginFrame(r, W, H, px);
        const { gl, loc } = r;
        drips.forEach((d, i) => uDrips.set([d.x, d.len, d.r * seep, d.bulb * seep], i * 4));
        drops.forEach((p, i) => uDrops.set(p.live ? [p.x, p.y, p.r, Math.min(2.2, 1 + p.vy / 700)] : [0, 0, 0, 1], i * 4));
        gl.uniform2f(loc("uRes"), W, H);
        gl.uniform1f(loc("uPx"), px);
        gl.uniform1f(loc("uTime"), clock);
        gl.uniform4f(loc("uTop"), topY, 2.5 * (W / 300), 0, 0);
        gl.uniform4f(loc("uPool"), poolY, ripple, rippleX, 0);
        gl.uniform4fv(loc("uDrips"), uDrips);
        gl.uniform4fv(loc("uDrops"), uDrops);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        ctx.drawImage(r.canvas, 0, 0, W, H);
      } else {
        // Flat fallback: the same shapes in one colour.
        ctx.fillStyle = "#5a0008";
        ctx.fillRect(0, 0, W, topY);
        ctx.fillRect(0, poolY, W, H - poolY);
        ctx.strokeStyle = "#5a0008";
        ctx.lineCap = "round";
        for (const d of drips) {
          ctx.lineWidth = d.r * 2;
          ctx.beginPath();
          ctx.moveTo(d.x, topY);
          ctx.lineTo(d.x, topY + d.len);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(d.x, topY + d.len, d.bulb, 0, Math.PI * 2);
          ctx.fillStyle = "#5a0008";
          ctx.fill();
        }
        for (const p of drops) {
          if (!p.live) continue;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.r, p.r * Math.min(2.2, 1 + p.vy / 700), 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (let i = splash.length - 1; i >= 0; i--) {
        const s = splash[i];
        s.age += dt;
        if (s.age > s.max) {
          splash.splice(i, 1);
          continue;
        }
        s.vy += 900 * (H / 440) * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        ctx.fillStyle = "#6e000c";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,200,200,0.55)";
        ctx.beginPath();
        ctx.arc(s.x - s.r * 0.3, s.y - s.r * 0.35, s.r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}
