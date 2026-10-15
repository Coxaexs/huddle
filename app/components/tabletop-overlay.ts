/**
 * What is drawn on the tabletop's map to help with the sums: spells' areas
 * (a sphere, cone, line or cube in the spell's colour, saying who is in it),
 * the area a spell would cover while it is being aimed, a ruler in feet from
 * a picked-up pawn to the pointer, and how far that pawn may still move this
 * turn. Places are in metres from the table's centre, sizes in feet.
 */
import * as THREE from "three";
import type { TableArea } from "@/lib/lounge-shared";
import { areaCentre, areaDirection, inArea, type PlacedArea } from "@/lib/dnd-spells";
import { TABLE_CENTRE } from "../lib/living-room";

/** An area being aimed: what it is, and where it starts; the pointer says where it goes. */
export interface AreaPreview extends Omit<PlacedArea, "x" | "z"> { colour: string; label: string }

interface Drawn { key: string; group: THREE.Group }

function textSprite(lines: string[], colour: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const fonts = ["700 30px system-ui, sans-serif", "500 24px system-ui, sans-serif"];
  let width = 0;
  lines.forEach((line, i) => { ctx.font = fonts[Math.min(i, 1)]; width = Math.max(width, ctx.measureText(line).width); });
  canvas.width = Math.min(640, Math.ceil(width) + 36);
  canvas.height = 20 + lines.length * 34;
  ctx.fillStyle = "rgba(18,12,24,0.82)";
  ctx.beginPath(); ctx.roundRect(0, 0, canvas.width, canvas.height, 18); ctx.fill();
  ctx.strokeStyle = colour; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(1.5, 1.5, canvas.width - 3, canvas.height - 3, 17); ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    ctx.font = fonts[Math.min(i, 1)];
    ctx.fillStyle = i ? "#e9e1f5" : "#fff4e3";
    ctx.fillText(line, canvas.width / 2, 27 + i * 34, canvas.width - 20);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  // Read from the overhead view across the room.
  const h = 0.055 * lines.length + 0.03;
  sprite.scale.set(h * (canvas.width / canvas.height), h, 1);
  sprite.renderOrder = 25;
  return sprite;
}

const disposeTree = (object: THREE.Object3D) => {
  object.traverse((part) => {
    const mesh = part as THREE.Mesh;
    mesh.geometry?.dispose();
    for (const material of [mesh.material ?? []].flat() as THREE.MeshBasicMaterial[]) { material.map?.dispose(); material.dispose(); }
  });
};

/** The outline of an area on the map, in the table's frame (metres, centre at 0). */
function outline(area: PlacedArea, metresPerFoot: number): THREE.Vector2[] {
  const size = area.size * metresPerFoot;
  if (area.shape === "sphere") {
    const c = areaCentre(area, metresPerFoot);
    return Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      return new THREE.Vector2(c.x + Math.cos(a) * size, c.z + Math.sin(a) * size);
    });
  }
  const d = areaDirection(area);
  const side = { x: -d.z, z: d.x };
  const at = (from: { x: number; z: number }, along: number, across: number) =>
    new THREE.Vector2(from.x + d.x * along + side.x * across, from.z + d.z * along + side.z * across);
  const origin = { x: area.ox, z: area.oz };
  if (area.shape === "cone") return [at(origin, 0, 0), at(origin, size, -size / 2), at(origin, size, size / 2)];
  if (area.shape === "line") {
    const w = (area.width * metresPerFoot) / 2;
    return [at(origin, 0, -w), at(origin, size, -w), at(origin, size, w), at(origin, 0, w)];
  }
  const c = areaCentre(area, metresPerFoot);
  const h = size / 2;
  return [at(c, -h, -h), at(c, h, -h), at(c, h, h), at(c, -h, h)];
}

export class TableOverlay {
  private readonly areas = new Map<string, Drawn>();
  private preview: { spec: AreaPreview; group: THREE.Group | null; key: string } | null = null;
  private cursor: { x: number; z: number } | null = null;
  private ruler: { from: { x: number; z: number }; limit: number | null } | null = null;
  private rulerGroup: THREE.Group | null = null;
  private rulerKey = "";
  private ring: THREE.Group | null = null;
  private ringKey = "";
  private metresPerFoot = 0.025;
  private lastAreas: Record<string, TableArea> | null = null;
  private lastHits: Map<string, string[]> | null = null;
  /** The pawns, so the area being aimed can say who it would catch. */
  private spots: Array<{ name: string; x: number; z: number; pad: number }> = [];

  constructor(private readonly root: THREE.Object3D, private readonly surfaceY: number) {}

  /** The area a clicked part belongs to, if any. */
  areaAt(object: THREE.Object3D | null): string | null {
    for (let o = object; o; o = o.parent) if (typeof o.userData.areaId === "string") return o.userData.areaId;
    return null;
  }

  setScale(metresPerFoot: number) {
    if (Math.abs(metresPerFoot - this.metresPerFoot) < 1e-9) return;
    this.metresPerFoot = metresPerFoot;
    this.lastAreas = null;
    // Everything drawn in feet is drawn again at the new scale.
    for (const drawn of this.areas.values()) drawn.key = "";
    this.rulerKey = "";
    this.ringKey = "";
    if (this.preview) this.preview.key = "";
  }

  /** The areas standing on the map, each saying who is in it. */
  setAreas(areas: Record<string, TableArea>, hits: Map<string, string[]>) {
    if (areas === this.lastAreas && hits === this.lastHits) return;
    this.lastAreas = areas;
    this.lastHits = hits;
    for (const [id, drawn] of this.areas) {
      if (areas[id]) continue;
      this.root.remove(drawn.group);
      disposeTree(drawn.group);
      this.areas.delete(id);
    }
    for (const area of Object.values(areas)) {
      const names = hits.get(area.id) ?? [];
      const key = `${area.at}|${area.x}|${area.z}|${area.ox}|${area.oz}|${names.join(",")}|${this.metresPerFoot}`;
      const old = this.areas.get(area.id);
      if (old?.key === key) continue;
      if (old) { this.root.remove(old.group); disposeTree(old.group); }
      const label = [
        `${area.spell} · ${area.size} ft ${area.shape}`,
        ...(area.note ? [area.note] : []),
        names.length ? `In it: ${names.slice(0, 4).join(", ")}${names.length > 4 ? ` +${names.length - 4}` : ""}` : "Nobody in it",
      ];
      const group = this.draw(area, area.colour, label, 1);
      group.userData.areaId = area.id;
      this.areas.set(area.id, { key, group });
    }
  }

  private draw(area: PlacedArea, colour: string, label: string[] | null, strength: number): THREE.Group {
    const group = new THREE.Group();
    const points = outline(area, this.metresPerFoot);
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, -p.y)));
    const fill = new THREE.Mesh(
      new THREE.ShapeGeometry(shape, 1),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.22 * strength, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    // The shape is drawn in X/-Z; laid flat, its Y becomes the table's -Z.
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(TABLE_CENTRE.x, this.surfaceY + 0.006, TABLE_CENTRE.z);
    fill.renderOrder = 5;
    // Clicks go through to the map (to move a pawn into it); only the label takes them.
    fill.raycast = () => undefined;
    group.add(fill);
    const edge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(TABLE_CENTRE.x + p.x, this.surfaceY + 0.008, TABLE_CENTRE.z + p.y))),
      new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.95 * strength, toneMapped: false }),
    );
    edge.renderOrder = 6;
    edge.raycast = () => undefined;
    group.add(edge);
    if (label) {
      const c = area.shape === "sphere" || area.shape === "cube" ? areaCentre(area, this.metresPerFoot)
        : (() => { const d = areaDirection(area); const half = (area.size * this.metresPerFoot) / 2; return { x: area.ox + d.x * half, z: area.oz + d.z * half }; })();
      const sprite = textSprite(label, colour);
      sprite.position.set(TABLE_CENTRE.x + c.x, this.surfaceY + 0.22, TABLE_CENTRE.z + c.z);
      group.add(sprite);
    }
    this.root.add(group);
    return group;
  }

  setSpots(spots: Array<{ name: string; x: number; z: number; pad: number }>) {
    if (spots === this.spots) return;
    this.spots = spots;
    if (this.preview) this.preview.key = "";
  }

  /** The area being aimed (null: none). It follows the pointer. */
  setPreview(spec: AreaPreview | null) {
    if (!spec) { this.clearPreview(); this.preview = null; return; }
    if (this.preview?.spec === spec) return;
    this.clearPreview();
    this.preview = { spec, group: null, key: "" };
  }

  private clearPreview() {
    if (this.preview?.group) { this.root.remove(this.preview.group); disposeTree(this.preview.group); this.preview.group = null; }
  }

  /** Where the pointer is on the map (null: off it). */
  setCursor(at: { x: number; z: number } | null) {
    this.cursor = at;
  }

  /** A ruler from a pawn to the pointer; past `limit` feet it turns red (null: no limit). */
  setRuler(from: { x: number; z: number } | null, limit: number | null = null) {
    this.ruler = from ? { from, limit } : null;
  }

  /** How far a pawn may still go this turn: a ring round where it started (null: none). */
  setMoveRing(at: { x: number; z: number } | null, feet = 0) {
    const key = at ? `${at.x.toFixed(3)}|${at.z.toFixed(3)}|${feet}|${this.metresPerFoot}` : "";
    if (key === this.ringKey) return;
    this.ringKey = key;
    if (this.ring) { this.root.remove(this.ring); disposeTree(this.ring); this.ring = null; }
    if (!at || feet <= 0) return;
    const r = feet * this.metresPerFoot;
    const ring = new THREE.Group();
    const band = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0, r - 0.012), r, 72),
      new THREE.MeshBasicMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(r, 72),
      new THREE.MeshBasicMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.08, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    for (const part of [band, disc]) {
      part.rotation.x = -Math.PI / 2;
      part.position.set(TABLE_CENTRE.x + at.x, this.surfaceY + 0.005, TABLE_CENTRE.z + at.z);
      part.raycast = () => undefined;
      part.renderOrder = 4;
      ring.add(part);
    }
    this.ring = ring;
    this.root.add(ring);
  }

  update() {
    const cursor = this.cursor;
    // The area being aimed, drawn where the pointer is.
    if (this.preview) {
      const { spec } = this.preview;
      const target = cursor ?? { x: spec.ox, z: spec.oz };
      const key = `${target.x.toFixed(3)}|${target.z.toFixed(3)}|${this.metresPerFoot}|${spec.label}`;
      if (key !== this.preview.key) {
        this.clearPreview();
        this.preview.key = key;
        const placed = { ...spec, x: target.x, z: target.z };
        // Who it would catch (never the caster in their own cone or aura).
        const caught = this.spots.filter((spot) => !(spec.fromSelf && Math.hypot(spot.x - spec.ox, spot.z - spec.oz) < 0.01) && inArea(placed, this.metresPerFoot, spot, spot.pad)).map((spot) => spot.name);
        const group = this.draw(placed, spec.colour, [spec.label, caught.length ? `Would catch: ${caught.slice(0, 4).join(", ")}${caught.length > 4 ? ` +${caught.length - 4}` : ""}` : "Nobody in it"], 0.8);
        group.traverse((part) => { part.raycast = () => undefined; });
        this.preview.group = group;
      }
    }
    // The ruler, in 5-foot steps as the rules count.
    const ruler = this.ruler && cursor ? this.ruler : null;
    const feet = ruler ? Math.round(Math.hypot(cursor!.x - ruler.from.x, cursor!.z - ruler.from.z) / this.metresPerFoot / 5) * 5 : 0;
    const key = ruler ? `${ruler.from.x.toFixed(3)}|${ruler.from.z.toFixed(3)}|${cursor!.x.toFixed(3)}|${cursor!.z.toFixed(3)}|${ruler.limit}|${this.metresPerFoot}` : "";
    if (key !== this.rulerKey) {
      this.rulerKey = key;
      if (this.rulerGroup) { this.root.remove(this.rulerGroup); disposeTree(this.rulerGroup); this.rulerGroup = null; }
      if (ruler && cursor) {
        const over = ruler.limit !== null && feet > ruler.limit;
        const colour = over ? "#ff6b6b" : "#fff4e3";
        const group = new THREE.Group();
        const y = this.surfaceY + 0.012;
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(TABLE_CENTRE.x + ruler.from.x, y, TABLE_CENTRE.z + ruler.from.z),
            new THREE.Vector3(TABLE_CENTRE.x + cursor.x, y, TABLE_CENTRE.z + cursor.z),
          ]),
          new THREE.LineDashedMaterial({ color: colour, dashSize: 0.03, gapSize: 0.02, transparent: true, opacity: 0.95, toneMapped: false }),
        );
        line.computeLineDistances();
        line.renderOrder = 7;
        group.add(line);
        const tag = textSprite([`${feet} ft${over ? ` (over ${ruler.limit})` : ""}`], colour);
            tag.position.set(TABLE_CENTRE.x + cursor.x, this.surfaceY + 0.12, TABLE_CENTRE.z + cursor.z);
        group.add(tag);
        group.traverse((part) => { part.raycast = () => undefined; });
        this.rulerGroup = group;
        this.root.add(group);
      }
    }
  }

  dispose() {
    for (const drawn of this.areas.values()) { this.root.remove(drawn.group); disposeTree(drawn.group); }
    this.areas.clear();
    this.clearPreview();
    this.setMoveRing(null);
    if (this.rulerGroup) { this.root.remove(this.rulerGroup); disposeTree(this.rulerGroup); }
  }
}
