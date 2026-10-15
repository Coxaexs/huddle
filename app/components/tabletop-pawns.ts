/**
 * The pawns on the tabletop's map: miniatures people take from the cabinet.
 * Each one hops to where its owner (or the game master) sends it, and the map
 * answers where it lands: a ripple and splash in water, sparks on fire, leaves
 * in the grass, a torch in the dark, and a puff of dust in the map's own
 * colour anywhere else. The glow under its base takes the colour beneath it.
 */
import * as THREE from "three";
import type { TablePawn } from "@/lib/lounge-shared";
import { terrainOf, type Terrain } from "../lib/map-terrain";
import { TABLE_CENTRE } from "../lib/living-room";
import { miniFigure } from "./tabletop-extras";

/** How tall each miniature stands on the table. */
const HEIGHT: Record<TablePawn["kind"], number> = { fighter: 0.2, wizard: 0.2, rogue: 0.2, cleric: 0.2, beast: 0.24, dragon: 0.3 };
/** Its base's radius (miniFigure's base is 0.3 of a hero's height, 0.62 of a big one's). */
const baseOf = (kind: TablePawn["kind"]) => HEIGHT[kind] * (kind === "beast" || kind === "dragon" ? 0.62 : 0.3);

interface Piece {
  key: string;
  owner: string;
  group: THREE.Group;
  figure: THREE.Group;
  glow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  label: THREE.Sprite;
  base: number;
  from: THREE.Vector2;
  to: THREE.Vector2;
  start: number;
  duration: number;
  height: number;
  dropping: boolean;
  landed: boolean;
  facing: number;
  terrain: Terrain;
  nextFx: number;
  phase: number;
}

/** A short-lived effect: it runs `tick` with its age (0..1) until its life is up. */
interface Fx { object: THREE.Object3D; born: number; life: number; tick: (age: number, dt: number) => void }

/** Soft round spot, white in the middle: the glow under a base, and every particle. */
function spotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function nameTag(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = "600 30px system-ui, sans-serif";
  const width = Math.min(400, Math.ceil(ctx.measureText(text).width) + 28);
  canvas.width = width;
  canvas.height = 48;
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillStyle = "rgba(20,14,28,0.8)";
  ctx.beginPath(); ctx.roundRect(0, 0, width, 48, 24); ctx.fill();
  ctx.fillStyle = "#fff4e3";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, 26, width - 18);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(0.045 * (width / 48), 0.045, 1);
  sprite.renderOrder = 20;
  return sprite;
}

const disposeTree = (object: THREE.Object3D, keep: Set<unknown>) => {
  object.traverse((part) => {
    const mesh = part as THREE.Mesh;
    if (mesh.geometry && !keep.has(mesh.geometry)) mesh.geometry.dispose();
    for (const material of [mesh.material ?? []].flat() as THREE.MeshBasicMaterial[]) {
      if (material.map && !keep.has(material.map)) material.map.dispose();
      material.dispose();
    }
  });
};

/** Shortest turn from one heading to another. */
const turnTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export class TablePawns {
  private readonly pieces = new Map<string, Piece>();
  private readonly fx: Fx[] = [];
  private readonly spot = spotTexture();
  private readonly rippleGeometry = new THREE.RingGeometry(0.82, 1, 40);
  private readonly keep: Set<unknown>;
  private source: Record<string, TablePawn> | null = null;
  private heldKey = "";
  private now = 0;

  constructor(
    private readonly root: THREE.Object3D,
    private readonly surfaceY: number,
    private readonly colourAt: ((x: number, z: number) => [number, number, number] | null) | undefined,
    /** A pawn came down somewhere: what it landed in. */
    private readonly onLand?: (id: string, terrain: Terrain) => void,
  ) {
    this.keep = new Set<unknown>([this.spot, this.rippleGeometry]);
  }

  /** The pawn a clicked part belongs to, if any. */
  pawnAt(object: THREE.Object3D | null): string | null {
    for (let o = object; o; o = o.parent) if (typeof o.userData.pawnId === "string") return o.userData.pawnId;
    return null;
  }

  /**
   * The table as the hub has it. `held` is the pawn I am about to move, and
   * `turnOwner` the user whose turn it is: their pawns wear a ring.
   */
  set(pawns: Record<string, TablePawn>, held: string | null, turnOwner: string | null) {
    const heldKey = `${held}|${turnOwner}`;
    if (pawns === this.source && heldKey === this.heldKey) return;
    if (pawns !== this.source) this.sync(pawns);
    this.source = pawns;
    this.heldKey = heldKey;
    for (const [id, piece] of this.pieces) {
      const turn = Boolean(turnOwner && piece.owner === turnOwner);
      piece.ring.visible = id === held || turn;
      piece.ring.material.color.set(id === held ? "#ffffff" : "#ffd23c");
    }
  }

  private sync(pawns: Record<string, TablePawn>) {
    for (const [id, piece] of this.pieces) {
      if (pawns[id]) continue;
      // Back to the cabinet: a last puff where it stood.
      this.dust(piece.group.position.x, piece.group.position.z, new THREE.Color("#d8c8a8"), 10, 0.5);
      this.root.remove(piece.group);
      disposeTree(piece.group, this.keep);
      this.pieces.delete(id);
    }
    for (const pawn of Object.values(pawns)) {
      const key = `${pawn.kind}|${pawn.colour}|${pawn.label}|${pawn.ownerName}`;
      let piece = this.pieces.get(pawn.id);
      if (piece && piece.key !== key) {
        // Repainted or renamed: build it again where it stands.
        this.root.remove(piece.group);
        disposeTree(piece.group, this.keep);
        this.pieces.delete(pawn.id);
        piece = undefined;
      }
      const x = TABLE_CENTRE.x + pawn.x;
      const z = TABLE_CENTRE.z + pawn.z;
      if (!piece) {
        piece = this.build(pawn, key);
        piece.from.set(x, z);
        piece.to.set(x, z);
        piece.facing = pawn.facing;
        piece.start = this.now;
        piece.duration = 0.45;
        piece.dropping = true;
        piece.landed = false;
        piece.group.position.set(x, this.surfaceY + 0.4, z);
        this.pieces.set(pawn.id, piece);
        continue;
      }
      if (Math.abs(piece.to.x - x) < 1e-4 && Math.abs(piece.to.y - z) < 1e-4) continue;
      // A hop from wherever it is now, longer and higher the further it goes.
      piece.from.set(piece.group.position.x, piece.group.position.z);
      piece.to.set(x, z);
      const distance = piece.from.distanceTo(piece.to);
      piece.start = this.now;
      piece.duration = Math.min(0.9, 0.3 + distance * 0.35);
      piece.height = Math.min(0.22, 0.05 + distance * 0.12);
      piece.dropping = false;
      piece.landed = false;
      piece.facing = pawn.facing;
    }
  }

  private build(pawn: TablePawn, key: string): Piece {
    const group = new THREE.Group();
    group.userData.pawnId = pawn.id;
    const base = baseOf(pawn.kind);
    const figure = miniFigure(pawn.kind, pawn.colour, HEIGHT[pawn.kind]);
    const holder = new THREE.Group();
    holder.add(figure);
    group.add(holder);
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(base * 2.1, 28),
      new THREE.MeshBasicMaterial({ map: this.spot, color: "#fff2d0", transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.003;
    glow.renderOrder = 2;
    // Only the miniature itself is clicked; its light on the map is not.
    glow.raycast = () => undefined;
    group.add(glow);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(base * 1.3, base * 1.55, 36),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    ring.visible = false;
    ring.raycast = () => undefined;
    group.add(ring);
    const label = nameTag(pawn.label || pawn.ownerName);
    label.position.y = HEIGHT[pawn.kind] * 1.25 + 0.05;
    group.add(label);
    this.root.add(group);
    return {
      key, owner: pawn.owner, group, figure: holder, glow, ring, label, base,
      from: new THREE.Vector2(), to: new THREE.Vector2(), start: 0, duration: 0.4, height: 0.08,
      dropping: true, landed: false, facing: pawn.facing, terrain: "ground", nextFx: 0, phase: Math.random() * 10,
    };
  }

  /** It came down: read the map under it and let the map answer. */
  private land(id: string, piece: Piece) {
    const { x, z } = piece.group.position;
    const rgb = this.colourAt?.(x, z) ?? null;
    const terrain: Terrain = rgb ? terrainOf(rgb) : "ground";
    piece.terrain = terrain;
    const colour = rgb ? new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace) : new THREE.Color("#d8c8a8");
    // The glow takes the ground's colour, lifted so it reads as light.
    const tint = colour.clone().offsetHSL(0, 0.15, 0.2);
    piece.glow.material.color.copy(terrain === "dark" ? new THREE.Color("#ffb347") : tint);
    piece.glow.material.opacity = terrain === "dark" ? 0.7 : 0.45;
    piece.nextFx = this.now + 0.4;
    switch (terrain) {
      case "water":
        this.ripple(x, z, new THREE.Color("#dff4ff"), piece.base * 1.2, piece.base * 5, 1.1);
        this.ripple(x, z, tint, piece.base, piece.base * 3.4, 0.8);
        this.spray(x, z, new THREE.Color("#cfefff"), 16, 0.7, -2.2, 1.1);
        break;
      case "fire":
        this.ripple(x, z, new THREE.Color("#ffb347"), piece.base, piece.base * 3.5, 0.6);
        this.spray(x, z, new THREE.Color("#ff8a2a"), 22, 0.9, 0.35, 1.2);
        break;
      case "green":
        this.spray(x, z, new THREE.Color("#7ccf5a"), 14, 0.45, -0.25, 1.6);
        this.ripple(x, z, tint, piece.base, piece.base * 3, 0.6);
        break;
      case "dark":
        this.spray(x, z, new THREE.Color("#ffcf7a"), 8, 0.35, 0.2, 0.9);
        break;
      default:
        this.dust(x, z, tint, 14, 0.7);
        this.ripple(x, z, tint, piece.base, piece.base * 3, 0.55);
    }
    this.onLand?.(id, terrain);
  }

  /** A ring on the map spreading out and fading. */
  private ripple(x: number, z: number, colour: THREE.Color, from: number, to: number, life: number) {
    const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(this.rippleGeometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, this.surfaceY + 0.004, z);
    ring.renderOrder = 3;
    this.add(ring, life, (age) => {
      ring.scale.setScalar(from + (to - from) * (1 - (1 - age) ** 2));
      material.opacity = 0.8 * (1 - age);
    });
  }

  /** A low puff of dust round the base. */
  private dust(x: number, z: number, colour: THREE.Color, count: number, life: number) {
    this.spray(x, z, colour, count, 0.3, -0.9, life, 0.25);
  }

  /**
   * Particles thrown out from a point on the map: `up` is how hard they go
   * up, `gravity` pulls them (negative) down or (positive) lifts them.
   */
  private spray(x: number, z: number, colour: THREE.Color, count: number, up: number, gravity: number, life: number, out = 0.35) {
    const positions = new Float32Array(count * 3);
    const velocity = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = out * (0.4 + Math.random() * 0.6);
      positions.set([x, this.surfaceY + 0.01, z], i * 3);
      velocity.set([Math.cos(a) * speed, up * (0.5 + Math.random() * 0.5), Math.sin(a) * speed], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: colour, map: this.spot, size: 0.03, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 4;
    const floor = this.surfaceY + 0.004;
    this.add(points, life, (age, dt) => {
      for (let i = 0; i < count; i++) {
        velocity[i * 3 + 1] += gravity * dt;
        // Air slows them, so a puff hangs for a moment.
        velocity[i * 3] *= 1 - dt * 2.2;
        velocity[i * 3 + 2] *= 1 - dt * 2.2;
        positions[i * 3] += velocity[i * 3] * dt;
        positions[i * 3 + 1] = Math.max(floor, positions[i * 3 + 1] + velocity[i * 3 + 1] * dt);
        positions[i * 3 + 2] += velocity[i * 3 + 2] * dt;
      }
      geometry.attributes.position.needsUpdate = true;
      material.opacity = 0.9 * (1 - age);
    });
  }

  private add(object: THREE.Object3D, life: number, tick: Fx["tick"]) {
    // Never pile up: a busy table drops its oldest effects first.
    while (this.fx.length > 40) this.finish(this.fx.shift()!);
    object.raycast = () => undefined;
    this.root.add(object);
    this.fx.push({ object, born: this.now, life, tick });
  }

  private finish(fx: Fx) {
    this.root.remove(fx.object);
    disposeTree(fx.object, this.keep);
  }

  /** True while anything is moving, so the room keeps drawing at full rate. */
  busy(): boolean {
    return this.fx.length > 0 || [...this.pieces.values()].some((piece) => !piece.landed);
  }

  update(t: number, dt: number) {
    this.now = t;
    for (const [id, piece] of this.pieces) {
      const p = Math.min(1, Math.max(0, (t - piece.start) / piece.duration));
      const ease = p * p * (3 - 2 * p);
      const x = piece.from.x + (piece.to.x - piece.from.x) * ease;
      const z = piece.from.y + (piece.to.y - piece.from.y) * ease;
      const lift = piece.dropping ? 0.4 * (1 - p) ** 2 : 4 * piece.height * p * (1 - p);
      piece.group.position.set(x, this.surfaceY + lift, z);
      // Its light and ring stay on the map while it is in the air.
      piece.glow.position.y = 0.003 - lift;
      piece.ring.position.y = 0.005 - lift;
      // Facing +Z is turned to the pawn's heading (0 north, east positive).
      const want = Math.PI - piece.facing;
      piece.figure.rotation.y += turnTo(piece.figure.rotation.y, want) * Math.min(1, dt * 10);
      if (p >= 1 && !piece.landed) {
        piece.landed = true;
        this.land(id, piece);
      }
      // A small squash as it lands, and settling in water.
      const since = t - (piece.start + piece.duration);
      const squash = piece.landed && since < 0.25 ? 1 - Math.sin((since / 0.25) * Math.PI) * 0.12 : 1;
      piece.figure.scale.set(2 - squash, squash, 2 - squash);
      if (piece.landed && piece.terrain === "water") {
        piece.figure.position.y = -0.012 + Math.sin(t * 2.4 + piece.phase) * 0.004;
        if (t > piece.nextFx) { piece.nextFx = t + 2.2 + Math.random(); this.ripple(x, z, new THREE.Color("#dff4ff"), piece.base * 1.1, piece.base * 3.2, 1.4); }
      } else piece.figure.position.y = 0;
      if (piece.landed && piece.terrain === "fire") {
        piece.glow.material.opacity = 0.45 + Math.sin(t * 17 + piece.phase) * 0.08 + Math.sin(t * 7) * 0.06;
        if (t > piece.nextFx) { piece.nextFx = t + 0.35 + Math.random() * 0.3; this.spray(x, z, new THREE.Color("#ff9a3c"), 3, 0.25, 0.3, 1.1, 0.08); }
      }
      if (piece.landed && piece.terrain === "dark") piece.glow.material.opacity = 0.65 + Math.sin(t * 9 + piece.phase) * 0.06;
      if (piece.ring.visible) {
        const pulse = 1 + Math.sin(t * 5) * 0.08;
        piece.ring.scale.set(pulse, pulse, 1);
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const fx = this.fx[i];
      const age = (t - fx.born) / fx.life;
      if (age >= 1) { this.finish(fx); this.fx.splice(i, 1); continue; }
      fx.tick(Math.max(0, age), dt);
    }
  }

  dispose() {
    for (const piece of this.pieces.values()) { this.root.remove(piece.group); disposeTree(piece.group, this.keep); }
    this.pieces.clear();
    for (const fx of this.fx) this.finish(fx);
    this.fx.length = 0;
    this.spot.dispose();
    this.rippleGeometry.dispose();
  }
}
