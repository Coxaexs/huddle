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
 * Gives `material` a surface. Marks it at once (so materials meant to look
 * different are never merged together) and fills in the maps when they arrive.
 */
export function dress<T extends THREE.MeshStandardMaterial>(material: T, kind: Surface, options: Dress = {}): T {
  const { repeat = [1, 1], detail = true, bump = 1, rough = true } = options;
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
