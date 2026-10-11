/**
 * Dice thrown onto the tabletop. The server has already decided every face (see
 * DiceRollEvent), so this is a replay: each die is thrown from the roller's
 * seat on a seeded arc, bounces, tumbles and comes to rest showing exactly its
 * value, the same on every screen. No physics engine: the throw is a short
 * script, and the last stretch turns the tumble into the face that was rolled.
 */
import "../lib/canvas-polyfill";
import * as THREE from "three";
import type { DiceRollEvent } from "@/lib/protocol";
import { basePath } from "../lib/client";
import { DIE_TYPES, faceNormal } from "../lib/dice-normals";
import normalsData from "@/public/assets/themes/default/default.json";

/** How many dice are drawn for one roll; the total still counts them all. */
const MAX_DICE = 24;
const GRAVITY = 9.8;
const AIR_TIME = 0.5;
const SETTLE_AT = 1.5;
/** How long dice stay on the table, then fade. */
const LINGER_MS = 12_000;

/** A die's real size is a few centimetres; on screen it needs to be seen from across the room. */
const SIZE: Record<string, number> = { d4: 0.15, d6: 0.15, d8: 0.16, d10: 0.17, d12: 0.17, d20: 0.19, d100: 0.17 };

interface MeshData { name: string; positions: number[]; normals: number[]; uvs: number[]; indices: number[] }
const MODELS = new Map<string, MeshData>((normalsData as unknown as { meshes: MeshData[] }).meshes.map((m) => [m.name, m]));

const geometryCache = new Map<string, THREE.BufferGeometry>();
/**
 * The die model, scaled to `size` metres across. It is used as it comes: its
 * numerals are drawn mirrored in the atlas on purpose (the source engine is
 * left-handed), and read the right way round in three's right-handed space.
 */
function dieGeometry(type: string): THREE.BufferGeometry {
  const hit = geometryCache.get(type);
  if (hit) return hit;
  const data = MODELS.get(type) ?? MODELS.get("d6")!;
  const positions = new Float32Array(data.positions);
  const normals = new Float32Array(data.normals);
  const indices = new Uint32Array(data.indices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(data.uvs), 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const longest = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  const scale = (SIZE[type] ?? 0.16) / longest;
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometryCache.set(type, geometry);
  return geometry;
}

let atlas: HTMLImageElement | null = null;
let atlasLoading: Promise<HTMLImageElement | null> | null = null;
function loadAtlas(): Promise<HTMLImageElement | null> {
  if (atlas) return Promise.resolve(atlas);
  atlasLoading ??= new Promise((resolve) => {
    const image = new Image();
    image.onload = () => { atlas = image; resolve(image); };
    image.onerror = () => resolve(null);
    image.src = `${basePath}/assets/themes/default/diffuse-dark.png`;
  });
  return atlasLoading;
}

const luminance = (colour: THREE.Color) => 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;

const textureCache = new Map<string, THREE.CanvasTexture>();
/** The numbers atlas painted onto the die's colour. */
function dieTexture(colour: string, image: HTMLImageElement): THREE.CanvasTexture {
  const hit = textureCache.get(colour);
  if (hit) return hit;
  const tint = new THREE.Color(colour);
  const ink = luminance(tint) > 0.55 ? "#1a1420" : "#ffffff";
  const size = 1024;
  const numbers = document.createElement("canvas");
  numbers.width = numbers.height = size;
  const n = numbers.getContext("2d")!;
  n.drawImage(image, 0, 0, size, size);
  n.globalCompositeOperation = "source-in";
  n.fillStyle = ink;
  n.fillRect(0, 0, size, size);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d")!;
  c.fillStyle = colour;
  c.fillRect(0, 0, size, size);
  c.drawImage(numbers, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(colour, texture);
  return texture;
}

/** Plastic, metal, wood and glass: the same four the overlay knows. */
function dieMaterial(material: DiceRollEvent["material"], map: THREE.Texture | null, colour: string, dropped: boolean) {
  const base = new THREE.Color(colour);
  const look = {
    plastic: { roughness: 0.35, metalness: 0 },
    metal: { roughness: 0.28, metalness: 0.85 },
    wood: { roughness: 0.75, metalness: 0 },
    glass: { roughness: 0.1, metalness: 0.1 },
  }[material ?? "plastic"];
  return new THREE.MeshStandardMaterial({
    ...look,
    map,
    // Lit a little from within, so a die reads in a dim room.
    emissive: map ? "#ffffff" : base,
    emissiveMap: map,
    emissiveIntensity: 0.3,
    color: map ? "#ffffff" : base,
    ...(material === "glass" ? { transparent: true, opacity: 0.82 } : {}),
    ...(dropped ? { color: "#777777" } : {}),
  });
}

/** A repeatable random from a string, so every screen throws the same roll the same way. */
function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

interface Throw {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  land: THREE.Vector3;
  rest: THREE.Vector3;
  spin: THREE.Vector3;
  start: THREE.Quaternion;
  final: THREE.Quaternion;
  delay: number;
}

interface Set {
  at: number;
  group: THREE.Group;
  throws: Throw[];
  label: THREE.Sprite | null;
  fx: THREE.Sprite[];
  roll: DiceRollEvent;
  announced: boolean;
  settledFor: number;
}

export interface TableDiceOptions {
  /** Height of the tabletop surface. */
  surfaceY: number;
  centre: { x: number; z: number };
  /** Dice land within this distance of the centre. */
  radius: number;
  /** Plays when a set has settled: critical sounds and the like. */
  onSettled?: (roll: DiceRollEvent, crit: "nat20" | "nat1" | null) => void;
}

function labelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = "700 44px system-ui, sans-serif";
  const width = Math.min(900, Math.ceil(ctx.measureText(text).width) + 56);
  canvas.width = width;
  canvas.height = 84;
  ctx.font = "700 44px system-ui, sans-serif";
  ctx.fillStyle = "rgba(20,14,28,0.82)";
  ctx.beginPath(); ctx.roundRect(0, 0, width, 84, 40); ctx.fill();
  ctx.fillStyle = "#fff4e3";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, 44, width - 36);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

const UP = new THREE.Vector3(0, 1, 0);

export class TableDice {
  private sets: Set[] = [];
  private readonly glow = glowTexture();
  private disposed = false;

  constructor(private readonly root: THREE.Object3D, private readonly opts: TableDiceOptions) {}

  /** True while any throw is on the table, so the room can draw at full rate. */
  busy(): boolean {
    return this.sets.length > 0;
  }

  /**
   * Throws a roll's dice onto the table from `from` (a point in the room, about
   * chest height). `at` and `radius` pick where they land (the game master's
   * screen), `label` replaces the result caption (null: none), `spacing` packs
   * them closer.
   */
  async roll(roll: DiceRollEvent, from: THREE.Vector3, opts: { at?: { x: number; z: number }; radius?: number; spacing?: number; label?: string | null } = {}) {
    const image = await loadAtlas();
    if (this.disposed) return;
    const { surfaceY } = this.opts;
    const centre = opts.at ?? this.opts.centre;
    const radius = opts.radius ?? this.opts.radius;
    const random = seededRandom(roll.animationSeed || roll.expression);
    // The previous throw is cleared off the table by the new one.
    for (const old of this.sets) old.at = Math.min(old.at, performance.now() - LINGER_MS + 600);
    const group = new THREE.Group();
    this.root.add(group);

    const colour = roll.themeColor || "#2563eb";
    const faces = roll.dice.flatMap((term) => term.rolls.map((entry) => ({ sides: term.sides, value: entry.value, kept: entry.kept !== false })));
    const shown = faces.slice(0, MAX_DICE);
    const throws: Throw[] = [];
    const spacing = opts.spacing ?? 0.27;
    shown.forEach((face, i) => {
      const type = DIE_TYPES.find((t) => Number(t.slice(1)) >= face.sides) ?? "d20";
      const geometry = dieGeometry(type);
      const map = image ? dieTexture(colour, image) : null;
      const mesh = new THREE.Mesh(geometry, dieMaterial(roll.material, map, colour, !face.kept));
      mesh.castShadow = true;
      group.add(mesh);

      // Landing spots spiral out from the middle so dice never land on each other.
      const angle = i * 2.4 + random() * 0.6;
      const reach = Math.min(radius, i === 0 ? 0.1 : spacing * Math.sqrt(i) * 1.05);
      const land = new THREE.Vector3(centre.x + Math.cos(angle) * reach, surfaceY, centre.z + Math.sin(angle) * reach);
      // A little roll-out beyond where it first touches.
      const away = new THREE.Vector3(land.x - from.x, 0, land.z - from.z).normalize();
      const touch = land.clone().addScaledVector(away, -0.18 - random() * 0.12);
      const final = this.restingOrientation(type, face.value, random);
      const lowest = this.lowestPoint(geometry, final);
      const rest = new THREE.Vector3(land.x, surfaceY - lowest, land.z);
      throws.push({
        mesh,
        from: from.clone().add(new THREE.Vector3((random() - 0.5) * 0.2, 0, (random() - 0.5) * 0.2)),
        land: touch,
        rest,
        spin: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize().multiplyScalar(14 + random() * 10),
        start: new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 6.28, random() * 6.28, random() * 6.28)),
        final,
        delay: i * 0.05,
      });
      mesh.visible = false;
    });

    let label: THREE.Sprite | null = null;
    if (opts.label !== null) {
      label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(opts.label ?? `${roll.roller.displayName} · ${roll.expression} = ${roll.total}`), transparent: true, depthTest: false, opacity: 0 }));
      const aspect = (label.material.map!.image as HTMLCanvasElement).width / 84;
      label.scale.set(0.2 * aspect, 0.2, 1);
      label.renderOrder = 20;
      label.position.set(centre.x, surfaceY + 0.62, centre.z);
      group.add(label);
    }
    this.sets.push({ at: performance.now(), group, throws, label, fx: [], roll, announced: false, settledFor: 0 });
  }

  /** The turn that leaves `value` facing up (a d4's value face goes down), at a random heading. */
  private restingOrientation(type: string, value: number, random: () => number): THREE.Quaternion {
    const normal = faceNormal(type, value);
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, random() * Math.PI * 2);
    if (!normal) return yaw;
    const n = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
    const to = type === "d4" ? UP.clone().negate() : UP;
    return yaw.multiply(new THREE.Quaternion().setFromUnitVectors(n, to));
  }

  private lowestPoint(geometry: THREE.BufferGeometry, quaternion: THREE.Quaternion): number {
    const position = geometry.getAttribute("position");
    const v = new THREE.Vector3();
    let low = Infinity;
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyQuaternion(quaternion);
      if (v.y < low) low = v.y;
    }
    return low;
  }

  update() {
    const now = performance.now();
    const keep: Set[] = [];
    for (const set of this.sets) {
      const age = (now - set.at) / 1000;
      const fade = Math.max(0, Math.min(1, (LINGER_MS / 1000 - age) / 0.6));
      let allSettled = true;
      for (const t of set.throws) {
        const a = age - t.delay;
        if (a < 0) { allSettled = false; continue; }
        t.mesh.visible = true;
        this.pose(t, a);
        if (a < SETTLE_AT) allSettled = false;
        t.mesh.scale.setScalar(fade < 1 ? Math.max(0.001, fade) : 1);
      }
      if (set.label) {
        const settledAge = age - SETTLE_AT - 0.3;
        (set.label.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, settledAge * 3)) * fade;
        set.label.position.y = this.opts.surfaceY + 0.55 + Math.min(0.12, Math.max(0, settledAge) * 0.2);
      }
      if (allSettled && !set.announced) {
        set.announced = true;
        const kept = set.roll.dice.filter((term) => term.sides === 20).flatMap((term) => term.rolls.filter((r) => r.kept));
        const crit = kept.some((r) => r.value === 20) ? "nat20" : kept.some((r) => r.value === 1) ? "nat1" : null;
        if (crit) this.burst(set, crit);
        this.opts.onSettled?.(set.roll, crit);
      }
      this.animateFx(set, age);
      if (age * 1000 > LINGER_MS) this.dispose1(set);
      else keep.push(set);
    }
    this.sets = keep;
  }

  /** Where one die is `a` seconds into its throw. */
  private pose(t: Throw, a: number) {
    const mesh = t.mesh;
    if (a >= SETTLE_AT) {
      mesh.position.copy(t.rest);
      mesh.quaternion.copy(t.final);
      return;
    }
    // Flight to the first touch, then two smaller hops while rolling out to rest.
    const u = Math.min(1, a / AIR_TIME);
    const flight = t.from.clone().lerp(t.land, u);
    const arc = (1 - (2 * u - 1) ** 2);
    const peak = Math.max(0.3, (t.from.y - t.land.y) * 0.5 + 0.35);
    flight.y = t.from.y + (t.land.y - t.from.y) * u + peak * arc * (1 - u * 0.2);
    if (a < AIR_TIME) {
      mesh.position.copy(flight);
    } else {
      const s = (a - AIR_TIME) / (SETTLE_AT - AIR_TIME);
      const ease = 1 - (1 - s) ** 2;
      mesh.position.lerpVectors(t.land, t.rest, ease);
      // Two decaying hops.
      const hop1 = Math.abs(Math.sin(s * Math.PI * 2.0)) * 0.1 * (1 - s) ** 1.5;
      mesh.position.y = Math.max(t.rest.y, t.rest.y + hop1);
    }
    // Tumble, slowing as it settles; the last stretch turns into the rolled face.
    const spin = Math.exp(-a * 1.8);
    const tumble = new THREE.Quaternion().setFromAxisAngle(t.spin.clone().normalize(), t.spin.length() * (1 - spin) / 1.8);
    const current = t.start.clone().premultiply(tumble);
    const blend = Math.max(0, Math.min(1, (a - AIR_TIME * 0.9) / (SETTLE_AT - AIR_TIME * 0.9)));
    mesh.quaternion.copy(current.slerp(t.final, blend * blend * (3 - 2 * blend)));
  }

  /** A natural 20 throws sparks and a halo; a 1 a dull red flash. */
  private burst(set: Set, crit: "nat20" | "nat1") {
    const colour = crit === "nat20" ? "#ffd23c" : "#ff2a2a";
    const { centre, surfaceY } = this.opts;
    for (let i = 0; i < (crit === "nat20" ? 14 : 6); i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: colour, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
      const a = (i / 14) * Math.PI * 2;
      sprite.position.set(centre.x, surfaceY + 0.1, centre.z);
      sprite.userData = { a, fast: 0.6 + (i % 3) * 0.25, born: performance.now() };
      sprite.scale.setScalar(crit === "nat20" ? 0.12 : 0.2);
      set.group.add(sprite);
      set.fx.push(sprite);
    }
  }

  private animateFx(set: Set, _age: number) {
    const now = performance.now();
    set.fx = set.fx.filter((sprite) => {
      const life = (now - (sprite.userData.born as number)) / 1000;
      if (life > 1.4) { set.group.remove(sprite); sprite.material.dispose(); return false; }
      const { a, fast } = sprite.userData as { a: number; fast: number };
      const r = life * fast * 0.9;
      sprite.position.set(this.opts.centre.x + Math.cos(a) * r, this.opts.surfaceY + 0.1 + life * 0.5 - life * life * 0.3, this.opts.centre.z + Math.sin(a) * r);
      sprite.material.opacity = Math.max(0, 0.9 - life * 0.65);
      return true;
    });
  }

  private dispose1(set: Set) {
    for (const t of set.throws) (t.mesh.material as THREE.Material).dispose();
    set.label?.material.map?.dispose();
    set.label?.material.dispose();
    for (const sprite of set.fx) sprite.material.dispose();
    this.root.remove(set.group);
  }

  dispose() {
    this.disposed = true;
    for (const set of this.sets) this.dispose1(set);
    this.sets = [];
    this.glow.dispose();
  }
}
