/**
 * The tabletop's D&D dressing, driven by what the call shares: initiative tokens
 * at every occupied chair, the game master's folding screen, the marker over
 * whoever's turn it is, and a spell or monster card floating over the table.
 * Everything redraws only when its inputs change.
 */
import "../lib/canvas-polyfill";
import * as THREE from "three";
import type { TableCard } from "@/lib/lounge-shared";
import { TABLE_CENTRE, TABLE_RADIUS, type LoungeSeat } from "../lib/living-room";

export interface TentSpec {
  key: string;
  seat: LoungeSeat;
  name: string;
  portraitUrl: string | null;
  letter: string;
  colour: string;
  turn: boolean;
}

interface Tent { mesh: THREE.Group; key: string }

/** Folded name card: two faces leaning on each other, its foot on the table. */
const TENT_W = 0.28;
const TENT_H = 0.175;
const TENT_LEAN = 0.24;

function tentMesh(): THREE.Group {
  const material = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false });
  const geometry = new THREE.PlaneGeometry(TENT_W, TENT_H);
  // Hang each face from the ridge so the lean swings its foot out.
  geometry.translate(0, -TENT_H / 2, 0);
  const group = new THREE.Group();
  const ridge = TENT_H * Math.cos(TENT_LEAN);
  for (const turn of [0, Math.PI]) {
    const side = new THREE.Group();
    side.rotation.y = turn;
    const face = new THREE.Mesh(geometry, material);
    face.rotation.x = -TENT_LEAN;
    face.position.y = ridge;
    side.add(face);
    group.add(side);
  }
  return group;
}

const tentMaterial = (tent: THREE.Group) => ((tent.children[0].children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial);

const dispose = (object: THREE.Object3D) => {
  object.traverse((part) => {
    const mesh = part as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.MeshBasicMaterial | THREE.SpriteMaterial | undefined;
    material?.map?.dispose();
    material?.dispose();
  });
};

function drawTent(spec: TentSpec): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  const bg = spec.turn ? "#3a2a08" : "#1f1a2c";
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0, 0, 256, 160, 20); ctx.fill();
  ctx.lineWidth = spec.turn ? 6 : 4;
  ctx.strokeStyle = spec.turn ? "#ffd23c" : spec.colour;
  ctx.beginPath(); ctx.roundRect(3, 3, 250, 154, 17); ctx.stroke();
  ctx.fillStyle = "#fff4e3";
  ctx.font = "700 48px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const shortName = spec.name.length > 12 ? spec.name.slice(0, 12) + "..." : spec.name;
  ctx.fillText(shortName, 128, 62);
  ctx.font = "700 72px system-ui, sans-serif";
  ctx.fillText(spec.letter.toUpperCase(), 128, 122);
  if (spec.turn) {
    ctx.fillStyle = "#ffd23c";
    ctx.font = "700 24px system-ui, sans-serif";
    ctx.fillText("YOUR TURN", 128, 150);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function drawCard(card: TableCard): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 760;
  canvas.height = 560;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 560);
  g.addColorStop(0, "#2b2140"); g.addColorStop(1, "#171124");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(0, 0, 760, 560, 30); ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = "#d9b45c";
  ctx.beginPath(); ctx.roundRect(6, 6, 748, 548, 26); ctx.stroke();
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffe9a8"; ctx.font = "700 46px Georgia, serif";
  ctx.fillText(card.title, 36, 74, 690);
  ctx.fillStyle = "#c9b8e8"; ctx.font = "italic 26px Georgia, serif";
  ctx.fillText(card.subtitle, 36, 112, 690);
  let y = 156;
  ctx.font = "24px system-ui, sans-serif";
  for (const fact of card.facts.slice(0, 6)) {
    ctx.fillStyle = "#d9b45c"; ctx.fillText(fact.label + ":", 36, y);
    ctx.fillStyle = "#fff4e3"; ctx.fillText(fact.value, 36 + ctx.measureText(fact.label + ": ").width + 6, y, 640 - ctx.measureText(fact.label + ": ").width);
    y += 34;
  }
  ctx.fillStyle = "#e9e1f5"; ctx.font = "23px system-ui, sans-serif";
  for (const line of wrap(ctx, card.body, 690, Math.max(2, Math.floor((532 - y) / 31)))) { ctx.fillText(line, 36, y + 18); y += 31; }
  ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = "20px system-ui, sans-serif"; ctx.textAlign = "right";
  ctx.fillText("shown by " + card.by + " click to put away", 730, 540);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? line + " " + word : word;
      if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length >= maxLines) break;
  }
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines && text.length > lines.join(" ").length + 4) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "...";
  return lines;
}

const screenTexture = (() => {
  let texture: THREE.CanvasTexture | null = null;
  return () => {
    if (texture) return texture;
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 160);
    g.addColorStop(0, "#5a3a24"); g.addColorStop(1, "#33200f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 160);
    ctx.strokeStyle = "#d9b45c"; ctx.lineWidth = 5; ctx.strokeRect(8, 8, 240, 144);
    ctx.fillStyle = "#d9b45c"; ctx.font = "700 74px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("\u2694", 128, 82);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
})();

export interface CharacterTokenSpec {
  id: string;
  seat: LoungeSeat;
  name: string;
  colour: string;
  modelUrl?: string | null;
  type?: "pc" | "npc" | "monster";
  turn?: boolean;
}

export type MiniKind = "fighter" | "wizard" | "rogue" | "cleric" | "beast" | "dragon";

/**
 * A painted miniature `height` tall on its round base, standing on its own
 * origin and facing +Z: the display cabinet's collection, and the monsters
 * that walk onto the map.
 */
export function miniFigure(kind: MiniKind, colour: string, height = 0.15): THREE.Group {
  const paint = (c: string, rough = 0.55, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
  const skin = paint("#e2b48c", 0.7);
  const dark = paint("#2b2420", 0.7);
  const steel = paint("#b9c0c8", 0.3, 0.8);
  const cloth = paint(colour);
  // Built one unit tall, then scaled to `height`.
  const group = new THREE.Group();
  group.scale.setScalar(height);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  const big = kind === "dragon" || kind === "beast";
  const baseR = big ? 0.62 : 0.3;
  add(new THREE.CylinderGeometry(baseR, baseR * 1.06, 0.06, 28), paint("#1d1a18", 0.5), 0, 0.03, 0);
  add(new THREE.TorusGeometry(baseR * 1.02, 0.012, 6, 28), paint(colour, 0.4, 0.2), 0, 0.06, 0, Math.PI / 2);

  if (kind === "dragon") {
    const scale = paint(colour, 0.45, 0.1);
    const belly = paint(new THREE.Color(colour).offsetHSL(0.05, -0.1, 0.18).getStyle(), 0.6);
    add(new THREE.CapsuleGeometry(0.17, 0.38, 6, 12), scale, 0, 0.36, -0.04, Math.PI / 2 - 0.2);
    add(new THREE.SphereGeometry(0.15, 12, 10), belly, 0, 0.3, 0.06).scale.set(1, 0.8, 1.2);
    add(new THREE.CylinderGeometry(0.06, 0.1, 0.42, 10), scale, 0, 0.62, 0.22, 0.55);
    const head = add(new THREE.ConeGeometry(0.09, 0.26, 8), scale, 0, 0.84, 0.38, Math.PI / 2 + 0.25);
    head.scale.set(1, 1, 0.7);
    for (const s of [-1, 1]) {
      add(new THREE.ConeGeometry(0.025, 0.14, 6), paint("#e8dcc0", 0.6), s * 0.05, 0.94, 0.3, -0.7, 0, s * 0.3);
      add(new THREE.SphereGeometry(0.018, 6, 5), new THREE.MeshBasicMaterial({ color: "#ffcc33", toneMapped: false }), s * 0.045, 0.87, 0.44);
      const wing = new THREE.Shape();
      wing.moveTo(0, 0); wing.lineTo(0.62, 0.32); wing.lineTo(0.52, 0.04); wing.lineTo(0.42, 0.12); wing.lineTo(0.32, -0.06); wing.lineTo(0.18, 0.02); wing.lineTo(0, -0.12);
      add(new THREE.ShapeGeometry(wing), new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6, side: THREE.DoubleSide }), s * 0.1, 0.5, -0.02, 0, s > 0 ? 0.25 : Math.PI - 0.25, 0.45);
      add(new THREE.CapsuleGeometry(0.045, 0.16, 4, 8), scale, s * 0.13, 0.16, 0.12);
      add(new THREE.CapsuleGeometry(0.05, 0.14, 4, 8), scale, s * 0.14, 0.15, -0.22);
    }
    add(new THREE.ConeGeometry(0.08, 0.6, 8), scale, 0, 0.2, -0.5, -Math.PI / 2 + 0.25);
    return group;
  }
  if (kind === "beast") {
    // A hunched ogre: heavy shoulders, long arms, a horned head pushed forward.
    const hide = paint(colour, 0.75);
    add(new THREE.SphereGeometry(0.3, 14, 12), hide, 0, 0.62, 0).scale.set(1.15, 1, 0.9);
    add(new THREE.SphereGeometry(0.2, 12, 10), paint("#5a3d2a", 0.8), 0, 0.36, 0.04).scale.set(1.2, 0.8, 1);
    add(new THREE.SphereGeometry(0.15, 12, 10), hide, 0, 0.86, 0.18);
    for (const s of [-1, 1]) {
      add(new THREE.ConeGeometry(0.04, 0.2, 8), paint("#efe4cc", 0.5), s * 0.1, 1.0, 0.16, 0.4, 0, -s * 0.5);
      add(new THREE.SphereGeometry(0.02, 6, 5), new THREE.MeshBasicMaterial({ color: "#ff3a1a", toneMapped: false }), s * 0.055, 0.88, 0.31);
      add(new THREE.CapsuleGeometry(0.075, 0.42, 4, 8), hide, s * 0.36, 0.48, 0.08, 0.25, 0, s * 0.18);
      add(new THREE.CapsuleGeometry(0.08, 0.2, 4, 8), hide, s * 0.15, 0.18, 0);
    }
    add(new THREE.CylinderGeometry(0.035, 0.06, 0.55, 8), paint("#6b4a2b", 0.8), 0.42, 0.36, 0.3, 0.9, 0, 0);
    return group;
  }
  // Heroes: legs, a body, arms, a head, and what marks out their class.
  const robe = kind === "wizard" || kind === "cleric";
  if (robe) add(new THREE.ConeGeometry(0.2, 0.62, 14), cloth, 0, 0.37, 0);
  else for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.055, 0.22, 4, 8), kind === "rogue" ? dark : paint("#4a3a2c", 0.7), s * 0.07, 0.22, 0);
  add(new THREE.CapsuleGeometry(0.11, 0.2, 4, 10), robe ? cloth : kind === "fighter" ? steel : cloth, 0, 0.6, 0);
  for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), robe || kind === "rogue" ? cloth : steel, s * 0.15, 0.58, 0.04, 0.3, 0, s * 0.15);
  add(new THREE.SphereGeometry(0.09, 12, 10), skin, 0, 0.86, 0);
  if (kind === "fighter") {
    add(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 0.87, 0);
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 18), cloth, -0.2, 0.56, 0.08, Math.PI / 2, 0, 0.25);
    add(new THREE.BoxGeometry(0.03, 0.46, 0.012), steel, 0.2, 0.62, 0.12, 0.35);
    add(new THREE.BoxGeometry(0.12, 0.025, 0.03), paint("#a8823a", 0.4, 0.6), 0.2, 0.42, 0.06, 0.35);
  } else if (kind === "wizard") {
    add(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16), cloth, 0, 0.93, 0);
    add(new THREE.ConeGeometry(0.1, 0.3, 12), cloth, 0, 1.08, -0.02, -0.15);
    add(new THREE.CylinderGeometry(0.014, 0.014, 0.95, 6), paint("#6b4a2b", 0.8), 0.2, 0.5, 0.08);
    add(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: "#8fd8ff", toneMapped: false }), 0.2, 1.0, 0.08);
  } else if (kind === "rogue") {
    add(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth, 0, 0.87, -0.01, -0.2);
    add(new THREE.ConeGeometry(0.17, 0.5, 12, 1, true), new THREE.MeshStandardMaterial({ color: colour, roughness: 0.7, side: THREE.DoubleSide }), 0, 0.5, -0.04);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.18, 0.01), steel, s * 0.2, 0.46, 0.1, 0.5);
  } else {
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 6), paint("#6b4a2b", 0.8), 0.19, 0.55, 0.1, 0.4);
    add(new THREE.DodecahedronGeometry(0.05), paint("#d9b45c", 0.35, 0.7), 0.19, 0.72, 0.17);
    add(new THREE.TorusGeometry(0.1, 0.012, 6, 16), new THREE.MeshBasicMaterial({ color: "#ffe9a8", toneMapped: false }), 0, 1.0, -0.02, Math.PI / 2 - 0.2);
  }
  return group;
}

function createCharacterToken(spec: CharacterTokenSpec, surfaceY: number): THREE.Group {
  const group = new THREE.Group();
  const isPC = spec.type === "pc";
  const scale = isPC ? 1.0 : 0.85;

  const baseGeom = new THREE.RingGeometry(0.14, 0.17, 24);
  const baseMat = new THREE.MeshBasicMaterial({
    color: spec.colour,
    transparent: true,
    opacity: isPC ? 0.9 : 0.7,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const base = new THREE.Mesh(baseGeom, baseMat);
  base.rotation.x = -Math.PI / 2;
  base.position.y = surfaceY + 0.01;
  group.add(base);

  const body = new THREE.Group();
  if (spec.type === "monster") {
    body.add(miniFigure("beast", spec.colour, 0.3));
  } else {
    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.12, 4, 8), new THREE.MeshStandardMaterial({ color: "#3a2a1a", roughness: 0.8 }));
    legs.position.y = 0.1;
    body.add(legs);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.14, 4, 8), new THREE.MeshStandardMaterial({ color: spec.colour, roughness: 0.5 }));
    torso.position.y = 0.24;
    body.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshStandardMaterial({ color: "#e8c9a0", roughness: 0.7 }));
    head.position.y = 0.37;
    body.add(head);
  }
  body.scale.setScalar(scale);
  body.position.y = surfaceY + 0.02;
  group.add(body);

  const labelCanvas = document.createElement("canvas");
  const lctx = labelCanvas.getContext("2d")!;
  lctx.font = "600 32px system-ui, sans-serif";
  const labelWidth = Math.min(512, Math.ceil(lctx.measureText(spec.name).width) + 32);
  labelCanvas.width = labelWidth;
  labelCanvas.height = 56;
  lctx.font = "600 32px system-ui, sans-serif";
  lctx.fillStyle = "rgba(20,14,28,0.85)";
  lctx.beginPath(); lctx.roundRect(0, 0, labelWidth, 56, 28); lctx.fill();
  lctx.fillStyle = "#fff4e3";
  lctx.textAlign = "center"; lctx.textBaseline = "middle";
  lctx.fillText(spec.name, labelWidth / 2, 30, labelWidth - 20);
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: false }));
  const aspect = labelWidth / 56;
  labelSprite.scale.set(0.08 * aspect, 0.08, 1);
  labelSprite.position.set(0, surfaceY + (isPC ? 0.75 : 0.9), 0);
  labelSprite.renderOrder = 20;
  group.add(labelSprite);

  const turnCanvas = document.createElement("canvas");
  turnCanvas.width = turnCanvas.height = 64;
  const tctx = turnCanvas.getContext("2d")!;
  // Opaque grey on black (additive), not alpha: WebKit's gradient dither turns into coloured speckle otherwise.
  tctx.fillStyle = "#000"; tctx.fillRect(0, 0, 64, 64);
  const g = tctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgb(255,255,255)"); g.addColorStop(1, "rgb(0,0,0)");
  tctx.fillStyle = g; tctx.fillRect(0, 0, 64, 64);
  const turnTexture = new THREE.CanvasTexture(turnCanvas);
  const turnSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: turnTexture, color: "#ffd23c", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  turnSprite.scale.setScalar(0.6);
  turnSprite.position.set(0, surfaceY + 0.55, 0);
  turnSprite.renderOrder = 21;
  group.add(turnSprite);
  group.userData.turnSprite = turnSprite;

  if (spec.type !== "pc") {
    const hpCanvas = document.createElement("canvas");
    hpCanvas.width = 128; hpCanvas.height = 16;
    const hpctx = hpCanvas.getContext("2d")!;
    hpctx.fillStyle = "rgba(20,14,28,0.7)"; hpctx.fillRect(0, 0, 128, 16);
    const hpTexture = new THREE.CanvasTexture(hpCanvas);
    hpTexture.colorSpace = THREE.SRGBColorSpace;
    const hpSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTexture, transparent: true, depthTest: false }));
    hpSprite.scale.set(0.25, 0.05, 1);
    hpSprite.position.set(0, surfaceY + 0.45, 0);
    hpSprite.renderOrder = 22;
    group.add(hpSprite);
    group.userData.hpSprite = hpSprite;
  }

  group.userData.spec = spec;
  return group;
}

export class TableExtras {
  private tents = new Map<string, Tent>();
  private screen: THREE.Group | null = null;
  private screenSeat: string | null = null;
  private card: THREE.Sprite | null = null;
  private cardKey = "";
  private readonly marker = new THREE.Group();
  private markerTarget: THREE.Vector3 | null = null;
  private readonly glow: THREE.CanvasTexture;
  private disposed = false;
  private characterTokens = new Map<string, THREE.Group>();

  constructor(private readonly root: THREE.Object3D, private readonly surfaceY: number) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgb(255,255,255)"); g.addColorStop(1, "rgb(0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    this.glow = new THREE.CanvasTexture(canvas);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 4), new THREE.MeshBasicMaterial({ color: "#ffd23c", toneMapped: false }));
    arrow.rotation.x = Math.PI;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: "#ffd23c", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
    halo.scale.setScalar(0.7);
    halo.position.y = -0.05;
    this.marker.add(arrow, halo);
    this.marker.visible = false;
    this.marker.renderOrder = 12;
    root.add(this.marker);
  }

  /** The point on the table edge for a seat, and which way it looks back at the seat. */
  private edge(seat: LoungeSeat, radius: number) {
    const dx = seat.x - TABLE_CENTRE.x;
    const dz = seat.z - TABLE_CENTRE.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: TABLE_CENTRE.x + (dx / length) * radius, z: TABLE_CENTRE.z + (dz / length) * radius, angle: Math.atan2(dx, dz) };
  }

  /** A name tent with a portrait at each listed chair; those no longer listed are taken away. */
  setTents(specs: TentSpec[]) {
    const keep = new Set(specs.map((spec) => spec.seat.id));
    for (const [id, tent] of this.tents) {
      if (keep.has(id)) continue;
      this.root.remove(tent.mesh);
      dispose(tent.mesh);
      this.tents.delete(id);
    }
    for (const spec of specs) {
      const existing = this.tents.get(spec.seat.id);
      if (existing?.key === spec.key) continue;
      let tent = existing;
      if (!tent) {
        // Standing just inside the rail, the name to the table and the back to its owner.
        const mesh = tentMesh();
        const edge = this.edge(spec.seat, TABLE_RADIUS - 0.3);
        mesh.position.set(edge.x, this.surfaceY, edge.z);
        mesh.rotation.y = edge.angle + Math.PI;
        this.root.add(mesh);
        tent = { mesh, key: "" };
        this.tents.set(spec.seat.id, tent);
      }
      tent.key = spec.key;
      const target = tent;
      const paint = () => {
        if (this.disposed || target.key !== spec.key) return;
        const material = tentMaterial(target.mesh);
        material.map?.dispose();
        material.map = drawTent(spec);
        material.needsUpdate = true;
      };
      paint();
    }
  }

  /** The game master's folding screen, standing between their chair and the map (null: none). */
  setScreen(seat: LoungeSeat | null) {
    if ((seat?.id ?? null) === this.screenSeat) return;
    if (this.screen) { this.root.remove(this.screen); dispose(this.screen); this.screen = null; }
    this.screenSeat = seat?.id ?? null;
    if (!seat) return;
    const edge = this.edge(seat, 1.0);
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false });
    const back = new THREE.MeshStandardMaterial({ color: "#2a1a0e", roughness: 0.8 });
    for (const [offset, turn] of [[-0.38, 0.5], [0, 0], [0.38, -0.5]] as const) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.03), [back, back, back, back, material, back]);
      panel.position.set(offset * Math.cos(turn * 0.5), 0.25, -Math.abs(offset) * 0.35 * (turn ? 1 : 0));
      panel.rotation.y = turn;
      panel.castShadow = true;
      group.add(panel);
    }
    group.position.set(edge.x, this.surfaceY, edge.z);
    group.rotation.y = edge.angle + Math.PI;
    this.root.add(group);
    this.screen = group;
  }

  /** Where the turn marker floats (null: hidden). */
  setTurn(at: { x: number; y: number; z: number } | null) {
    this.markerTarget = at ? new THREE.Vector3(at.x, at.y, at.z) : null;
  }

  /** The card floating over the table; `expired` takes it down by itself. */
  setCard(card: TableCard | null, expired: boolean) {
    const key = card && !expired ? card.title + "|" + card.at : "";
    if (key === this.cardKey) return;
    this.cardKey = key;
    if (this.card) { this.root.remove(this.card); dispose(this.card); this.card = null; }
    if (!card || expired) return;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: drawCard(card), transparent: true, depthTest: false }));
    sprite.scale.set(1.15, 1.15 * 560 / 760, 1);
    sprite.position.set(TABLE_CENTRE.x, this.surfaceY + 1.0, TABLE_CENTRE.z);
    sprite.renderOrder = 30;
    sprite.userData.card = true;
    this.root.add(sprite);
    this.card = sprite;
  }

  setCharacterTokens(specs: CharacterTokenSpec[]) {
    const keep = new Set(specs.map((s) => s.id));
    for (const [id, token] of this.characterTokens) {
      if (keep.has(id)) continue;
      this.root.remove(token);
      dispose(token);
      this.characterTokens.delete(id);
    }
    for (const spec of specs) {
      let token = this.characterTokens.get(spec.id);
      if (!token) {
        token = createCharacterToken(spec, this.surfaceY);
        this.root.add(token);
        this.characterTokens.set(spec.id, token);
      }
      const edge = this.edge(spec.seat, TABLE_RADIUS - 0.45);
      token.position.set(edge.x, 0, edge.z);
      const turnSprite = token.userData.turnSprite as THREE.Sprite | undefined;
      if (turnSprite) turnSprite.material.opacity = spec.turn ? 1 : 0;
    }
  }

  clearCharacterTokens() {
    for (const token of this.characterTokens.values()) {
      this.root.remove(token);
      dispose(token);
    }
    this.characterTokens.clear();
  }

  update(t: number) {
    const marker = this.marker;
    if (this.markerTarget) {
      marker.visible = true;
      marker.position.set(this.markerTarget.x, this.markerTarget.y + Math.sin(t * 3) * 0.05, this.markerTarget.z);
    } else marker.visible = false;

    for (const token of this.characterTokens.values()) {
      const turnSprite = token.userData.turnSprite as THREE.Sprite | undefined;
      if (turnSprite && turnSprite.material.opacity > 0) {
        turnSprite.scale.setScalar(0.6 + Math.sin(t * 4) * 0.1);
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.setTents([]);
    this.setScreen(null);
    this.setCard(null, true);
    this.clearCharacterTokens();
    this.root.remove(this.marker);
    dispose(this.marker);
    this.glow.dispose();
  }
}

/** Where dice thrown "behind the screen" land: just inside the table edge, on the game master's side. */
export function behindScreen(seat: LoungeSeat | null) {
  const dx = seat ? seat.x - TABLE_CENTRE.x : 0;
  const dz = seat ? seat.z - TABLE_CENTRE.z : 1;
  const length = Math.hypot(dx, dz) || 1;
  const out = { x: dx / length, z: dz / length };
  // A strip between the screen (at 1.0) and the rail: spread along it, never out in front.
  return {
    at: { x: TABLE_CENTRE.x + out.x * 1.23, z: TABLE_CENTRE.z + out.z * 1.23 },
    radius: 0.45,
    spacing: 0.2,
    squash: { ...out, by: 0.16 },
  };
}