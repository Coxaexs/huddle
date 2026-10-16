/**
 * Real surface detail for the rooms: wood grain, fabric weave, stonework and
 * plaster from CC0 scans (ambientCG, see public/assets/pbr/SOURCES.txt).
 *
 * Each set is three small maps: grey detail (multiplied by the room's own
 * colour, so every theme keeps its palette), a normal map, and ambient
 * occlusion + roughness packed in one. They start loading as soon as this
 * module does; a material is dressed the moment its set has arrived (until
 * then it shows its plain colour, never a black flash).
 */
import * as THREE from "three";
import { apiUrl } from "../lib/client";

export type Surface = "floor" | "wood" | "fabric" | "carpet" | "plaster" | "stone" | "leather" | "grass" | "bark";

interface Set { detail: THREE.Texture; normal: THREE.Texture; packed: THREE.Texture }

const loader = new THREE.TextureLoader();
const sets = new Map<Surface, Promise<Set>>();
const ready = new Map<Surface, Set>();

function load(kind: Surface): Promise<Set> {
  let pending = sets.get(kind);
  if (!pending) {
    const one = (suffix: string, colour: boolean) =>
      loader.loadAsync(apiUrl(`/assets/pbr/${kind}_${suffix}.jpg`)).then((texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.anisotropy = 8;
        return texture;
      });
    pending = Promise.all([one("c", true), one("n", false), one("r", false)]).then(([detail, normal, packed]) => {
      const set = { detail, normal, packed };
      ready.set(kind, set);
      return set;
    });
    // A failed load may work next time the room is built.
    pending.catch(() => sets.delete(kind));
    sets.set(kind, pending);
  }
  return pending;
}

/** Fetch every set early, so the first room is dressed by the time it is seen. */
export function preloadSurfaces() {
  for (const kind of ["floor", "wood", "fabric", "carpet", "plaster", "stone", "leather", "grass", "bark"] as Surface[]) void load(kind).catch(() => undefined);
}

export interface Dress {
  /** Texture repeats across the mesh's UVs (world metres for cushions and other extrusions). */
  repeat?: [number, number];
  /** Multiply the material's colour by the grey detail (off where the material already has a picture). */
  detail?: boolean;
  /** Bumpiness: 1 is the scan's own. */
  bump?: number;
  /** Use the scan's roughness (and its ambient occlusion); off keeps the material's own. */
  rough?: boolean;
}

const clone = (texture: THREE.Texture, repeat: [number, number]) => {
  const copy = texture.clone(); // shares the image: one upload, many repeats
  copy.repeat.set(repeat[0], repeat[1]);
  copy.needsUpdate = true;
  return copy;
};

/**
 * "pixel" swaps the scans for 16x16 block textures drawn here (oak planks,
 * cobblestone, wool, grass, logs), sharp-edged, for the Minecraft rooms. Set
 * before a room is built; materials made after it follow.
 */
export type SurfaceStyle = "real" | "pixel";
let surfaceStyle: SurfaceStyle = "real";
export function setSurfaceStyle(style: SurfaceStyle) {
  surfaceStyle = style;
}

/** Blocks per texture repeat in pixel mode: scans tile every metre or two, blocks are smaller. */
const PIXEL_DENSITY: Partial<Record<Surface, number>> = { floor: 2.6, wood: 1.6, stone: 1.6, carpet: 1.2, fabric: 0.8, leather: 0.8, grass: 2, bark: 1.4 };

function pixelNoise(x: number, y: number, salt: number) {
  const v = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

const pixelMaps = new Map<Surface, THREE.Texture>();

/** A grey 16x16 block face (so the material's colour tints it), sampled without smoothing. */
function pixelMap(kind: Surface): THREE.Texture | null {
  if (kind === "plaster") return null;
  let texture = pixelMaps.get(kind);
  if (texture) return texture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext("2d")!;
  const grey = (v: number) => {
    const c = Math.max(0, Math.min(255, Math.round(v)));
    return `rgb(${c},${c},${c})`;
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = pixelNoise(x, y, kind.length);
      let v = 200 + (n - 0.5) * 40;
      if (kind === "floor" || kind === "wood") {
        // Oak planks: four boards, each with dark seams and staggered ends.
        const row = Math.floor(y / 4);
        const seamX = row % 2 ? 4 : 12;
        if (y % 4 === 3) v = 120;
        else if (x === seamX) v = 135;
        else v = 205 + (pixelNoise(Math.floor(x / 3), y, 3) - 0.5) * 34;
      } else if (kind === "stone") {
        // Cobblestone: irregular light stones in dark mortar.
        const cx = Math.floor((x + (Math.floor(y / 5) % 2) * 3) / 5);
        const cy = Math.floor(y / 5);
        const edge = (x + (Math.floor(y / 5) % 2) * 3) % 5 === 0 || y % 5 === 0;
        v = edge ? 95 + n * 30 : 175 + (pixelNoise(cx, cy, 8) - 0.5) * 60 + (n - 0.5) * 25;
      } else if (kind === "carpet" || kind === "fabric" || kind === "leather") {
        // Wool: soft, low contrast speckle with a faint weave.
        v = 210 + (n - 0.5) * 26 - ((x + y) % 4 === 0 ? 10 : 0);
      } else if (kind === "grass") {
        v = 190 + (n - 0.5) * 70;
      } else if (kind === "bark") {
        // A log's side: vertical dark streaks.
        v = (x % 4 === 0 ? 120 : 185) + (n - 0.5) * 40;
      }
      ctx.fillStyle = grey(v);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  pixelMaps.set(kind, texture);
  return texture;
}

/**
 * Gives `material` a surface. Marks it at once (so materials meant to look
 * different are never merged together) and fills in the maps when they arrive.
 */
export function dress<T extends THREE.MeshStandardMaterial>(material: T, kind: Surface, options: Dress = {}): T {
  const { repeat = [1, 1], detail = true, bump = 1, rough = true } = options;
  if (surfaceStyle === "pixel") {
    material.userData.surface = `pixel|${kind}|${repeat.join("x")}|${detail}`;
    const map = pixelMap(kind);
    const k = PIXEL_DENSITY[kind] ?? 1;
    if (map && detail && !material.map) material.map = clone(map, [repeat[0] * k, repeat[1] * k]);
    material.needsUpdate = true;
    return material;
  }
  material.userData.surface = `${kind}|${repeat.join("x")}|${detail}|${bump}|${rough}`;
  const apply = (set: Set) => {
    if (detail && !material.map) material.map = clone(set.detail, repeat);
    material.normalMap = clone(set.normal, repeat);
    material.normalScale.set(bump, bump);
    if (rough) {
      const packed = clone(set.packed, repeat);
      material.roughnessMap = packed;
      material.aoMap = packed;
      material.aoMapIntensity = 0.7;
    }
    material.needsUpdate = true;
  };
  const have = ready.get(kind);
  if (have) apply(have);
  else void load(kind).then(apply, () => undefined);
  return material;
}

/**
 * Upholstery: a cloth with a sheen, so velvet and wool catch the light at
 * grazing angles the way real fabric does (and plain plastic never would).
 */
export function fabric(colour: string, options: Dress & { sheen?: number; kind?: Surface } = {}) {
  const base = new THREE.Color(colour);
  const material = new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: 0.92,
    sheen: options.sheen ?? 0.8,
    sheenRoughness: 0.55,
    sheenColor: base.clone().lerp(new THREE.Color("#ffffff"), 0.35),
  });
  return dress(material, options.kind ?? "fabric", { repeat: options.repeat ?? [2.2, 2.2], bump: options.bump ?? 0.8, detail: options.detail ?? true, rough: options.rough ?? false });
}

// Not on the server: there is no image loading there, and no room to see.
if (typeof document !== "undefined") preloadSurfaces();
