/**
 * Hand-placed props for the Living Room's corners, loaded as small CC0 models
 * (Kenney's Furniture and Graveyard kits, see public/assets/living-room). The
 * room itself is built in code and shows at once; props pop in as they arrive,
 * and a prop that fails to load is simply missing.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { apiUrl } from "../lib/client";
import type { RoomTheme } from "../hooks/use-living-room";

interface Prop {
  model: string;
  x: number;
  z: number;
  /** Longest side in metres; the model is scaled to fit. */
  size: number;
  /** Turn about the vertical; 0 faces the south wall, -PI/2 faces west (off the east wall). */
  ry?: number;
  /** Height it sits at, for a prop on a table. */
  y?: number;
  /** Lights the model's own colours from within, for screens and tubes. */
  emissive?: string;
  /** A soft halo around it: lamps, flames. */
  glow?: { colour: string; size: number; height: number; opacity?: number };
}

const EAST = -Math.PI / 2;
const WEST = Math.PI / 2;

const COZY: Prop[] = [
  // North-east corner: a reading nook with a radio, books and a bear.
  { model: "sideTable", x: 5.4, z: -2.5, size: 1.0, ry: EAST },
  { model: "radio", x: 5.45, z: -2.7, size: 0.42, y: 0.72, ry: EAST },
  { model: "books", x: 5.4, z: -2.2, size: 0.3, y: 0.72, ry: EAST + 0.25 },
  { model: "lampRoundFloor", x: 5.45, z: -3.5, size: 1.7, ry: EAST, glow: { colour: "#ffcf8a", size: 1.6, height: 1.45, opacity: 0.5 } },
  { model: "pottedPlant", x: 5.4, z: -1.5, size: 1.2 },
  { model: "bear", x: 4.35, z: -2.3, size: 0.5, ry: EAST - 0.3 },
  { model: "pillow", x: 4.1, z: -2.9, size: 0.45, ry: 0.5 },
  // North-west corner: a lamp, a speaker and a pile of books.
  { model: "lampRoundFloor", x: -5.25, z: -3.7, size: 1.7, ry: WEST, glow: { colour: "#ffcf8a", size: 1.6, height: 1.45, opacity: 0.5 } },
  { model: "pottedPlant", x: -5.2, z: -2.5, size: 1.3 },
  { model: "books", x: -4.3, z: -3.3, size: 0.28, ry: 0.4 },
  { model: "books", x: -4.1, z: -3.1, size: 0.25, ry: 1.1 },
  { model: "speaker", x: -3.9, z: -3.9, size: 1.0 },
  { model: "pillow", x: -4.5, z: -2.7, size: 0.45, ry: -0.4 },
  // Beside the hearth.
  { model: "pottedPlant", x: -2.0, z: -3.7, size: 1.0 },
];

const VAMPIRE: Prop[] = [
  // North-east: a coffin to lie back on, a brazier and a headstone.
  { model: "coffin", x: 5.0, z: -2.6, size: 1.9, ry: 0 },
  { model: "candle-multiple", x: 4.1, z: -3.5, size: 0.4, glow: { colour: "#ff6a3a", size: 0.8, height: 0.3, opacity: 0.6 } },
  { model: "fire-basket", x: 4.3, z: -1.6, size: 0.9, glow: { colour: "#ff5a1f", size: 1.5, height: 0.5, opacity: 0.6 } },
  { model: "gravestone-decorative", x: 5.35, z: -1.2, size: 1.0, ry: EAST },
  { model: "lantern-glass", x: 5.2, z: -3.8, size: 0.55, glow: { colour: "#ffb35c", size: 0.9, height: 0.3, opacity: 0.5 } },
  // North-west: a little altar with a chalice between two columns.
  { model: "altar-stone", x: -4.5, z: -3.2, size: 1.3, ry: WEST },
  { model: "detail-chalice", x: -4.5, z: -3.2, size: 0.3, y: 0.38 },
  { model: "fire-basket", x: -5.0, z: -3.9, size: 0.8, glow: { colour: "#ff5a1f", size: 1.4, height: 0.45, opacity: 0.55 } },
  { model: "gravestone-decorative", x: -3.8, z: -2.3, size: 0.9, ry: WEST },
  { model: "candle-multiple", x: -4.0, z: -3.6, size: 0.35, glow: { colour: "#ff6a3a", size: 0.8, height: 0.28, opacity: 0.6 } },
  // The house vampire keeps the hearth company.
  { model: "character-vampire", x: -2.0, z: -3.6, size: 0.75, ry: 0.4 },
  { model: "lantern-glass", x: -2.5, z: -3.3, size: 0.5, glow: { colour: "#ffb35c", size: 0.9, height: 0.28, opacity: 0.5 } },
];

const green = "#00ff66";

const MATRIX: Prop[] = [
  // North-east: a hacker's desk with two screens.
  { model: "desk", x: 5.3, z: -2.5, size: 1.8, ry: EAST },
  { model: "computerScreen", x: 5.45, z: -2.9, size: 0.75, y: 0.88, ry: EAST, emissive: green, glow: { colour: green, size: 1.0, height: 1.2, opacity: 0.35 } },
  { model: "computerScreen", x: 5.45, z: -2.1, size: 0.75, y: 0.88, ry: EAST, emissive: green },
  { model: "computerKeyboard", x: 5.0, z: -2.5, size: 0.5, y: 0.88, ry: EAST },
  { model: "chairDesk", x: 4.4, z: -2.5, size: 0.95, ry: WEST + 0.3 },
  // North-west: a stack of old tubes, speakers and a laptop on the floor.
  { model: "televisionVintage", x: -5.1, z: -3.4, size: 0.75, ry: WEST, emissive: green, glow: { colour: green, size: 0.9, height: 0.4, opacity: 0.18 } },
  { model: "televisionVintage", x: -5.1, z: -3.4, size: 0.6, y: 0.5, ry: WEST - 0.2, emissive: green },
  { model: "speaker", x: -5.3, z: -2.4, size: 1.2 },
  { model: "speaker", x: -4.4, z: -4.0, size: 1.2 },
  { model: "laptop", x: -4.2, z: -2.9, size: 0.5, ry: 0.5, emissive: green, glow: { colour: green, size: 0.8, height: 0.2, opacity: 0.35 } },
  // By the hearth.
  { model: "computerScreen", x: -2.0, z: -3.6, size: 0.55, ry: 0.3, emissive: green },
];

const CYBER = (tint: string): Prop[] => MATRIX.map((prop) => (prop.emissive ? { ...prop, emissive: tint, glow: prop.glow && { ...prop.glow, colour: tint } } : prop));

/** The year-2000 bedroom: a desk chair at the computer, a teddy, a pink floor lamp and a boombox. */
const Y2K: Prop[] = [
  { model: "chairDesk", x: 4.75, z: -3.0, size: 0.95, ry: WEST + 0.4 },
  { model: "lampRoundFloor", x: -5.25, z: -3.7, size: 1.7, ry: WEST, glow: { colour: "#ff9ae6", size: 1.6, height: 1.45, opacity: 0.5 } },
  { model: "bear", x: -4.4, z: -3.3, size: 0.5, ry: 0.5 },
  { model: "pillow", x: -4.6, z: -2.7, size: 0.45, ry: -0.4 },
  { model: "radio", x: -3.9, z: -3.9, size: 0.5, ry: 0.2 },
  { model: "speaker", x: -5.3, z: -2.4, size: 0.9 },
  { model: "pottedPlant", x: -2.0, z: -3.7, size: 1.0 },
];

/** The hideout: a fire in a basket, lanterns, the emergency radio and the last books. */
const ZOMBIE: Prop[] = [
  { model: "fire-basket", x: -4.6, z: -3.6, size: 0.9, glow: { colour: "#ff7a2a", size: 1.5, height: 0.5, opacity: 0.6 } },
  { model: "lantern-glass", x: -5.3, z: -2.6, size: 0.5, glow: { colour: "#ffb35c", size: 0.9, height: 0.3, opacity: 0.5 } },
  { model: "sideTable", x: 5.4, z: -1.6, size: 1.0, ry: EAST },
  { model: "radio", x: 5.45, z: -1.75, size: 0.42, y: 0.72, ry: EAST },
  { model: "books", x: 5.4, z: -1.35, size: 0.3, y: 0.72, ry: EAST + 0.3 },
  { model: "lantern-glass", x: -2.0, z: -3.7, size: 0.45, glow: { colour: "#ffb35c", size: 0.8, height: 0.28, opacity: 0.5 } },
];

const SETS: Record<RoomTheme, Prop[]> = {
  zombie: ZOMBIE,
  // The Minecraft room's corners are built from blocks in the scene itself.
  minecraft: [],
  y2k: Y2K,
  cozy: COZY,
  academia: COZY,
  vampire: VAMPIRE,
  matrix: MATRIX,
  cyberpunk: CYBER("#ff2fb4"),
};

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D | null>>();

function load(model: string): Promise<THREE.Object3D | null> {
  let hit = cache.get(model);
  if (!hit) {
    hit = loader.loadAsync(apiUrl(`/assets/living-room/${model}.glb`)).then((gltf) => gltf.scene, () => null);
    cache.set(model, hit);
  }
  return hit;
}

const CORNER = 4.5;

/** The tabletop room's corners: lamps and plants for the cosy rooms, candles and braziers for the vampire, screens for the rest. */
const TABLETOP_COZY: Prop[] = [
  { model: "lampRoundFloor", x: CORNER, z: -3.6, size: 1.7, ry: EAST, glow: { colour: "#ffcf8a", size: 1.6, height: 1.45, opacity: 0.5 } },
  { model: "pottedPlant", x: CORNER + 0.2, z: -2.6, size: 1.2 },
  { model: "bear", x: -4.2, z: 3.4, size: 0.5, ry: 0.6 },
  { model: "books", x: -4.4, z: 3.0, size: 0.3, ry: 0.3 },
  { model: "sideTable", x: 5.1, z: 1.2, size: 1.0, ry: EAST },
  { model: "radio", x: 5.1, z: 1.2, size: 0.42, y: 0.72, ry: EAST },
];
const TABLETOP_VAMPIRE: Prop[] = [
  { model: "fire-basket", x: CORNER, z: -3.5, size: 0.9, glow: { colour: "#ff5a1f", size: 1.5, height: 0.5, opacity: 0.6 } },
  { model: "candle-multiple", x: 4.6, z: -2.5, size: 0.4, glow: { colour: "#ff6a3a", size: 0.8, height: 0.3, opacity: 0.6 } },
  { model: "gravestone-decorative", x: 5.15, z: 1.5, size: 1.0, ry: EAST },
  { model: "character-vampire", x: -4.4, z: 3.3, size: 0.75, ry: 0.5 },
  { model: "lantern-glass", x: -3.7, z: 3.6, size: 0.5, glow: { colour: "#ffb35c", size: 0.9, height: 0.28, opacity: 0.5 } },
];
const TABLETOP_TECH = (tint: string): Prop[] => [
  { model: "desk", x: 5.0, z: -2.6, size: 1.8, ry: EAST },
  { model: "computerScreen", x: 5.15, z: -2.6, size: 0.75, y: 0.88, ry: EAST, emissive: tint, glow: { colour: tint, size: 1.0, height: 1.2, opacity: 0.25 } },
  { model: "laptop", x: -4.4, z: 3.3, size: 0.5, ry: 0.5, emissive: tint, glow: { colour: tint, size: 0.8, height: 0.2, opacity: 0.25 } },
  { model: "speaker", x: 5.2, z: 1.4, size: 1.2 },
  { model: "televisionVintage", x: -3.8, z: 3.5, size: 0.7, ry: 0.4, emissive: tint },
];
export const TABLETOP_PROPS: Record<RoomTheme, Prop[]> = {
  zombie: TABLETOP_VAMPIRE.filter((prop) => prop.model !== "character-vampire"),
  minecraft: TABLETOP_COZY.filter((prop) => prop.model !== "lampRoundFloor"),
  y2k: TABLETOP_TECH("#4fc3ff"),
  cozy: TABLETOP_COZY,
  academia: TABLETOP_COZY,
  vampire: TABLETOP_VAMPIRE,
  matrix: TABLETOP_TECH(green),
  cyberpunk: TABLETOP_TECH("#ff2fb4"),
};

type Glow = (colour: string, size: number, at: THREE.Vector3, opacity?: number) => THREE.Object3D;

/**
 * Adds the theme's lounge props to `root` as they load. Returns a function that
 * stops any still loading (call it when the room goes away).
 */
export function addProps(root: THREE.Object3D, theme: RoomTheme, addGlow: Glow): () => void {
  return addPropList(root, SETS[theme], addGlow);
}

/** Adds any list of props; see addProps. */
export function addPropList(root: THREE.Object3D, props: Prop[], addGlow: Glow): () => void {
  let cancelled = false;
  for (const prop of props) {
    void load(prop.model).then((template) => {
      if (cancelled || !template) return;
      const model = template.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      const dims = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const scale = prop.size / Math.max(dims.x, dims.y, dims.z, 1e-3);
      model.position.set(-centre.x, -box.min.y, -centre.z);
      model.traverse((part) => {
        const mesh = part as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (!prop.emissive) return;
        // Shared with every other copy of the model, so light a private one.
        mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
        const lit = mesh.material as THREE.MeshStandardMaterial;
        lit.emissive = new THREE.Color(prop.emissive);
        lit.emissiveIntensity = 0.22;
      });
      const holder = new THREE.Group();
      holder.add(model);
      holder.scale.setScalar(scale);
      holder.rotation.y = prop.ry ?? 0;
      holder.position.set(prop.x, prop.y ?? 0, prop.z);
      root.add(holder);
      if (prop.glow) addGlow(prop.glow.colour, prop.glow.size, new THREE.Vector3(prop.x, (prop.y ?? 0) + prop.glow.height, prop.z), prop.glow.opacity);
    });
  }
  return () => { cancelled = true; };
}
