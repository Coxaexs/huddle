/**
 * Natural 1 / natural 20 effects that act on the real 3D dice inside a
 * finished @3d-dice/dice-box-threejs scene. Each material has its own pair:
 *
 *            Nat 1                                  Nat 20
 * glass      shatters into shards on the table      rises and throws prism light
 * metal      flies into the lens, breaks the screen slams down: shockwave + sparks
 * plastic    melts into a puddle, page drips a bit  hops and pops like a firework
 * wood       splits in half, splinters fly          sprouts branches, leaves, blossoms
 *
 * Three.js classes are taken from the dice meshes themselves (the library
 * bundles its own copy of three), so nothing here imports three directly.
 */

type Any = any;
type V3 = { x: number; y: number; z: number };

export type DiceMaterialKind = "plastic" | "metal" | "wood" | "glass";
export type CritKind = "nat1" | "nat20";

const SVG_NS = "http://www.w3.org/2000/svg";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
const easeOutBack = (v: number) => {
  const t = clamp01(v) - 1;
  return 1 + 2.7 * t * t * t + 1.7 * t * t;
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

function shakePage(strength: number, duration = 260) {
  if (prefersReducedMotion()) return;
  const k = 10 * strength;
  document.body.animate(
    [
      { transform: "translate(0,0)" },
      { transform: `translate(${-k}px, ${k * 0.6}px) rotate(${-0.3 * strength}deg)` },
      { transform: `translate(${k * 0.8}px, ${-k * 0.7}px)` },
      { transform: `translate(${-k * 0.4}px, ${k * 0.3}px)` },
      { transform: "translate(0,0)" },
    ],
    { duration, easing: "ease-out" },
  );
}

/** Stable 0..1 noise for a vertex position, so split triangle corners move together. */
function vertexNoise(x: number, y: number, z: number, salt: number): number {
  const s = Math.sin(Math.round(x * 4) * 12.9898 + Math.round(y * 4) * 78.233 + Math.round(z * 4) * 37.719 + salt * 19.19) * 43758.5453;
  return s - Math.floor(s);
}

function vertexKey(x: number, y: number, z: number): string {
  return `${Math.round(x * 4)},${Math.round(y * 4)},${Math.round(z * 4)}`;
}

function cloneMaterials(die: Any): Any[] {
  const list: Any[] = Array.isArray(die.material) ? die.material : [die.material];
  const cloned = list.map((m) => {
    const c = m.clone();
    c.side = 2; // THREE.DoubleSide: shards and melted skin are seen from both sides
    return c;
  });
  die.material = cloned;
  return cloned;
}

function setGlow(materials: Any[], hex: number, intensity: number) {
  for (const m of materials) {
    if (!m.emissive) continue;
    m.emissive.setHex(hex);
    m.emissiveIntensity = intensity;
  }
}

function setOpacity(materials: Any[], opacity: number) {
  for (const m of materials) m.opacity = opacity;
}

/** Moves the die's transform into its geometry (world space, z up) and centres it on its body. */
function bakeToWorld(die: Any) {
  die.updateMatrix();
  const geometry = die.geometry.clone(); // dice of one type share a cached geometry
  geometry.applyMatrix4(die.matrix);
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cy = (bb.min.y + bb.max.y) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  geometry.translate(-cx, -cy, -cz);
  die.geometry = geometry;
  die.position.set(cx, cy, cz);
  die.quaternion.set(0, 0, 0, 1);
  die.scale.set(1, 1, 1);
  die.updateMatrix();
  return {
    geometry,
    rest: { x: cx, y: cy, z: cz },
    halfHeight: (bb.max.z - bb.min.z) / 2,
    radius: Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y) / 2,
  };
}

/** Screen (client px) position of a world point. */
function toScreen(box: Any, p: V3): { x: number; y: number } {
  const Vec3 = box.camera.position.constructor;
  const v = new Vec3(p.x, p.y, p.z).project(box.camera);
  const r = box.renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}

function screenRadius(box: Any, p: V3, worldRadius: number): number {
  const a = toScreen(box, p);
  const b = toScreen(box, { x: p.x + worldRadius, y: p.y, z: p.z });
  return Math.max(12, Math.hypot(b.x - a.x, b.y - a.y));
}

/** Full-window 2D canvas above everything, for light, sparks, cracks, plants. */
function createOverlay() {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "2147483000",
    transition: "opacity 500ms ease",
  } as Partial<CSSStyleDeclaration>);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  let faded = false;
  return {
    ctx,
    w: window.innerWidth,
    h: window.innerHeight,
    clear() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    },
    fadeOut() {
      if (faded) return;
      faded = true;
      canvas.style.opacity = "0";
    },
    destroy: () => canvas.remove(),
  };
}
type Overlay = ReturnType<typeof createOverlay>;

// --------------------------------------------------------------------------
// Pieces: triangles cut out of the die that fly around with simple physics
// --------------------------------------------------------------------------

type Tri = { p: number[]; n: number[]; uv: number[] | null; mat: number };
type Piece = {
  mesh: Any;
  vel: [number, number, number];
  spin: [number, number, number];
  resting?: boolean;
};

function triArea(p: number[]): number {
  const ex = p[3] - p[0], ey = p[4] - p[1], ez = p[5] - p[2];
  const fx = p[6] - p[0], fy = p[7] - p[1], fz = p[8] - p[2];
  return Math.hypot(ey * fz - ez * fy, ez * fx - ex * fz, ex * fy - ey * fx) / 2;
}

/** Splits a triangle into four through its edge midpoints. */
function subdivide(t: Tri): Tri[] {
  const mid = (arr: number[], size: number, a: number, b: number) =>
    Array.from({ length: size }, (_, k) => (arr[a * size + k] + arr[b * size + k]) / 2);
  const corner = (arr: number[], size: number, a: number) => arr.slice(a * size, a * size + size);
  const build = (arr: number[], size: number) => {
    const A = corner(arr, size, 0), B = corner(arr, size, 1), C = corner(arr, size, 2);
    const AB = mid(arr, size, 0, 1), BC = mid(arr, size, 1, 2), CA = mid(arr, size, 2, 0);
    return [[...A, ...AB, ...CA], [...AB, ...B, ...BC], [...CA, ...BC, ...C], [...AB, ...BC, ...CA]];
  };
  const ps = build(t.p, 3);
  const ns = build(t.n, 3);
  const uvs = t.uv ? build(t.uv, 2) : null;
  return ps.map((p, i) => ({ p, n: ns[i], uv: uvs ? uvs[i] : null, mat: t.mat }));
}

/** Removes the die from the scene and returns its faces as separate meshes. */
function fragment(box: Any, die: Any, materials: Any[], subdivideAbove = Infinity, rounds = 1) {
  die.updateMatrixWorld(true);
  const world = die.geometry.clone();
  world.applyMatrix4(die.matrixWorld);
  box.scene.remove(die);

  const pos = world.attributes.position.array as Float32Array;
  const nor = world.attributes.normal.array as Float32Array;
  const uv = world.attributes.uv?.array as Float32Array | undefined;
  let tris: Tri[] = world.groups.map((g: Any) => ({
    p: Array.from(pos.slice(g.start * 3, g.start * 3 + 9)),
    n: Array.from(nor.slice(g.start * 3, g.start * 3 + 9)),
    uv: uv ? Array.from(uv.slice(g.start * 2, g.start * 2 + 6)) : null,
    mat: g.materialIndex,
  }));
  for (let r = 0; r < rounds; r++) {
    tris = tris.flatMap((t) => (triArea(t.p) > subdivideAbove ? subdivide(t) : [t]));
  }

  const GeometryCtor = world.constructor;
  const AttrCtor = world.attributes.position.constructor;
  const MeshCtor = die.constructor;
  world.dispose();

  const center = { x: die.position.x, y: die.position.y, z: die.position.z };
  const pieces = tris.map((t) => {
    const mx = (t.p[0] + t.p[3] + t.p[6]) / 3;
    const my = (t.p[1] + t.p[4] + t.p[7]) / 3;
    const mz = (t.p[2] + t.p[5] + t.p[8]) / 3;
    const g = new GeometryCtor();
    g.setAttribute("position", new AttrCtor([t.p[0] - mx, t.p[1] - my, t.p[2] - mz, t.p[3] - mx, t.p[4] - my, t.p[5] - mz, t.p[6] - mx, t.p[7] - my, t.p[8] - mz], 3));
    g.setAttribute("normal", new AttrCtor(t.n, 3));
    if (t.uv) g.setAttribute("uv", new AttrCtor(t.uv, 2));
    g.addGroup(0, 3, t.mat);
    const mesh = new MeshCtor(g, materials);
    mesh.position.set(mx, my, mz);
    mesh.castShadow = true;
    box.scene.add(mesh);
    const dx = mx - center.x, dy = my - center.y, dz = mz - center.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { mesh, dir: [dx / len, dy / len, dz / len] as [number, number, number], area: triArea(t.p), numbered: t.mat > 0 };
  });
  return { pieces, center, GeometryCtor, AttrCtor, MeshCtor };
}

function stepPiece(p: Piece, dt: number, gravity: number, bounce = 0.3, floor = 1) {
  if (p.resting) return;
  const m = p.mesh;
  m.rotation.x += p.spin[0] * dt;
  m.rotation.y += p.spin[1] * dt;
  m.rotation.z += p.spin[2] * dt;
  p.vel[2] -= gravity * dt;
  m.position.x += p.vel[0] * dt;
  m.position.y += p.vel[1] * dt;
  m.position.z += p.vel[2] * dt;
  if (m.position.z < floor) {
    m.position.z = floor;
    p.vel[2] = Math.abs(p.vel[2]) * bounce;
    p.vel[0] *= 0.5;
    p.vel[1] *= 0.5;
    p.spin = [p.spin[0] * 0.4, p.spin[1] * 0.4, p.spin[2] * 0.6];
    if (p.vel[2] < 50) p.resting = true;
  }
}

/** Same shape with every triangle split into 4^rounds, so it can bend smoothly. */
function subdivideGeometry(geometry: Any, rounds: number): Any {
  const pos = geometry.attributes.position.array as Float32Array;
  const nor = geometry.attributes.normal.array as Float32Array;
  const uv = geometry.attributes.uv?.array as Float32Array | undefined;
  const P: number[] = [], N: number[] = [], U: number[] = [];
  const out = new geometry.constructor();
  let groupStart = 0, groupMat = -1, v = 0;
  for (const g of geometry.groups) {
    for (let s = g.start; s < g.start + g.count; s += 3) {
      let tris: Tri[] = [{
        p: Array.from(pos.slice(s * 3, s * 3 + 9)),
        n: Array.from(nor.slice(s * 3, s * 3 + 9)),
        uv: uv ? Array.from(uv.slice(s * 2, s * 2 + 6)) : null,
        mat: g.materialIndex,
      }];
      for (let r = 0; r < rounds; r++) tris = tris.flatMap(subdivide);
      if (g.materialIndex !== groupMat) {
        if (groupMat >= 0) out.addGroup(groupStart, v - groupStart, groupMat);
        groupStart = v;
        groupMat = g.materialIndex;
      }
      for (const t of tris) {
        P.push(...t.p);
        N.push(...t.n);
        if (t.uv) U.push(...t.uv);
        v += 3;
      }
    }
  }
  if (groupMat >= 0) out.addGroup(groupStart, v - groupStart, groupMat);
  const Attr = geometry.attributes.position.constructor;
  out.setAttribute("position", new Attr(P, 3));
  out.setAttribute("normal", new Attr(N, 3));
  if (uv) out.setAttribute("uv", new Attr(U, 2));
  return out;
}

function disposePieces(scene: Any, pieces: Array<{ mesh: Any }>) {
  for (const p of pieces) {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
  }
}

// --------------------------------------------------------------------------
// Screen cracks (metal nat 1)
// --------------------------------------------------------------------------

type CrackSegment = { x1: number; y1: number; x2: number; y2: number; d: number; w: number };
type CrackPane = { pts: number[]; d: number; alpha: number };
type Impact = { x: number; y: number; segments: CrackSegment[]; panes: CrackPane[] };

function buildImpact(x: number, y: number, strength: number): Impact {
  const diag = Math.hypot(window.innerWidth, window.innerHeight);
  const segments: CrackSegment[] = [];
  const panes: CrackPane[] = [];
  const rayCount = Math.floor(rand(12, 18));
  const rays: Array<Array<{ x: number; y: number; d: number }>> = [];

  const walk = (sx: number, sy: number, angle: number, length: number, startD: number, width: number, branchDepth: number) => {
    const pts = [{ x: sx, y: sy, d: startD }];
    let px = sx, py = sy, a = angle, travelled = 0;
    while (travelled < length) {
      const step = rand(14, 36);
      a += rand(-0.28, 0.28);
      const nx = px + Math.cos(a) * step;
      const ny = py + Math.sin(a) * step;
      travelled += step;
      const d = startD + travelled;
      const w = width * (1 - travelled / length) + 0.4;
      segments.push({ x1: px, y1: py, x2: nx, y2: ny, d, w });
      pts.push({ x: nx, y: ny, d });
      if (branchDepth > 0 && Math.random() < 0.14) {
        walk(nx, ny, a + rand(0.35, 0.8) * (Math.random() < 0.5 ? -1 : 1), (length - travelled) * rand(0.3, 0.6), d, w * 0.7, branchDepth - 1);
      }
      px = nx;
      py = ny;
    }
    return pts;
  };

  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2 + rand(-0.18, 0.18);
    rays.push(walk(x, y, angle, diag * rand(0.3, 0.75) * strength, 0, rand(1.8, 3), 2));
  }

  const ringRadii = [rand(20, 32), rand(60, 90), rand(130, 180), rand(230, 300)].map((r) => r * strength);
  const pointAt = (ray: Array<{ x: number; y: number; d: number }>, r: number) => ray.find((p) => p.d >= r) ?? ray[ray.length - 1];
  for (let i = 0; i < rays.length; i++) {
    const a = rays[i];
    const b = rays[(i + 1) % rays.length];
    let prevA = { x, y, d: 0 };
    let prevB = { x, y, d: 0 };
    for (const r of ringRadii) {
      if (Math.random() < 0.2) continue;
      const pa = pointAt(a, r * rand(0.85, 1.15));
      const pb = pointAt(b, r * rand(0.85, 1.15));
      const mx = (pa.x + pb.x) / 2 + rand(-6, 6);
      const my = (pa.y + pb.y) / 2 + rand(-6, 6);
      segments.push({ x1: pa.x, y1: pa.y, x2: mx, y2: my, d: r + 20, w: 1 });
      segments.push({ x1: mx, y1: my, x2: pb.x, y2: pb.y, d: r + 30, w: 1 });
      if (Math.random() < 0.6) {
        panes.push({ pts: [prevA.x, prevA.y, pa.x, pa.y, mx, my, pb.x, pb.y, prevB.x, prevB.y], d: r + 30, alpha: rand(0.03, 0.14) });
      }
      prevA = pa;
      prevB = pb;
    }
  }
  return { x, y, segments, panes };
}

function drawImpact(ctx: CanvasRenderingContext2D, imp: Impact, grown: number) {
  for (const pane of imp.panes) {
    if (pane.d > grown) continue;
    ctx.beginPath();
    ctx.moveTo(pane.pts[0], pane.pts[1]);
    for (let i = 2; i < pane.pts.length; i += 2) ctx.lineTo(pane.pts[i], pane.pts[i + 1]);
    ctx.closePath();
    ctx.fillStyle = `rgba(220, 235, 255, ${pane.alpha})`;
    ctx.fill();
  }
  ctx.lineCap = "round";
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? "rgba(0, 0, 0, 0.55)" : "rgba(255, 255, 255, 0.92)";
    for (const s of imp.segments) {
      if (s.d > grown) continue;
      ctx.lineWidth = pass === 0 ? s.w + 1.6 : s.w;
      const o = pass === 0 ? 1 : 0;
      ctx.beginPath();
      ctx.moveTo(s.x1 + o, s.y1 + o);
      ctx.lineTo(s.x2 + o, s.y2 + o);
      ctx.stroke();
    }
  }
  const g = ctx.createRadialGradient(imp.x, imp.y, 0, imp.x, imp.y, 30);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.4, "rgba(230,240,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(imp.x, imp.y, 30, 0, Math.PI * 2);
  ctx.fill();
}

// --------------------------------------------------------------------------
// Effects. Each one owns its die and returns update/destroy plus its length.
// --------------------------------------------------------------------------

type Effect = { duration: number; update: (ms: number, dt: number) => void; destroy: () => void };
type EffectCtx = { box: Any; die: Any; onHit: () => void; color: string };

/** Glass nat 1: cracks, then bursts into a pile of shards on the table. */
function glassShatter({ box, die, onHit }: EffectCtx): Effect {
  const materials = cloneMaterials(die);
  const { rest, halfHeight, radius } = bakeToWorld(die);
  const BREAK = 260;
  let pieces: Piece[] = [];
  let broken = false;

  return {
    duration: 3400,
    update(ms, dt) {
      if (!broken) {
        const c = clamp01(ms / BREAK);
        const k = c * halfHeight * 0.06;
        die.position.set(rest.x + rand(-k, k), rest.y + rand(-k, k), rest.z);
        setGlow(materials, 0xffffff, c * 0.5);
        if (ms < BREAK) return;
        broken = true;
        onHit();
        const area = (radius * radius) / 22;
        const frag = fragment(box, die, materials, area, 2);
        pieces = frag.pieces.map((f) => {
          const speed = rand(180, 620);
          const flat = Math.hypot(f.dir[0], f.dir[1]) || 1;
          f.mesh.castShadow = false;
          return {
            mesh: f.mesh,
            vel: [(f.dir[0] / flat) * speed, (f.dir[1] / flat) * speed, rand(80, 330)] as [number, number, number],
            spin: [rand(-20, 20), rand(-20, 20), rand(-20, 20)] as [number, number, number],
          };
        });
      }
      const since = ms - BREAK;
      // Never goes dark: shards keep catching light while they settle.
      setGlow(materials, 0xdff4ff, 0.22 + Math.max(0, 0.5 - since / 350) + 0.1 * Math.max(0, Math.sin(ms / 90)));
      for (const p of pieces) stepPiece(p, dt, 2800, 0.28);
      if (ms > 2700) setOpacity(materials, 1 - clamp01((ms - 2700) / 600));
    },
    destroy: () => disposePieces(box.scene, pieces),
  };
}

/** Metal nat 1: the die launches into the lens and breaks the display. */
function metalBreakScreen({ box, die, onHit }: EffectCtx): Effect {
  const materials = cloneMaterials(die);
  const { rest, halfHeight } = bakeToWorld(die);
  const camPos = box.camera.position;
  const target = {
    x: camPos.x + (rest.x - camPos.x) * 0.08,
    y: camPos.y + (rest.y - camPos.y) * 0.08,
    z: camPos.z + (rest.z - camPos.z) * 0.08,
  };
  const WIND = 220;
  const FLY = 300;
  const HIT = WIND + FLY;
  const overlay = createOverlay();
  let impact: Impact | null = null;
  let hitPoint = { x: 0, y: 0 };
  let blots: Array<{ x: number; y: number; r: number; pts: number[]; delay: number }> = [];
  let lines: Array<{ x: number; w: number; color: string; top: number; bottom: number }> = [];

  return {
    duration: 3600,
    update(ms) {
      overlay.clear();
      const ctx = overlay.ctx;
      if (ms < HIT) {
        // Crouch, then launch straight at the camera.
        if (ms < WIND) {
          const c = ms / WIND;
          die.position.set(rest.x, rest.y, rest.z - c * halfHeight * 0.25);
          die.scale.set(1 + c * 0.12, 1 + c * 0.12, 1 - c * 0.2);
        } else {
          const t = (ms - WIND) / FLY;
          const e = t * t * t;
          die.scale.set(1, 1, 1);
          die.position.set(rest.x + (target.x - rest.x) * e, rest.y + (target.y - rest.y) * e, rest.z + (target.z - rest.z) * e);
          die.rotation.x += 0.35;
          die.rotation.y += 0.22;
        }
        return;
      }
      if (!impact) {
        hitPoint = toScreen(box, rest);
        box.scene.remove(die);
        impact = buildImpact(hitPoint.x, hitPoint.y, 1.35);
        blots = Array.from({ length: 5 }, (_, i) => {
          const a = rand(0, Math.PI * 2);
          const d = i === 0 ? 0 : rand(40, 220);
          return {
            x: hitPoint.x + Math.cos(a) * d,
            y: hitPoint.y + Math.sin(a) * d,
            r: i === 0 ? rand(90, 140) : rand(30, 90),
            pts: Array.from({ length: 28 }, () => rand(0.6, 1)),
            delay: i * rand(60, 160),
          };
        });
        const colors = ["#ff00e6", "#00ff6a", "#00e5ff", "#ffffff", "#fff200", "#ff2a2a"];
        lines = Array.from({ length: Math.floor(rand(9, 15)) }, () => ({
          x: hitPoint.x + rand(-overlay.w * 0.35, overlay.w * 0.35),
          w: pick([1, 1, 2, 3]),
          color: pick(colors),
          top: Math.random() < 0.6 ? 0 : rand(0, hitPoint.y),
          bottom: Math.random() < 0.6 ? overlay.h : rand(hitPoint.y, overlay.h),
        }));
        shakePage(2.2, 420);
        onHit();
      }
      const since = ms - HIT;

      // Dead LCD: ink bleeding out from the impact.
      for (const b of blots) {
        const grow = easeOutCubic((since - b.delay) / 1100);
        if (grow <= 0) continue;
        const r = b.r * grow;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
        g.addColorStop(0, "rgba(0,0,0,0.97)");
        g.addColorStop(0.65, "rgba(5,5,12,0.9)");
        g.addColorStop(1, "rgba(10,0,30,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        b.pts.forEach((f, i) => {
          const a = (i / b.pts.length) * Math.PI * 2;
          const px = b.x + Math.cos(a) * r * f;
          const py = b.y + Math.sin(a) * r * f;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fill();
      }

      // Stuck pixel columns, flickering.
      for (const l of lines) {
        if (Math.random() < 0.08) continue;
        ctx.globalAlpha = rand(0.55, 0.95);
        ctx.fillStyle = l.color;
        ctx.fillRect(l.x, l.top, l.w, l.bottom - l.top);
      }
      ctx.globalAlpha = 1;

      // Occasional horizontal tearing.
      if (Math.random() < 0.12) {
        const y = rand(0, overlay.h);
        ctx.fillStyle = pick(["rgba(255,0,230,0.18)", "rgba(0,255,120,0.15)", "rgba(255,255,255,0.12)"]);
        ctx.fillRect(0, y, overlay.w, rand(4, 22));
      }

      drawImpact(ctx, impact, since * 4);

      // White flash of the hit.
      if (since < 220) {
        ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - since / 220)})`;
        ctx.fillRect(0, 0, overlay.w, overlay.h);
      }
      if (ms > 3050) overlay.fadeOut();
    },
    destroy: () => overlay.destroy(),
  };
}

/** Plastic nat 1: smokes, goes soft, slumps and spreads into a glossy puddle; the page drips a little. */
function plasticMelt({ box, die, onHit }: EffectCtx): Effect {
  const materials = cloneMaterials(die);
  const baked = bakeToWorld(die);
  const { rest, halfHeight, radius } = baked;
  const geometry = subdivideGeometry(baked.geometry, 2);
  baked.geometry.dispose();
  die.geometry = geometry;
  const pos = geometry.attributes.position;
  const base = Float32Array.from(pos.array as ArrayLike<number>);
  const count = pos.count;
  const height = halfHeight * 2;
  const puddleRadius = radius * 1.7;
  const puddleThickness = halfHeight * 0.32;
  const drips = Array.from({ length: Math.floor(rand(3, 6)) }, () => ({ at: rand(0, Math.PI * 2), len: rand(0.25, 0.5), width: rand(0.16, 0.3) }));
  const wobbleA = rand(0, Math.PI * 2);
  const DELAY = 150;
  const LENGTH = 2200;
  const screenMelt = createScreenMelt(1100, 1900);
  const overlay = createOverlay();
  type Puff = { x: number; y: number; vx: number; vy: number; r: number; age: number; life: number };
  const puffs: Puff[] = [];
  let lastPuff = 0;
  let hit = false;

  const lobe = (ang: number) => {
    let l = 1 + 0.08 * Math.sin(ang * 5 + wobbleA) + 0.06 * Math.sin(ang * 3 - wobbleA);
    for (const d of drips) {
      let diff = Math.abs(ang - d.at) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      l += d.len * Math.exp(-((diff / d.width) ** 2));
    }
    return l;
  };

  // Shared corners get one smooth normal, so the goo looks soft instead of faceted.
  const keyIds = new Int32Array(count);
  const keyIndex = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const k = vertexKey(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
    let id = keyIndex.get(k);
    if (id === undefined) {
      id = keyIndex.size;
      keyIndex.set(k, id);
    }
    keyIds[i] = id;
  }
  const accum = new Float32Array(keyIndex.size * 3);
  const normals = geometry.attributes.normal;

  return {
    duration: 3600,
    update(ms, dt) {
      if (!hit) {
        hit = true;
        onHit();
      }
      screenMelt?.update(ms);
      const p = clamp01((ms - DELAY) / LENGTH);
      const arr = pos.array as Float32Array;
      const jiggle = Math.sin(ms / 65) * Math.sin(Math.PI * p) * 0.05;

      for (let i = 0; i < count; i++) {
        const x0 = base[i * 3];
        const y0 = base[i * 3 + 1];
        const z0 = base[i * 3 + 2];
        const h = clamp01((z0 + halfHeight) / height); // 0 at table, 1 at top
        const n = vertexNoise(x0, y0, z0, 1);
        const ang = Math.atan2(y0, x0);

        // Where this point ends up: the top of the die becomes the middle of the
        // puddle, the bottom becomes its rim (and the drips).
        const phi = Math.acos(Math.max(-1, Math.min(1, z0 / (Math.hypot(x0, y0, z0) || 1))));
        const spread = Math.sin(phi / 2);
        const rimR = puddleRadius * lobe(ang);
        const rT = rimR * spread * (0.97 + n * 0.05);
        const edge = spread * spread;
        const zT = -halfHeight + 0.6 + puddleThickness * Math.pow(1 - edge, 0.8) * (1 + (n - 0.5) * 0.08);

        // Top gives way first; mid-height bulges outward while it sags.
        const m = smooth(p * 1.5 - (1 - h) * 0.5 - n * 0.06);
        const bulge = Math.sin(Math.PI * m) * (1 - h) * radius * 0.25;
        const r0 = Math.hypot(x0, y0);
        const r = r0 + (rT - r0) * m + bulge;
        const z = z0 + (zT - z0) * m + jiggle * h * height;

        // The upper part slides off to one side as it gives way.
        const slide = Math.sin(Math.PI * Math.min(1, m * 1.2)) * h * radius * 0.55;
        arr[i * 3] = Math.cos(ang) * r + Math.cos(wobbleA) * slide;
        arr[i * 3 + 1] = Math.sin(ang) * r + Math.sin(wobbleA) * slide;
        arr[i * 3 + 2] = Math.max(z, -halfHeight + 0.4);
      }
      pos.needsUpdate = true;

      accum.fill(0);
      for (let t = 0; t < count; t += 3) {
        const ax = arr[t * 3], ay = arr[t * 3 + 1], az = arr[t * 3 + 2];
        const bx = arr[t * 3 + 3] - ax, by = arr[t * 3 + 4] - ay, bz = arr[t * 3 + 5] - az;
        const cx = arr[t * 3 + 6] - ax, cy = arr[t * 3 + 7] - ay, cz = arr[t * 3 + 8] - az;
        const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
        for (let k = 0; k < 3; k++) {
          const id = keyIds[t + k] * 3;
          accum[id] += nx;
          accum[id + 1] += ny;
          accum[id + 2] += nz;
        }
      }
      const narr = normals.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const id = keyIds[i] * 3;
        const len = Math.hypot(accum[id], accum[id + 1], accum[id + 2]) || 1;
        narr[i * 3] = accum[id] / len;
        narr[i * 3 + 1] = accum[id + 1] / len;
        narr[i * 3 + 2] = accum[id + 2] / len;
      }
      normals.needsUpdate = true;
      geometry.computeBoundingSphere();

      // Wet, glossy plastic as it goes.
      for (const m of materials) {
        if ("roughness" in m) m.roughness = 0.5 - 0.42 * p;
        if ("shininess" in m) m.shininess = 30 + 150 * p;
      }

      // Acrid smoke curling up off it.
      overlay.clear();
      const ctx = overlay.ctx;
      if (ms < 2600 && ms - lastPuff > 70) {
        lastPuff = ms;
        const c = toScreen(box, rest);
        const sr = screenRadius(box, rest, radius);
        puffs.push({ x: c.x + rand(-sr, sr) * 0.6, y: c.y + rand(-sr, sr) * 0.3, vx: rand(-12, 12), vy: rand(-70, -40), r: sr * rand(0.25, 0.45), age: 0, life: rand(1.1, 1.8) });
      }
      for (const f of puffs) {
        f.age += dt;
        if (f.age > f.life) continue;
        const k = f.age / f.life;
        f.x += (f.vx + Math.sin(f.age * 3 + f.life * 7) * 14) * dt;
        f.y += f.vy * dt;
        const rr = f.r * (1 + k * 2.2);
        const a = 0.22 * Math.sin(Math.PI * k) * smooth(ms / 300);
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
        g.addColorStop(0, `rgba(170,170,175,${a})`);
        g.addColorStop(1, "rgba(170,170,175,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(f.x, f.y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    destroy() {
      screenMelt?.destroy();
      overlay.destroy();
    },
  };
}

/** A gentle downward drip of the whole page (SVG displacement on <body>). */
function createScreenMelt(startMs: number, durationMs: number) {
  if (prefersReducedMotion()) return null;
  const id = `huddle-screen-melt-${Math.random().toString(36).slice(2)}`;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.innerHTML = `
    <filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.04 0.0004" numOctaves="1" seed="${Math.floor(rand(1, 999))}" result="noise"/>
      <feComponentTransfer in="noise" result="map">
        <feFuncR type="table" tableValues="0.5 0.5"/>
        <feFuncG type="discrete" tableValues="0.5 0.36 0.47 0.18 0.42 0.5 0.08 0.3 0.45 0.24"/>
        <feFuncA type="table" tableValues="1 1"/>
      </feComponentTransfer>
      <feDisplacementMap in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;
  const displacement = svg.querySelector("feDisplacementMap")!;
  document.body.appendChild(svg);
  const target = document.body;
  const previousFilter = target.style.filter;
  let applied = false;
  const maxScale = Math.min(110, window.innerHeight * 0.13);

  return {
    update(ms: number) {
      const t = (ms - startMs) / durationMs;
      if (t <= 0 || t >= 1) {
        if (applied) {
          target.style.filter = previousFilter;
          applied = false;
        }
        return;
      }
      if (!applied) {
        target.style.filter = `url(#${id})`;
        applied = true;
      }
      // Slow ooze, short hang, then it settles back.
      const s = t < 0.6 ? Math.pow(t / 0.6, 1.6) : t < 0.75 ? 1 : 1 - smooth((t - 0.75) / 0.25);
      displacement.setAttribute("scale", String(Math.round(s * maxScale)));
    },
    destroy() {
      if (applied) target.style.filter = previousFilter;
      svg.remove();
    },
  };
}

function woodGrainCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 256, 0);
  bg.addColorStop(0, "#b98149");
  bg.addColorStop(0.5, "#d4a066");
  bg.addColorStop(1, "#b07640");
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i++) {
    const x = rand(0, 256);
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? "92,55,24" : "120,72,32"},${rand(0.25, 0.6)})`;
    g.lineWidth = rand(0.8, 3);
    g.beginPath();
    const wave = rand(2, 7);
    const phase = rand(0, 6);
    for (let y = 0; y <= 256; y += 8) {
      const px = x + Math.sin(y / 30 + phase) * wave;
      if (y === 0) g.moveTo(px, y);
      else g.lineTo(px, y);
    }
    g.stroke();
  }
  // Torn fibres along the break.
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(240,205,160,${rand(0.2, 0.5)})`;
    g.lineWidth = rand(0.5, 1.5);
    const x = rand(0, 256), y = rand(0, 256);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rand(-3, 3), y + rand(8, 26));
    g.stroke();
  }
  return c;
}

/** Wood nat 1: cracks down the grain, the halves fall open, splinters fly. */
function woodSplit({ box, die, onHit }: EffectCtx): Effect {
  const materials = cloneMaterials(die);
  const { geometry, rest, halfHeight, radius } = bakeToWorld(die);
  const Vec3 = die.position.constructor;
  const GeometryCtor = geometry.constructor;
  const AttrCtor = geometry.attributes.position.constructor;
  const MeshCtor = die.constructor;

  // Raw wood for the inside of the break.
  const woodMat = materials[0].clone();
  if (woodMat.map) {
    const tex = woodMat.map.clone();
    tex.image = woodGrainCanvas();
    tex.needsUpdate = true;
    woodMat.map = tex;
  }
  woodMat.bumpMap = null;
  woodMat.color?.setHex(0xffffff);
  woodMat.emissive?.setHex(0x000000);
  woodMat.opacity = 1;

  const a = rand(0, Math.PI);
  const n = { x: Math.cos(a), y: Math.sin(a) };
  const t = { x: -Math.sin(a), y: Math.cos(a) };
  const axis = new Vec3(t.x, t.y, 0);
  const SPLIT = 380;
  let split = false;
  const halves: Array<{ side: number; meshes: Any[]; pivot: V3; delay: number; topAngle: number }> = [];
  const splinters: Piece[] = [];

  const buildHalves = () => {
    const pos = geometry.attributes.position.array as Float32Array;
    const nor = geometry.attributes.normal.array as Float32Array;
    const uv = geometry.attributes.uv?.array as Float32Array | undefined;

    for (const side of [-1, 1]) {
      const p: number[] = [], nn: number[] = [], uu: number[] = [];
      const g = new GeometryCtor();
      const near: Array<{ u: number; w: number; d: number }> = [];
      let vi = 0;
      for (const group of geometry.groups) {
        const s = group.start;
        const cx = (pos[s * 3] + pos[s * 3 + 3] + pos[s * 3 + 6]) / 3;
        const cy = (pos[s * 3 + 1] + pos[s * 3 + 4] + pos[s * 3 + 7]) / 3;
        // Jagged break: triangles near the cut are assigned a bit randomly.
        const d = cx * n.x + cy * n.y + rand(-0.12, 0.12) * radius;
        if (Math.sign(d || 1) !== side) continue;
        for (let k = 0; k < 3; k++) {
          const x = pos[(s + k) * 3], y = pos[(s + k) * 3 + 1], z = pos[(s + k) * 3 + 2];
          p.push(x, y, z);
          nn.push(nor[(s + k) * 3], nor[(s + k) * 3 + 1], nor[(s + k) * 3 + 2]);
          if (uv) uu.push(uv[(s + k) * 2], uv[(s + k) * 2 + 1]);
          const dv = x * n.x + y * n.y;
          if (Math.abs(dv) < radius * 0.45) near.push({ u: x * t.x + y * t.y, w: z, d: dv });
        }
        g.addGroup(vi, 3, group.materialIndex);
        vi += 3;
      }
      // Hinge on the outer bottom edge, so the half tips over outward.
      const pivot = { x: n.x * side * radius * 0.55, y: n.y * side * radius * 0.55, z: -halfHeight };
      for (let i = 0; i < p.length; i += 3) {
        p[i] -= pivot.x;
        p[i + 1] -= pivot.y;
        p[i + 2] -= pivot.z;
      }
      g.setAttribute("position", new AttrCtor(p, 3));
      g.setAttribute("normal", new AttrCtor(nn, 3));
      if (uv) g.setAttribute("uv", new AttrCtor(uu, 2));
      const shell = new MeshCtor(g, materials);

      const cap = buildCap(near, side, pivot);
      const meshes = cap ? [shell, cap] : [shell];
      for (const m of meshes) {
        m.position.set(rest.x + pivot.x, rest.y + pivot.y, rest.z + pivot.z);
        m.castShadow = true;
        box.scene.add(m);
      }
      halves.push({ side, meshes, pivot, delay: side === 1 ? 0 : rand(40, 120), topAngle: rand(1.15, 1.3) });
    }
  };

  /** Splintered fracture face: convex outline of the cut, with a rough interior. */
  const buildCap = (pts: Array<{ u: number; w: number; d: number }>, side: number, pivot: V3) => {
    if (pts.length < 3) return null;
    const sorted = [...pts].sort((A, B) => A.u - B.u || A.w - B.w);
    const cross = (o: Any, A: Any, B: Any) => (A.u - o.u) * (B.w - o.w) - (A.w - o.w) * (B.u - o.u);
    const lower: Any[] = [];
    for (const q of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
      lower.push(q);
    }
    const upper: Any[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const q = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
      upper.push(q);
    }
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
    if (hull.length < 3) return null;

    const cu = hull.reduce((s: number, q: Any) => s + q.u, 0) / hull.length;
    const cw = hull.reduce((s: number, q: Any) => s + q.w, 0) / hull.length;
    let umin = Infinity, umax = -Infinity, wmin = Infinity, wmax = -Infinity;
    for (const q of hull) {
      umin = Math.min(umin, q.u); umax = Math.max(umax, q.u);
      wmin = Math.min(wmin, q.w); wmax = Math.max(wmax, q.w);
    }
    const to3 = (u: number, w: number, d: number) => [t.x * u + n.x * d - pivot.x, t.y * u + n.y * d - pivot.y, w - pivot.z];
    const toUv = (u: number, w: number) => [(u - umin) / (umax - umin || 1), (w - wmin) / (wmax - wmin || 1)];
    // Edge points sit slightly inside the shell so no gap shows at the rim.
    const rim = hull.map((q: Any) => ({ u: q.u, w: q.w, d: Math.max(-radius * 0.08, Math.min(radius * 0.08, q.d)) * 0.5 }));
    const ring = rim.map((q: Any) => ({
      u: cu + (q.u - cu) * rand(0.45, 0.65),
      w: cw + (q.w - cw) * rand(0.45, 0.65),
      d: side * rand(-0.1, 0.06) * radius,
    }));
    const mid = { u: cu, w: cw, d: side * rand(-0.06, 0.02) * radius };
    const P: number[] = [], U: number[] = [];
    const tri = (A: Any, B: Any, C: Any) => {
      for (const q of [A, B, C]) {
        P.push(...to3(q.u, q.w, q.d));
        U.push(...toUv(q.u, q.w));
      }
    };
    for (let i = 0; i < rim.length; i++) {
      const j = (i + 1) % rim.length;
      tri(mid, ring[i], ring[j]);
      tri(ring[i], rim[i], rim[j]);
      tri(ring[i], rim[j], ring[j]);
    }
    const g = new GeometryCtor();
    g.setAttribute("position", new AttrCtor(P, 3));
    g.setAttribute("uv", new AttrCtor(U, 2));
    g.computeVertexNormals();
    return new MeshCtor(g, woodMat);
  };

  const spawnSplinters = () => {
    for (let i = 0; i < 26; i++) {
      const len = rand(0.25, 0.6) * radius;
      const wid = rand(0.03, 0.07) * radius;
      const g = new GeometryCtor();
      g.setAttribute("position", new AttrCtor([0, 0, 0, len, wid, 0, len, -wid, 0, 0, 0, 0, len, -wid, 0, len * 0.6, 0, wid], 3));
      g.setAttribute("uv", new AttrCtor([0, 0, 1, 0.1, 1, 0, 0, 0, 1, 0, 0.6, 0.05], 2));
      g.computeVertexNormals();
      const mesh = new MeshCtor(g, woodMat);
      const u = rand(-radius * 0.7, radius * 0.7);
      mesh.position.set(rest.x + t.x * u, rest.y + t.y * u, rest.z + rand(-halfHeight, halfHeight) * 0.8);
      mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      mesh.castShadow = true;
      box.scene.add(mesh);
      const side = Math.random() < 0.5 ? -1 : 1;
      const sp = rand(150, 520);
      splinters.push({
        mesh,
        vel: [n.x * side * sp + t.x * rand(-120, 120), n.y * side * sp + t.y * rand(-120, 120), rand(250, 700)],
        spin: [rand(-18, 18), rand(-18, 18), rand(-18, 18)],
      });
    }
  };

  return {
    duration: 3500,
    update(ms, dt) {
      if (!split) {
        // Strain: shudders harder and harder along the crack direction.
        const c = clamp01(ms / SPLIT);
        const k = c * c * halfHeight * 0.1 * Math.sin(ms / 18);
        die.position.set(rest.x + n.x * k, rest.y + n.y * k, rest.z);
        if (ms < SPLIT) return;
        split = true;
        box.scene.remove(die);
        buildHalves();
        spawnSplinters();
        onHit();
        shakePage(0.6, 200);
      }
      const since = ms - SPLIT;
      for (const h of halves) {
        // Tips over with gravity, thuds, rocks once.
        const f = clamp01((since - h.delay) / 520);
        let angle = f < 0.75 ? Math.pow(f / 0.75, 2) * h.topAngle : h.topAngle - Math.sin(((f - 0.75) / 0.25) * Math.PI) * 0.12;
        angle = Math.max(0, angle);
        const slide = easeOutCubic(since / 700) * radius * 0.25;
        for (const m of h.meshes) {
          m.quaternion.setFromAxisAngle(axis, h.side * angle);
          m.position.set(
            rest.x + h.pivot.x + n.x * h.side * slide,
            rest.y + h.pivot.y + n.y * h.side * slide,
            rest.z + h.pivot.z,
          );
        }
      }
      for (const s of splinters) stepPiece(s, dt, 2600, 0.25);
      if (ms > 2900) {
        const o = 1 - clamp01((ms - 2900) / 550);
        setOpacity(materials, o);
        woodMat.opacity = o;
        woodMat.transparent = true;
      }
    },
    destroy() {
      for (const h of halves) disposePieces(box.scene, h.meshes.map((mesh) => ({ mesh })));
      disposePieces(box.scene, splinters);
      woodMat.map?.dispose?.();
    },
  };
}

/** Glass nat 20: floats up and splits the light into a rotating prism burst. */
function glassPrism({ box, die }: EffectCtx): Effect {
  const materials = cloneMaterials(die);
  const { rest, halfHeight, radius } = bakeToWorld(die);
  const overlay = createOverlay();
  const beams = Array.from({ length: 16 }, (_, i) => ({
    angle: (i / 16) * Math.PI * 2 + rand(-0.08, 0.08),
    hue: (i / 16) * 360,
    width: rand(0.035, 0.075),
    length: rand(0.55, 1),
  }));
  const glints = Array.from({ length: 22 }, () => ({
    a: rand(0, Math.PI * 2),
    d: rand(1.2, 5),
    size: rand(5, 13),
    phase: rand(0, 6),
    speed: rand(0.006, 0.014),
  }));
  const spin = Math.random() < 0.5 ? -1 : 1;

  return {
    duration: 3400,
    update(ms) {
      const rise = easeOutCubic(ms / 700) * (ms > 2600 ? 1 - smooth((ms - 2600) / 600) : 1);
      die.position.set(rest.x, rest.y, rest.z + rise * halfHeight * 1.8);
      die.rotation.z += spin * 0.012;
      die.rotation.x = Math.sin(ms / 600) * 0.15 * rise;
      setGlow(materials, 0xe8f6ff, 0.25 + 0.25 * Math.sin(ms / 160) * rise);

      overlay.clear();
      const ctx = overlay.ctx;
      const c = toScreen(box, die.position);
      const r = screenRadius(box, die.position, radius);
      const diag = Math.hypot(overlay.w, overlay.h);
      const env = smooth(ms / 500) * (1 - smooth((ms - 2500) / 700));
      if (env <= 0) return;

      ctx.globalCompositeOperation = "lighter";
      const turn = (ms / 1000) * 0.35 * spin;
      for (const b of beams) {
        const len = r + diag * b.length * 0.7 * easeOutCubic(ms / 900);
        const a = b.angle + turn;
        const g = ctx.createLinearGradient(c.x, c.y, c.x + Math.cos(a) * len, c.y + Math.sin(a) * len);
        g.addColorStop(0, `hsla(${b.hue}, 100%, 75%, ${0.55 * env})`);
        g.addColorStop(0.35, `hsla(${b.hue}, 100%, 62%, ${0.28 * env})`);
        g.addColorStop(1, `hsla(${b.hue}, 100%, 55%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(a - b.width) * len, c.y + Math.sin(a - b.width) * len);
        ctx.lineTo(c.x + Math.cos(a + b.width) * len, c.y + Math.sin(a + b.width) * len);
        ctx.closePath();
        ctx.fill();
      }

      const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 3);
      halo.addColorStop(0, `rgba(255,255,255,${0.55 * env})`);
      halo.addColorStop(0.4, `rgba(200,235,255,${0.2 * env})`);
      halo.addColorStop(1, "rgba(200,235,255,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 3, 0, Math.PI * 2);
      ctx.fill();

      for (const g of glints) {
        const tw = Math.max(0, Math.sin(ms * g.speed + g.phase));
        if (tw <= 0.05) continue;
        const gx = c.x + Math.cos(g.a + turn * 0.5) * r * g.d;
        const gy = c.y + Math.sin(g.a + turn * 0.5) * r * g.d;
        const s = g.size * tw;
        ctx.fillStyle = `rgba(255,255,255,${0.9 * env * tw})`;
        ctx.beginPath();
        ctx.moveTo(gx, gy - s);
        ctx.lineTo(gx + s * 0.18, gy);
        ctx.lineTo(gx, gy + s);
        ctx.lineTo(gx - s * 0.18, gy);
        ctx.closePath();
        ctx.moveTo(gx - s, gy);
        ctx.lineTo(gx, gy + s * 0.18);
        ctx.lineTo(gx + s, gy);
        ctx.lineTo(gx, gy - s * 0.18);
        ctx.closePath();
        ctx.fill();
      }
    },
    destroy: () => overlay.destroy(),
  };
}

/** Metal nat 20: rises, slams down like a hammer on an anvil, throws sparks. */
function metalForge({ box, die }: EffectCtx): Effect {
  const materials = cloneMaterials(die);
  const { rest, halfHeight, radius } = bakeToWorld(die);
  const overlay = createOverlay();
  const LIFT = 480;
  const SLAM = 110;
  const HIT = LIFT + SLAM;
  type Spark = { x: number; y: number; vx: number; vy: number; life: number; age: number; w: number };
  const sparks: Spark[] = [];
  const embers: Spark[] = [];
  let hit = false;
  let ring = { x: 0, y: 0, r: 0 };
  let lastEmber = 0;
  const spin = Math.random() < 0.5 ? -1 : 1;

  const burst = (x: number, y: number, count: number, power: number) => {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(250, 1100) * power;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.75 - rand(200, 600) * power, life: rand(0.5, 1.3), age: 0, w: rand(1.2, 2.6) });
    }
  };

  return {
    duration: 3500,
    update(ms, dt) {
      if (ms < LIFT) {
        const c = ms / LIFT;
        die.position.set(rest.x, rest.y, rest.z + easeOutCubic(c) * halfHeight * 2.6);
        die.rotation.z += spin * (0.02 + c * 0.25);
        setGlow(materials, 0xff8a2a, c * 0.35);
      } else if (ms < HIT) {
        const c = (ms - LIFT) / SLAM;
        die.position.set(rest.x, rest.y, rest.z + (1 - c * c) * halfHeight * 2.6);
        die.rotation.z += spin * 0.25 * (1 - c);
      } else {
        die.position.set(rest.x, rest.y, rest.z);
        if (!hit) {
          hit = true;
          const c = toScreen(box, rest);
          ring = { x: c.x, y: c.y, r: screenRadius(box, rest, radius) };
          burst(c.x, c.y, 170, 1);
          shakePage(1.1, 300);
        }
        const since = ms - HIT;
        // White-hot, cooling to a forged gold.
        const heat = Math.max(0, 1 - since / 2200);
        setGlow(materials, heat > 0.6 ? 0xfff0c0 : 0xffaa33, 0.25 + heat * 0.85);
        if (since > 250 && since < 2400 && ms - lastEmber > 45) {
          lastEmber = ms;
          embers.push({ x: ring.x + rand(-ring.r, ring.r), y: ring.y + rand(-ring.r, ring.r) * 0.5, vx: rand(-25, 25), vy: rand(-90, -40), life: rand(1, 1.8), age: 0, w: rand(1.5, 3.2) });
        }
      }

      overlay.clear();
      if (!hit) return;
      const ctx = overlay.ctx;
      const since = ms - HIT;

      // Shockwave across the table.
      if (since < 700) {
        const f = since / 700;
        const rr = ring.r * (1 + easeOutCubic(f) * 7);
        ctx.strokeStyle = `rgba(255, 220, 160, ${0.75 * (1 - f)})`;
        ctx.lineWidth = 10 * (1 - f) + 1;
        ctx.beginPath();
        ctx.ellipse(ring.x, ring.y, rr, rr * 0.85, 0, 0, Math.PI * 2);
        ctx.stroke();
        const flash = ctx.createRadialGradient(ring.x, ring.y, 0, ring.x, ring.y, ring.r * 4);
        flash.addColorStop(0, `rgba(255,240,200,${0.8 * (1 - f)})`);
        flash.addColorStop(1, "rgba(255,160,60,0)");
        ctx.fillStyle = flash;
        ctx.fillRect(ring.x - ring.r * 4, ring.y - ring.r * 4, ring.r * 8, ring.r * 8);
      }

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const s of sparks) {
        s.age += dt;
        if (s.age > s.life) continue;
        s.vy += 1500 * dt;
        s.vx *= 1 - 0.8 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const k = s.age / s.life;
        const col = k < 0.25 ? "255,250,230" : k < 0.6 ? "255,200,90" : "255,110,30";
        ctx.strokeStyle = `rgba(${col},${1 - k})`;
        ctx.lineWidth = s.w * (1 - k * 0.5);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 0.028, s.y - s.vy * 0.028);
        ctx.stroke();
      }
      for (const e of embers) {
        e.age += dt;
        if (e.age > e.life) continue;
        e.x += (e.vx + Math.sin((ms + e.life * 999) / 200) * 20) * dt;
        e.y += e.vy * dt;
        const k = e.age / e.life;
        ctx.fillStyle = `rgba(255,${Math.round(170 - k * 90)},40,${(1 - k) * 0.9})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.w * (1 - k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      if (ms > 3000) overlay.fadeOut();
    },
    destroy: () => overlay.destroy(),
  };
}

/** Plastic nat 20: hops, spins up and pops into a firework of its own faces. */
function plasticFirework({ box, die, color }: EffectCtx): Effect {
  const materials = cloneMaterials(die);
  const { rest, halfHeight } = bakeToWorld(die);
  const overlay = createOverlay();
  const POP = 520;
  let pieces: Piece[] = [];
  type Spark = { x: number; y: number; vx: number; vy: number; life: number; age: number; hue: number; trail: number[] };
  const sparks: Spark[] = [];
  const bursts: Array<{ at: number; x: number; y: number; hue: number; count: number; power: number; done?: boolean }> = [];
  let popped = false;
  const baseHue = hexHue(color);

  return {
    duration: 3500,
    update(ms, dt) {
      if (!popped) {
        const c = clamp01(ms / POP);
        die.position.set(rest.x, rest.y, rest.z + Math.sin(c * Math.PI * 0.5) * halfHeight * 2.4);
        die.rotation.z += 0.04 + c * c * 0.5;
        die.rotation.x += c * 0.12;
        die.scale.setScalar(1 + c * c * 0.25);
        setGlow(materials, 0xffffff, c * c * 0.7);
        if (ms < POP) return;
        popped = true;
        const frag = fragment(box, die, materials);
        pieces = frag.pieces.map((f) => {
          const sp = rand(500, 1300);
          f.mesh.castShadow = false;
          return {
            mesh: f.mesh,
            vel: [f.dir[0] * sp, f.dir[1] * sp, f.dir[2] * sp * 0.4] as [number, number, number],
            spin: [rand(-16, 16), rand(-16, 16), rand(-16, 16)] as [number, number, number],
          };
        });
        const c0 = toScreen(box, frag.center);
        bursts.push({ at: ms, x: c0.x, y: c0.y, hue: baseHue, count: 110, power: 1 });
        for (let i = 0; i < 3; i++) {
          bursts.push({
            at: ms + 260 + i * rand(200, 320),
            x: c0.x + rand(-overlay.w * 0.3, overlay.w * 0.3),
            y: c0.y + rand(-overlay.h * 0.35, -overlay.h * 0.05),
            hue: (baseHue + rand(60, 300)) % 360,
            count: 70,
            power: rand(0.55, 0.8),
          });
        }
      }
      const since = ms - POP;
      setGlow(materials, 0xffffff, Math.max(0, 0.8 - since / 600));
      for (const p of pieces) {
        const drag = Math.exp(-3.2 * dt);
        p.vel[0] *= drag;
        p.vel[1] *= drag;
        p.vel[2] *= drag;
        stepPiece(p, dt, 260, 0.3);
      }
      setOpacity(materials, 1 - clamp01((since - 900) / 900));

      overlay.clear();
      const ctx = overlay.ctx;
      for (const b of bursts) {
        if (b.done || ms < b.at) continue;
        b.done = true;
        for (let i = 0; i < b.count; i++) {
          const a = (i / b.count) * Math.PI * 2 + rand(-0.05, 0.05);
          const v = rand(0.75, 1) * 520 * b.power;
          sparks.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.9, 1.5), age: 0, hue: (b.hue + rand(-25, 25) + 360) % 360, trail: [] });
        }
        if (b !== bursts[0]) continue;
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(0, 0, overlay.w, overlay.h);
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const s of sparks) {
        s.age += dt;
        if (s.age > s.life) continue;
        const drag = Math.exp(-2.6 * dt);
        s.vx *= drag;
        s.vy = s.vy * drag + 160 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.trail.push(s.x, s.y);
        if (s.trail.length > 16) s.trail.splice(0, 2);
        const k = s.age / s.life;
        const twinkle = k > 0.6 ? (Math.random() < 0.5 ? 1 : 0.2) : 1;
        ctx.strokeStyle = `hsla(${s.hue}, 100%, ${70 - k * 15}%, ${(1 - k) * 0.85 * twinkle})`;
        ctx.lineWidth = 2.2 * (1 - k * 0.6);
        ctx.beginPath();
        ctx.moveTo(s.trail[0], s.trail[1]);
        for (let i = 2; i < s.trail.length; i += 2) ctx.lineTo(s.trail[i], s.trail[i + 1]);
        ctx.stroke();
      }
      if (ms > 3000) overlay.fadeOut();
    },
    destroy() {
      disposePieces(box.scene, pieces);
      overlay.destroy();
    },
  };
}

function hexHue(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 210;
  const v = parseInt(m[1], 16);
  const r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 210;
  const d = max - min;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

/** Wood nat 20: the die comes alive and branches out across the screen in bloom. */
function woodBloom({ box, die }: EffectCtx): Effect {
  const materials = cloneMaterials(die);
  const { rest, radius } = bakeToWorld(die);
  const overlay = createOverlay();
  const origin = toScreen(box, rest);
  const r0 = screenRadius(box, rest, radius);
  const diag = Math.hypot(overlay.w, overlay.h);
  const SPEED = 0.75; // px per ms

  type Branch = { pts: Array<{ x: number; y: number; s: number }>; start: number; width: number; length: number };
  type Leaf = { x: number; y: number; angle: number; size: number; at: number; hue: number };
  type Flower = { x: number; y: number; size: number; at: number; rot: number; tint: string };
  type Petal = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; at: number; tint: string; size: number };
  const branches: Branch[] = [];
  const leaves: Leaf[] = [];
  const flowers: Flower[] = [];
  const petals: Petal[] = [];
  const tints = ["#ffd1dc", "#ffb7c9", "#fff3f6", "#ffc4d6"];

  const grow = (x: number, y: number, angle: number, length: number, width: number, start: number, depth: number) => {
    const pts = [{ x, y, s: 0 }];
    let a = angle, px = x, py = y, s = 0;
    const bend = rand(-0.012, 0.012);
    while (s < length) {
      const step = 9;
      a += bend * step + rand(-0.06, 0.06);
      px += Math.cos(a) * step;
      py += Math.sin(a) * step;
      s += step;
      pts.push({ x: px, y: py, s });
      const at = start + s / SPEED;
      if (depth >= 1 && pts.length % 3 === 0) {
        const sideSign = pts.length % 6 === 0 ? 1 : -1;
        leaves.push({ x: px, y: py, angle: a + sideSign * rand(0.6, 1.1), size: rand(8, 15) * (0.6 + width / 8), at, hue: rand(95, 135) });
      }
      if (depth < 3 && Math.random() < 0.07 && s > length * 0.2 && s < length * 0.85) {
        grow(px, py, a + rand(0.45, 0.9) * (Math.random() < 0.5 ? -1 : 1), (length - s) * rand(0.45, 0.75), width * 0.6, at, depth + 1);
      }
    }
    branches.push({ pts, start, width, length });
    const end = start + length / SPEED;
    flowers.push({ x: px, y: py, size: rand(9, 15) * (depth >= 2 ? 0.8 : 1.15), at: end, rot: rand(0, 6), tint: pick(tints) });
    for (let i = 0; i < 2; i++) {
      petals.push({ x: px, y: py, vx: rand(-20, 20), vy: rand(15, 45), rot: rand(0, 6), vr: rand(-3, 3), at: end + rand(600, 1600), tint: pick(tints), size: rand(4, 7) });
    }
  };

  const mains = Math.floor(rand(5, 8));
  for (let i = 0; i < mains; i++) {
    const a = (i / mains) * Math.PI * 2 + rand(-0.3, 0.3);
    grow(origin.x + Math.cos(a) * r0 * 0.8, origin.y + Math.sin(a) * r0 * 0.8, a, diag * rand(0.22, 0.38), rand(5, 8), 250 + rand(0, 150), 0);
  }

  const drawLeaf = (ctx: CanvasRenderingContext2D, l: Leaf, k: number) => {
    const s = l.size * easeOutBack(k);
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.angle);
    ctx.fillStyle = `hsl(${l.hue}, 55%, 38%)`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.5, -s * 0.45, s * 1.4, 0);
    ctx.quadraticCurveTo(s * 0.5, s * 0.45, 0, 0);
    ctx.fill();
    ctx.strokeStyle = `hsla(${l.hue}, 60%, 70%, 0.5)`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s * 1.25, 0);
    ctx.stroke();
    ctx.restore();
  };

  const drawFlower = (ctx: CanvasRenderingContext2D, f: Flower, k: number) => {
    const s = f.size * easeOutBack(k);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot + k * 0.6);
    ctx.fillStyle = f.tint;
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(s * 0.55, 0, s * 0.55, s * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#f6c945";
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  return {
    duration: 3800,
    update(ms, dt) {
      // The die pulses with a warm, living glow.
      setGlow(materials, 0x9be36b, (0.2 + 0.2 * Math.sin(ms / 180)) * smooth(ms / 400));
      die.scale.setScalar(1 + 0.05 * Math.sin(ms / 180) * smooth(ms / 400));

      overlay.clear();
      const ctx = overlay.ctx;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, r0 * 3);
      glow.addColorStop(0, `rgba(255, 230, 150, ${0.35 * smooth(ms / 400)})`);
      glow.addColorStop(1, "rgba(255, 230, 150, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, r0 * 3, 0, Math.PI * 2);
      ctx.fill();

      for (const b of branches) {
        const grown = (ms - b.start) * SPEED;
        if (grown <= 0) continue;
        for (const pass of [0, 1]) {
          for (let i = 1; i < b.pts.length; i++) {
            const p0 = b.pts[i - 1], p1 = b.pts[i];
            if (p0.s > grown) break;
            const taper = 1 - (p1.s / b.length) * 0.8;
            ctx.strokeStyle = pass === 0 ? "#4a2f17" : "rgba(160, 112, 66, 0.7)";
            ctx.lineWidth = pass === 0 ? b.width * taper : b.width * taper * 0.35;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
          }
        }
      }
      for (const l of leaves) {
        const k = (ms - l.at) / 280;
        if (k > 0) drawLeaf(ctx, l, k);
      }
      for (const f of flowers) {
        const k = (ms - f.at) / 380;
        if (k > 0) drawFlower(ctx, f, k);
      }
      for (const p of petals) {
        if (ms < p.at) continue;
        p.x += (p.vx + Math.sin(ms / 300 + p.rot) * 30) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.tint;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (ms > 3200) overlay.fadeOut();
    },
    destroy: () => overlay.destroy(),
  };
}

const EFFECTS: Record<DiceMaterialKind, Record<CritKind, (c: EffectCtx) => Effect>> = {
  glass: { nat1: glassShatter, nat20: glassPrism },
  metal: { nat1: metalBreakScreen, nat20: metalForge },
  plastic: { nat1: plasticMelt, nat20: plasticFirework },
  wood: { nat1: woodSplit, nat20: woodBloom },
};

// --------------------------------------------------------------------------

export type CritFxHandle = { cancel: () => void; durationMs: number };

/**
 * Runs the effects on an already-settled DiceBox scene. `dice` indexes into
 * `box.diceList`. `onFumbleHit` fires once, at the moment a nat 1 breaks /
 * shatters / hits (for the impact sound).
 */
export function runCritFx(
  box: Any,
  {
    dice,
    material,
    color = "#2563eb",
  }: { dice: Array<{ index: number; kind: CritKind }>; material: DiceMaterialKind; color?: string },
  { onFumbleHit }: { onFumbleHit?: () => void } = {},
): CritFxHandle {
  let fumbleHeard = false;
  const effects: Effect[] = [];
  for (const { index, kind } of dice) {
    const die = box.diceList[index];
    if (!die) continue;
    const make = EFFECTS[material]?.[kind] ?? EFFECTS.plastic[kind];
    try {
      effects.push(
        make({
          box,
          die,
          color,
          onHit: () => {
            if (kind !== "nat1" || fumbleHeard) return;
            fumbleHeard = true;
            onFumbleHit?.();
          },
        }),
      );
    } catch (err) {
      console.warn("Dice critical effect failed:", err);
    }
  }

  let raf = 0;
  let start = 0;
  let last = 0;
  let failed = false;
  const tick = (now: number) => {
    if (!start) start = last = now;
    const ms = now - start;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!failed) {
      try {
        for (const e of effects) e.update(ms, dt);
      } catch (err) {
        failed = true;
        console.warn("Dice critical effect failed:", err);
      }
    }
    try {
      box.renderer.render(box.scene, box.camera);
    } catch {
      // renderer disposed under us
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    durationMs: effects.reduce((m, e) => Math.max(m, e.duration), 0),
    cancel: () => {
      cancelAnimationFrame(raf);
      for (const e of effects) {
        try {
          e.destroy();
        } catch {
          // ignore
        }
      }
    },
  };
}
