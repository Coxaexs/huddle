/**
 * The tabletop's D&D dressing, driven by what the call shares: a name tent with
 * a portrait at every occupied chair, the game master's folding screen, the
 * marker over whoever's turn it is, and a spell or monster card floating over
 * the table. Everything redraws only when its inputs change.
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
  /** Shown when there is no portrait. */
  letter: string;
  colour: string;
  turn: boolean;
}

interface Tent { mesh: THREE.Mesh; key: string }

const dispose = (object: THREE.Object3D) => {
  object.traverse((part) => {
    const mesh = part as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.MeshBasicMaterial | THREE.SpriteMaterial | undefined;
    material?.map?.dispose();
    material?.dispose();
  });
};

const images = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(url: string): Promise<HTMLImageElement | null> {
  let hit = images.get(url);
  if (!hit) {
    hit = new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
    images.set(url, hit);
  }
  return hit;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length >= maxLines) break;
  }
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines && text.length > lines.join(" ").length + 4) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, "")}…`;
  return lines;
}

/** The card for a tent: portrait in a ring of the player's colour, and a name. */
function drawTent(spec: TentSpec, image: HTMLImageElement | null): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 340;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = spec.turn ? "#3a2a08" : "#1f1a2c";
  ctx.beginPath(); ctx.roundRect(0, 0, 256, 340, 26); ctx.fill();
  ctx.lineWidth = spec.turn ? 10 : 6;
  ctx.strokeStyle = spec.turn ? "#ffd23c" : spec.colour;
  ctx.beginPath(); ctx.roundRect(5, 5, 246, 330, 22); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.arc(128, 124, 88, 0, Math.PI * 2); ctx.clip();
  if (image) ctx.drawImage(image, 40, 36, 176, 176);
  else {
    ctx.fillStyle = spec.colour; ctx.fillRect(0, 0, 256, 340);
    ctx.fillStyle = "#1b1530"; ctx.font = "700 96px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(spec.letter, 128, 134);
  }
  ctx.restore();
  ctx.fillStyle = "#fff4e3";
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const lines = wrap(ctx, spec.name, 216, 2);
  lines.forEach((line, i) => ctx.fillText(line, 128, 262 + i * 34, 220));
  if (spec.turn) { ctx.fillStyle = "#ffd23c"; ctx.font = "700 22px system-ui, sans-serif"; ctx.fillText("▶ YOUR TURN", 128, 326); }
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
    ctx.fillStyle = "#d9b45c"; ctx.fillText(`${fact.label}:`, 36, y);
    ctx.fillStyle = "#fff4e3"; ctx.fillText(fact.value, 36 + ctx.measureText(`${fact.label}: `).width + 6, y, 640 - ctx.measureText(`${fact.label}: `).width);
    y += 34;
  }
  ctx.fillStyle = "#e9e1f5"; ctx.font = "23px system-ui, sans-serif";
  for (const line of wrap(ctx, card.body, 690, Math.max(2, Math.floor((532 - y) / 31)))) { ctx.fillText(line, 36, y + 18); y += 31; }
  ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = "20px system-ui, sans-serif"; ctx.textAlign = "right";
  ctx.fillText(`shown by ${card.by} · click to put away`, 730, 540);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
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
    ctx.fillText("⚔", 128, 82);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
})();

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

  constructor(private readonly root: THREE.Object3D, private readonly surfaceY: number) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
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
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, toneMapped: false }));
        const edge = this.edge(spec.seat, TABLE_RADIUS - 0.3);
        mesh.position.set(edge.x, this.surfaceY + 0.21, edge.z);
        // The face looks in to the table, tipped back like a tent card.
        mesh.rotation.set(-0.15, edge.angle + Math.PI, 0, "YXZ");
        this.root.add(mesh);
        tent = { mesh, key: "" };
        this.tents.set(spec.seat.id, tent);
      }
      tent.key = spec.key;
      const target = tent;
      const paint = (image: HTMLImageElement | null) => {
        if (this.disposed || target.key !== spec.key) return;
        const material = target.mesh.material as THREE.MeshBasicMaterial;
        material.map?.dispose();
        material.map = drawTent(spec, image);
        material.needsUpdate = true;
      };
      paint(null);
      if (spec.portraitUrl) void loadImage(spec.portraitUrl).then(paint);
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
    // The painted side faces the table's far side; the game master reads the back.
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
    const key = card && !expired ? `${card.title}|${card.at}` : "";
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

  update(t: number) {
    const marker = this.marker;
    if (this.markerTarget) {
      marker.visible = true;
      marker.position.set(this.markerTarget.x, this.markerTarget.y + Math.sin(t * 3) * 0.05, this.markerTarget.z);
    } else marker.visible = false;
  }

  dispose() {
    this.disposed = true;
    this.setTents([]);
    this.setScreen(null);
    this.setCard(null, true);
    this.root.remove(this.marker);
    dispose(this.marker);
    this.glow.dispose();
  }
}

/** Where dice thrown "behind the screen" land: just inside the table edge, on the game master's side. */
export function behindScreen(seat: LoungeSeat | null): { x: number; z: number } {
  const dx = seat ? seat.x - TABLE_CENTRE.x : 0;
  const dz = seat ? seat.z - TABLE_CENTRE.z : 1;
  const length = Math.hypot(dx, dz) || 1;
  return { x: TABLE_CENTRE.x + (dx / length) * 1.2, z: TABLE_CENTRE.z + (dz / length) * 1.2 };
}
