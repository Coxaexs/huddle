/*
 * WebGL renderer for the symbiote: one fragment shader draws the head,
 * tendrils and goo as a single glossy surface (signed distance fields merged
 * with a smooth minimum, bevelled into a height field, lit with a studio
 * environment and Fresnel), plus the mouth, teeth, tongue and eyes on top.
 *
 * One WebGL context is shared by every card showing the effect: each scene
 * renders into it and copies the result onto its own 2D canvas.
 */

const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uPx;
uniform float uTime;
uniform vec4 uHead;   // centre x, y (css px), scale (css px per head unit), tilt
uniform vec4 uFace;   // jaw, grin, squint, blink
uniform vec4 uMood;   // eyes, rise, glow, unused
uniform vec4 uPool;   // top y, wave amplitude, phase, unused
uniform vec4 uTongue[12];
uniform float uTongueOn;
uniform vec4 uTend[48];
uniform vec4 uTendBox[6];
uniform vec4 uTongueBox;
uniform vec3 uSkin;
uniform vec3 uVein;
uniform float uVeins;
uniform vec3 uTint;
uniform vec3 uThroat;
uniform vec3 uGum;
uniform vec3 uTongueCol;
uniform vec3 uEye;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float capsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
float ellipse(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }

float upperLip(float x) {
  float u = min(1.0, abs(x) / 0.47);
  float c = 0.05 - 0.08 * uFace.y;
  return c + (0.17 - c) * pow(max(1.0 - u * u, 0.0), 0.9);
}
float lowerLip(float x) {
  float u = min(1.0, abs(x) / 0.47);
  return upperLip(x) + uFace.x * 0.52 * pow(max(1.0 - u * u, 0.0), 0.65);
}
vec2 toHead(vec2 p) {
  vec2 d = (p - uHead.xy) / uHead.z;
  float c = cos(-uHead.w), s = sin(-uHead.w);
  return vec2(c * d.x - s * d.y, s * d.x + c * d.y);
}
float mouthD(vec2 q) {
  float dy = max(upperLip(q.x) - q.y, q.y - lowerLip(q.x));
  float dx = abs(q.x) - 0.47;
  return dx > 0.0 ? length(vec2(dx, max(dy, 0.0))) : dy;
}
float skullD(vec2 q) {
  float jaw = uFace.x;
  float d = ellipse(q - vec2(0.0, -0.16), vec2(0.535, 0.5));
  d = smin(d, ellipse(q - vec2(0.0, 0.28 + jaw * 0.48), vec2(0.43 - jaw * 0.04, 0.27)), 0.16);
  if (jaw > 0.04) {
    vec2 m = vec2(abs(q.x), q.y);
    d = smin(d, capsule(m, vec2(0.41, upperLip(0.41) - 0.02), vec2(0.37, lowerLip(0.37) + 0.02), 0.04, 0.032), 0.07);
  }
  return d;
}
/** Head, neck and pool: the big mass (the shadow around it comes from this). */
float massD(vec2 p, vec2 q) {
  float d = skullD(q) * uHead.z;
  vec2 nb = uHead.xy + vec2(0.0, 0.35 * uHead.z);
  d = smin(d, capsule(p, nb, vec2(uHead.x, uRes.y + 60.0), 0.3 * uHead.z, 0.55 * uHead.z), 0.12 * uHead.z);
  float top = uPool.x + sin(p.x * 0.045 + uPool.z * 1.4) * uPool.y + sin(p.x * 0.019 - uPool.z * 0.9) * uPool.y * 1.3;
  return smin(d, top - p.y, 16.0);
}
float bodyD(vec2 p) {
  vec2 q = toHead(p);
  float d = massD(p, q);
  for (int t = 0; t < 6; t++) {
    vec4 bb = uTendBox[t];
    if (p.x < bb.x || p.y < bb.y || p.x > bb.z || p.y > bb.w) continue;
    for (int k = 0; k < 7; k++) {
      vec4 a = uTend[t * 8 + k];
      vec4 b = uTend[t * 8 + k + 1];
      if (a.z > 0.0) d = smin(d, capsule(p, a.xy, b.xy, a.z, b.z), 7.0);
    }
  }
  return max(d, -mouthD(q) * uHead.z);
}
float tongueD(vec2 q) {
  float d = 1e5;
  for (int i = 0; i < 11; i++) {
    vec4 a = uTongue[i];
    vec4 b = uTongue[i + 1];
    d = min(d, capsule(q, a.xy, b.xy, a.z, b.z));
  }
  return d;
}
float tooth(vec2 q, vec2 base, float len, float w, float lean, float dir) {
  // A curved needle: two capsules, the tip bent toward the middle of the mouth.
  vec2 mid = base + vec2(lean * 0.35, dir * len * 0.55);
  vec2 tip = base + vec2(lean, dir * len);
  return min(capsule(q, base, mid, w, w * 0.55), capsule(q, mid, tip, w * 0.55, 0.001));
}
float teethD(vec2 q) {
  float d = 1e5;
  for (int i = 0; i < 19; i++) {
    float fi = float(i);
    float r1 = fract(sin(fi * 12.9898 + 3.1) * 43758.5453);
    float r2 = fract(sin(fi * 4.1414 + 1.7) * 23421.631);
    float x = -0.44 + 0.88 * fi / 18.0 + (r2 - 0.5) * 0.016;
    float u = abs(x) / 0.47;
    float fang = (i == 3 || i == 15) ? 1.6 : 1.0;
    float len = (0.05 + 0.11 * r1 * r1) * (1.0 - 0.5 * u * u) * fang;
    float y = upperLip(x) - 0.016;
    d = min(d, max(tooth(q, vec2(x, y), len, (0.014 + 0.008 * r2) * (1.0 - 0.3 * u), -sign(x) * (0.012 + 0.03 * u) + (r2 - 0.5) * 0.02, 1.0), upperLip(q.x) - 0.004 - q.y));
  }
  for (int i = 0; i < 17; i++) {
    float fi = float(i);
    float r1 = fract(sin(fi * 78.233 + 9.7) * 43758.5453);
    float r2 = fract(sin(fi * 9.173 + 2.3) * 12731.977);
    float x = -0.42 + 0.84 * fi / 16.0 + (r2 - 0.5) * 0.016;
    float u = abs(x) / 0.47;
    float fang = (i == 3 || i == 13) ? 1.5 : 1.0;
    float len = (0.045 + 0.1 * r1 * r1) * (1.0 - 0.5 * u * u) * fang;
    float y = lowerLip(x) + 0.016;
    d = min(d, max(tooth(q, vec2(x, y), len, (0.013 + 0.008 * r2) * (1.0 - 0.3 * u), -sign(x) * (0.01 + 0.025 * u) + (r2 - 0.5) * 0.02, -1.0), q.y - lowerLip(q.x) - 0.004));
  }
  return d;
}
float lens(vec2 q, vec2 a, vec2 b, float sag, vec2 side) {
  float c = length(b - a);
  float s = max(sag, 0.003);
  float r = (c * c * 0.25 + s * s) / (2.0 * s);
  vec2 centre = (a + b) * 0.5 - side * (r - s);
  return length(q - centre) - r;
}
float eyeD(vec2 q) {
  q.x = abs(q.x);
  vec2 I = vec2(0.075, -0.115), O = vec2(0.49, -0.47);
  vec2 dir = normalize(O - I);
  vec2 down = vec2(-dir.y, dir.x);
  if (down.y < 0.0) down = -down;
  float lower = lens(q, I, O, 0.085, down);
  float upper = lens(q, I, O, 0.135 * (1.0 - uFace.z * 0.62) * (1.0 - uFace.w * 0.97), -down);
  return max(lower, upper);
}
vec3 env(vec3 r) {
  float up = -r.y;
  vec3 c = mix(vec3(0.003, 0.004, 0.007), uTint * 0.2, smoothstep(-0.3, 0.95, up));
  c += vec3(1.0) * smoothstep(0.82, 0.96, dot(r, normalize(vec3(-0.5, -0.62, 0.6)))) * 1.7;
  c += uTint * smoothstep(0.9, 0.985, dot(r, normalize(vec3(0.92, -0.2, 0.25)))) * 1.5;
  c += uTint * smoothstep(0.88, 0.98, dot(r, normalize(vec3(-0.25, 0.9, 0.3)))) * 0.3;
  c += mix(vec3(1.0), uTint, 0.5) * smoothstep(0.55, 0.97, dot(r, normalize(vec3(-0.15, -0.45, 0.88)))) * 0.22;
  return c;
}
vec3 shade(vec3 N, vec3 albedo, float gloss) {
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L = normalize(vec3(-0.55, -0.7, 0.55));
  float diff = max(dot(N, L), 0.0);
  float F = 0.04 + 0.96 * pow(1.0 - max(N.z, 0.0), 5.0);
  vec3 col = albedo * (0.16 + 0.84 * diff);
  col += env(reflect(-V, N)) * mix(0.06, 1.0, F) * gloss;
  col += vec3(1.0) * pow(max(dot(N, normalize(L + V)), 0.0), 110.0) * 0.8 * gloss;
  return col;
}
void over(inout vec4 dst, vec3 col, float a) { dst = vec4(col * a, a) + dst * (1.0 - a); }

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uPx - gl_FragCoord.y) / uPx;
  float aa = 1.0 / uPx;
  float d = bodyD(p);
  vec4 o = vec4(0.0);

  // Shadow gathering around the goo.
  float aura = uMood.y * 0.62 * exp(-max(massD(p, toHead(p)), 0.0) / max(uHead.z * 0.35, 1.0));
  o = vec4(0.0, 0.0, 0.0, aura);

  vec2 q = toHead(p);
  bool nearMouth = abs(q.x) < 0.56 && q.y > upperLip(q.x) - 0.2 && q.y < lowerLip(q.x) + 0.2;

  // The open mouth: gums near the lips, a dark wet throat inside.
  if (nearMouth && uFace.x > 0.01) {
    float md = mouthD(q);
    if (md < 0.0) {
      float depth = clamp(-md / 0.13, 0.0, 1.0);
      vec3 mc = mix(uGum, uThroat, depth);
      float wet = smoothstep(0.62, 0.9, fbm(q * 26.0 + uTime * 0.4)) * (1.0 - depth) * 0.5;
      mc += vec3(1.0, 0.75, 0.75) * wet * 0.35;
      over(o, mc, clamp(0.5 - md * uHead.z * uPx, 0.0, 1.0));
    }
  }

  // Body: bevel the distance field into a rounded surface and light it.
  if (d < 2.0) {
    float R = clamp(uHead.z * 0.12, 5.0, 26.0);
    float t = clamp(-d / R, 0.0, 1.0);
    // Only the bevel needs the field's slope; deeper in, the surface faces us.
    vec2 n2 = vec2(0.0, -1.0);
    if (t < 1.0) {
      float e = 0.75;
      vec2 g = vec2(bodyD(p + vec2(e, 0.0)) - d, bodyD(p + vec2(0.0, e)) - d);
      n2 = g / max(length(g), 1e-5);
    }
    vec3 N = vec3(n2 * (1.0 - t), sqrt(max(1.0 - (1.0 - t) * (1.0 - t), 0.0)) + 0.001);
    // Sinewy striations wrapping the edges, softer lumps inside.
    vec2 hp = p / max(uHead.z, 1.0);
    vec2 T = vec2(-n2.y, n2.x);
    float stripe = fbm(vec2(dot(hp, T) * 3.5, dot(hp, n2) * 24.0 + uTime * 0.15)) - 0.5;
    float lump = fbm(hp * 6.0 + vec2(uTime * 0.05, -uTime * 0.04)) - 0.5;
    float grain = fbm(hp * 34.0 + 11.0) - 0.5;
    N.xy += n2 * stripe * 0.8 * (1.0 - 0.6 * t) + vec2(lump, -lump * 0.7) * 0.42 + vec2(grain, grain * 0.6) * 0.18;
    N = normalize(N);
    vec3 albedo = uSkin;
    if (uVeins > 0.0) {
      float v = smoothstep(0.03, 0.0, abs(fbm(hp * 5.0 + 3.0) - 0.5)) * uVeins;
      albedo = mix(albedo, uVein, v);
    }
    vec3 col = shade(N, albedo, 1.0);
    over(o, col, clamp(0.5 - d * uPx, 0.0, 1.0));
  }

  // Teeth on both jaws, interlocking when shut.
  if (nearMouth) {
    float td = teethD(q);
    if (td < 0.01) {
      float base = clamp(min(abs(q.y - upperLip(q.x)), abs(q.y - lowerLip(q.x))) / 0.09, 0.0, 1.0);
      vec3 tc = mix(vec3(0.3, 0.24, 0.2), vec3(0.93, 0.9, 0.8), smoothstep(0.0, 0.45, base));
      tc = mix(tc, vec3(0.75, 0.74, 0.72), smoothstep(0.6, 1.0, base) * 0.5);
      tc *= 0.7 + 0.3 * smoothstep(0.0, 0.01, -td);
      over(o, tc, clamp(0.5 - td * uHead.z * uPx, 0.0, 1.0));
    }
  }

  // Tongue: wet, glossy and rounded.
  if (uTongueOn > 0.5 && q.x > uTongueBox.x && q.y > uTongueBox.y && q.x < uTongueBox.z && q.y < uTongueBox.w) {
    float tdn = tongueD(q);
    if (tdn < 0.01) {
      float e = 0.004;
      vec2 g = vec2(tongueD(q + vec2(e, 0.0)) - tdn, tongueD(q + vec2(0.0, e)) - tdn);
      vec2 n2 = g / max(length(g), 1e-6);
      float t = clamp(-tdn / 0.05, 0.0, 1.0);
      vec3 N = normalize(vec3(n2 * (1.0 - t), sqrt(max(1.0 - (1.0 - t) * (1.0 - t), 0.0)) + 0.001));
      N.xy += (vec2(fbm(q * 40.0), fbm(q * 40.0 + 7.0)) - 0.5) * 0.25;
      N = normalize(N);
      vec3 col = shade(N, uTongueCol, 1.3) * (0.7 + 0.3 * t);
      over(o, col, clamp(0.5 - tdn * uHead.z * uPx, 0.0, 1.0));
    }
  }

  // Spit strung between the jaws while it roars.
  if (nearMouth && uFace.x > 0.08) {
    float vis = sin(3.14159 * clamp((uFace.x - 0.08) / 0.85, 0.0, 1.0));
    float sd = 1e5;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float sx = -0.3 + fi * 0.15 + sin(fi * 7.3) * 0.03;
      float dx = sin(fi * 3.7) * 0.03;
      vec2 a = vec2(sx, upperLip(sx) + 0.05);
      vec2 b = vec2(sx + dx, lowerLip(sx + dx) - 0.04);
      vec2 m = (a + b) * 0.5 + vec2(dx * 0.4, uFace.x * 0.07);
      sd = min(sd, min(capsule(q, a, m, 0.005, 0.0035), capsule(q, m, b, 0.0035, 0.005)));
    }
    float sa = clamp(0.5 - sd * uHead.z * uPx, 0.0, 1.0) * vis * 0.6;
    over(o, vec3(0.88, 0.92, 1.0), sa);
  }

  // Eyes: soft-edged white with a glow bleeding over the skin.
  if (uMood.x > 0.01) {
    float ed = eyeD(q);
    float glow = exp(-max(ed, 0.0) / 0.045) * 0.55 * uMood.x * uMood.z;
    o.rgb += uEye * glow * o.a;
    if (ed < 0.01) {
      float inner = clamp(-ed / 0.05, 0.0, 1.0);
      vec3 ec = mix(uEye * 0.82, uEye, smoothstep(0.0, 0.6, inner));
      over(o, ec, clamp(0.5 - ed * uHead.z * uPx, 0.0, 1.0) * uMood.x * (1.0 - uFace.w * 0.95));
    }
  }
  gl_FragColor = o;
}
`;

export interface SymbioteLook {
  skin: [number, number, number];
  vein: [number, number, number];
  veins: number;
  tint: [number, number, number];
  throat: [number, number, number];
  gum: [number, number, number];
  tongue: [number, number, number];
  eye: [number, number, number];
  /** How much the eyes glow over the skin (0 for dark eyes). */
  eyeGlow: number;
}

export interface SymbioteFrame {
  width: number;
  height: number;
  px: number;
  time: number;
  head: [number, number, number, number];
  face: [number, number, number, number];
  mood: [number, number, number, number];
  pool: [number, number, number, number];
  /** 12 points (x, y, radius, 0) in head units; empty when the tongue is in. */
  tongue: Float32Array | null;
  /** 6 tendrils x 8 points (x, y, radius, 0) in css px; radius 0 = unused. */
  tendrils: Float32Array;
}

const tendBox = new Float32Array(24);
const tongueBox = new Float32Array(4);

/** Bounding boxes so the shader skips limbs nowhere near a pixel. */
function boxes(f: SymbioteFrame) {
  for (let t = 0; t < 6; t++) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, r = 0;
    for (let k = 0; k < 8; k++) {
      const o = (t * 8 + k) * 4;
      if (f.tendrils[o + 2] <= 0) continue;
      x0 = Math.min(x0, f.tendrils[o]);
      y0 = Math.min(y0, f.tendrils[o + 1]);
      x1 = Math.max(x1, f.tendrils[o]);
      y1 = Math.max(y1, f.tendrils[o + 1]);
      r = Math.max(r, f.tendrils[o + 2]);
    }
    const pad = r + 12;
    tendBox.set(x0 > x1 ? [1, 1, -1, -1] : [x0 - pad, y0 - pad, x1 + pad, y1 + pad], t * 4);
  }
  if (f.tongue) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let k = 0; k < 12; k++) {
      x0 = Math.min(x0, f.tongue[k * 4] - f.tongue[k * 4 + 2]);
      y0 = Math.min(y0, f.tongue[k * 4 + 1] - f.tongue[k * 4 + 2]);
      x1 = Math.max(x1, f.tongue[k * 4] + f.tongue[k * 4 + 2]);
      y1 = Math.max(y1, f.tongue[k * 4 + 1] + f.tongue[k * 4 + 2]);
    }
    tongueBox.set([x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02]);
  }
}

export interface Renderer {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  loc: (name: string) => WebGLUniformLocation | null;
}

const renderers = new Map<string, Renderer | null>();

/**
 * A full-screen fragment shader on its own offscreen WebGL canvas, shared by
 * every card that uses it. Null when WebGL is unavailable or the context was
 * lost (callers fall back to 2D drawing).
 */
export function shaderRenderer(frag: string, label: string): Renderer | null {
  if (renderers.has(frag)) return renderers.get(frag) ?? null;
  renderers.set(frag, null);
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn(`${label} shader:`, gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, frag);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn(`${label} program:`, gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const cache = new Map<string, WebGLUniformLocation | null>();
  const loc = (name: string) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
    return cache.get(name) ?? null;
  };
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    renderers.set(frag, null);
  });
  const r = { canvas, gl, loc };
  renderers.set(frag, r);
  return r;
}

/** Sizes the shared canvas for a card and clears it. */
export function beginFrame(r: Renderer, width: number, height: number, px: number) {
  const { gl, canvas } = r;
  const w = Math.max(1, Math.round(width * px)), h = Math.max(1, Math.round(height * px));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

/** The symbiote renderer (see shaderRenderer). */
export function symbioteRenderer(): Renderer | null {
  return shaderRenderer(FRAG, "symbiote");
}

const NO_TONGUE = new Float32Array(48);

/** Renders one frame into the shared canvas and returns it, ready to drawImage. */
export function renderSymbiote(r: Renderer, look: SymbioteLook, f: SymbioteFrame): HTMLCanvasElement {
  const { gl, canvas, loc } = r;
  const w = Math.max(1, Math.round(f.width * f.px)), h = Math.max(1, Math.round(f.height * f.px));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
  gl.uniform2f(loc("uRes"), f.width, f.height);
  gl.uniform1f(loc("uPx"), f.px);
  gl.uniform1f(loc("uTime"), f.time);
  gl.uniform4fv(loc("uHead"), f.head);
  gl.uniform4fv(loc("uFace"), f.face);
  gl.uniform4fv(loc("uMood"), f.mood);
  gl.uniform4fv(loc("uPool"), f.pool);
  gl.uniform4fv(loc("uTongue"), f.tongue ?? NO_TONGUE);
  gl.uniform1f(loc("uTongueOn"), f.tongue ? 1 : 0);
  gl.uniform4fv(loc("uTend"), f.tendrils);
  boxes(f);
  gl.uniform4fv(loc("uTendBox"), tendBox);
  gl.uniform4fv(loc("uTongueBox"), tongueBox);
  gl.uniform3fv(loc("uSkin"), look.skin);
  gl.uniform3fv(loc("uVein"), look.vein);
  gl.uniform1f(loc("uVeins"), look.veins);
  gl.uniform3fv(loc("uTint"), look.tint);
  gl.uniform3fv(loc("uThroat"), look.throat);
  gl.uniform3fv(loc("uGum"), look.gum);
  gl.uniform3fv(loc("uTongueCol"), look.tongue);
  gl.uniform3fv(loc("uEye"), look.eye);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return canvas;
}
