/**
 * Spells going off at the tabletop: a fire bolt streaking to its target, a
 * fireball's bead bursting into a sphere the size of its area, darts of
 * force curling in, a spectral mage hand floating over, healing light rising,
 * and so on. The spells cast most have their own look (LOOK_NAMES); any other
 * gets one by its kind and damage. Everything is procedural, lasts a second
 * or three, and is gone again: nothing here is game state.
 */
import * as THREE from "three";
import type { SpellFxEvent } from "@/lib/lounge-shared";
import { areaCentre, areaColour, type PlacedArea } from "@/lib/dnd-spells";
import { TABLE_CENTRE } from "../lib/living-room";
import type { LookName } from "./tabletop-spellfx-looks";

const C = (hex: string) => new THREE.Color(hex);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Soft round spot, white in the middle: every glow and particle. */
function spotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Particles in one draw call, each with its own colour and fade. They are
 * painted over the map rather than added as light: added light vanishes into
 * a pale parchment map, paint shows on any.
 */
class Pool {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly pull: Float32Array;
  private readonly drag: Float32Array;
  private next = 0;
  private alive = 0;

  constructor(private readonly capacity: number, size: number, texture: THREE.Texture, private readonly floor: number) {
    this.pos = new Float32Array(capacity * 3).fill(-100);
    this.col = new Float32Array(capacity * 3);
    this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(1);
    this.life = new Float32Array(capacity).fill(1);
    this.pull = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geometry.setAttribute("tint", new THREE.BufferAttribute(this.col, 3));
    geometry.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1));
    this.points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, size: { value: size }, scale: { value: 450 } },
      vertexShader: `
        attribute vec3 tint;
        attribute float alpha;
        uniform float size;
        uniform float scale;
        varying vec3 vTint;
        varying float vAlpha;
        void main() {
          vTint = tint;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vTint;
        varying float vAlpha;
        void main() {
          float a = texture2D(map, gl_PointCoord).a * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vTint, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
    this.points.raycast = () => undefined;
  }

  emit(at: THREE.Vector3, velocity: THREE.Vector3, colour: THREE.Color, life: number, gravity = 0, drag = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    if (this.age[i] >= this.life[i]) this.alive++;
    this.pos.set([at.x, at.y, at.z], i * 3);
    this.vel.set([velocity.x, velocity.y, velocity.z], i * 3);
    this.col.set([colour.r, colour.g, colour.b], i * 3);
    this.alpha[i] = 1;
    this.age[i] = 0;
    this.life[i] = life;
    this.pull[i] = gravity;
    this.drag[i] = drag;
  }

  /** A burst from a point: `speed` outwards, `up` upwards. */
  burst(at: THREE.Vector3, count: number, colours: THREE.Color[], o: { speed: number; up?: number; life: number; gravity?: number; drag?: number; flat?: boolean }) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = o.flat ? rand(-0.15, 0.25) : rand(-0.9, 1);
      const s = o.speed * rand(0.35, 1);
      const v = new THREE.Vector3(Math.cos(a) * Math.sqrt(1 - e * e) * s, e * s + (o.up ?? 0) * rand(0.5, 1), Math.sin(a) * Math.sqrt(1 - e * e) * s);
      this.emit(at, v, colours[i % colours.length], o.life * rand(0.6, 1.1), o.gravity ?? 0, o.drag ?? 2);
    }
  }

  get busy() { return this.alive > 0; }

  update(dt: number) {
    if (!this.alive) return;
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      const j = i * 3;
      if (this.age[i] >= this.life[i]) {
        this.pos[j + 1] = -100;
        this.alpha[i] = 0;
        continue;
      }
      alive++;
      this.vel[j + 1] += this.pull[i] * dt;
      const keep = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[j] *= keep; this.vel[j + 1] *= keep; this.vel[j + 2] *= keep;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] = Math.max(this.floor, this.pos[j + 1] + this.vel[j + 1] * dt);
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.alpha[i] = (1 - this.age[i] / this.life[i]) ** 1.4;
    }
    this.alive = alive;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.tint.needsUpdate = true;
    this.points.geometry.attributes.alpha.needsUpdate = true;
  }
}

/** A short-lived piece of a spell: its objects, and what it does as it ages (0..1). */
interface Piece { objects: THREE.Object3D[]; born: number; life: number; tick: (age: number, dt: number, now: number) => void; done?: () => void }

/** What a look is handed: where it starts and ends (chest height and on the map), and how big. */
export interface Shot {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromGround: THREE.Vector3;
  toGround: THREE.Vector3;
  /** Along the map from caster to target. */
  dir: THREE.Vector3;
  area: PlacedArea | null;
  /** The area's size (radius, length or side) in metres. */
  reach: number;
  metresPerFoot: number;
  count: number;
  event: SpellFxEvent;
}

/** See-through paint for a spell's shapes (a light map would swallow added light). */
const additive = (colour: THREE.Color | string, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
/** Added light, for halos round something already painted. */
const light = (colour: THREE.Color | string, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });

export class SpellFx {
  private readonly spot = spotTexture();
  private readonly sparks: Pool;
  private readonly glows: Pool;
  private readonly pieces: Piece[] = [];
  private readonly queue: Array<{ at: number; run: () => void }> = [];
  private readonly ringGeometry = new THREE.RingGeometry(0.86, 1, 64);
  private readonly squareGeometry = new THREE.RingGeometry(0.9, 1, 4, 1);
  private readonly keep: Set<unknown>;
  private now = 0;

  constructor(private readonly root: THREE.Object3D, private readonly surfaceY: number) {
    this.sparks = new Pool(1800, 0.04, this.spot, surfaceY + 0.004);
    this.glows = new Pool(700, 0.13, this.spot, surfaceY + 0.004);
    root.add(this.sparks.points, this.glows.points);
    this.keep = new Set<unknown>([this.spot, this.ringGeometry, this.squareGeometry]);
  }

  busy() { return this.pieces.length > 0 || this.queue.length > 0 || this.sparks.busy || this.glows.busy; }

  /** A spell went off: draw it. Places are metres from the table's centre. */
  play(event: SpellFxEvent, metresPerFoot: number) {
    const y = this.surfaceY;
    const at = (p: { x: number; z: number }, h: number) => new THREE.Vector3(TABLE_CENTRE.x + p.x, y + h, TABLE_CENTRE.z + p.z);
    const dir = new THREE.Vector3(event.to.x - event.from.x, 0, event.to.z - event.from.z);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
    dir.normalize();
    const area: PlacedArea | null = event.area ? { ...event.area, x: event.to.x, z: event.to.z, ox: event.from.x, oz: event.from.z } : null;
    const shot: Shot = {
      from: at(event.from, 0.13), to: at(event.to, 0.12), fromGround: at(event.from, 0.01), toGround: at(event.to, 0.01), dir, area,
      reach: (event.area?.size ?? 10) * metresPerFoot, metresPerFoot, count: Math.max(1, Math.min(10, event.count || 1)), event,
    };
    const look = LOOKS[event.spell.toLowerCase() as LookName];
    if (look) look.call(this, shot);
    else this.generic(shot);
  }

  /* ---------- the toolkit ---------- */

  private later(seconds: number, run: () => void) { this.queue.push({ at: this.now + seconds, run }); }

  private add(objects: THREE.Object3D[], life: number, tick: Piece["tick"], done?: () => void) {
    for (const object of objects) { object.traverse((o) => { o.raycast = () => undefined; }); this.root.add(object); }
    this.pieces.push({ objects, born: this.now, life, tick, done });
  }

  private glowSprite(colour: THREE.Color | string, size: number) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.spot, color: colour, transparent: true, depthWrite: false, toneMapped: false }));
    sprite.scale.setScalar(size);
    sprite.renderOrder = 10;
    return sprite;
  }

  /** A light at a point that flares and fades. */
  private flash(at: THREE.Vector3, colour: string, size: number, life = 0.35) {
    const sprite = this.glowSprite(colour, size);
    sprite.position.copy(at);
    this.add([sprite], life, (age) => { sprite.material.opacity = (1 - age) ** 2; sprite.scale.setScalar(size * (0.6 + age * 0.8)); });
  }

  /** A ring spreading on the map. */
  private ring(at: THREE.Vector3, from: number, to: number, colour: string, life: number, square = false, turn = 0) {
    const mesh = new THREE.Mesh(square ? this.squareGeometry : this.ringGeometry, additive(colour, 0.9));
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = turn + (square ? Math.PI / 4 : 0);
    mesh.position.set(at.x, this.surfaceY + 0.012, at.z);
    mesh.renderOrder = 8;
    this.add([mesh], life, (age) => {
      mesh.scale.setScalar(from + (to - from) * (1 - (1 - age) ** 3));
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - age);
    });
  }

  /** A glowing ball flying from one point to another (arcing up by `arc`), leaving a trail; `hit` when it lands. */
  private orb(from: THREE.Vector3, to: THREE.Vector3, o: { colour: string; core?: string; size: number; speed: number; arc?: number; trail: string[]; bend?: THREE.Vector3; hit?: (at: THREE.Vector3) => void }) {
    const glow = this.glowSprite(o.colour, o.size * 2.4);
    const core = this.glowSprite(o.core ?? "#ffffff", o.size);
    const trail = o.trail.map(C);
    const life = Math.max(0.25, from.distanceTo(to) / o.speed);
    const p = new THREE.Vector3();
    const bend = o.bend ?? new THREE.Vector3();
    let n = 0;
    this.add([glow, core], life, (age) => {
      // A curve through the bend point (darts of force swing round to their mark).
      const u = 1 - age;
      p.set(0, 0, 0)
        .addScaledVector(from, u * u)
        .addScaledVector(new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5).add(bend), 2 * u * age)
        .addScaledVector(to, age * age);
      p.y += (o.arc ?? 0) * 4 * age * (1 - age);
      glow.position.copy(p);
      core.position.copy(p);
      for (let i = 0; i < 2; i++, n++) this.sparks.emit(p, new THREE.Vector3(rand(-0.1, 0.1), rand(-0.05, 0.12), rand(-0.1, 0.1)), trail[n % trail.length], rand(0.25, 0.5), 0, 3);
    }, () => o.hit?.(to.clone()));
  }

  /** A beam between two points: straight, or a crackling jag that redraws itself. */
  private beam(from: THREE.Vector3, to: THREE.Vector3, o: { colour: string; width: number; life: number; jag?: number }) {
    const material = additive(o.colour, 0.95);
    const halo = light(o.colour, 0.45);
    const group = new THREE.Group();
    let mesh: THREE.Mesh | null = null;
    let outer: THREE.Mesh | null = null;
    let drawnAt = -1;
    const draw = () => {
      for (const m of [mesh, outer]) if (m) { group.remove(m); m.geometry.dispose(); }
      const points: THREE.Vector3[] = [];
      const steps = o.jag ? 14 : 1;
      for (let i = 0; i <= steps; i++) {
        const point = from.clone().lerp(to, i / steps);
        if (o.jag && i > 0 && i < steps) point.add(new THREE.Vector3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).multiplyScalar(o.jag));
        points.push(point);
      }
      const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.1);
      mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, steps * 4, o.width, 6, false), material);
      outer = new THREE.Mesh(new THREE.TubeGeometry(curve, steps * 4, o.width * 3, 6, false), halo);
      mesh.renderOrder = outer.renderOrder = 9;
      group.add(outer, mesh);
    };
    draw();
    this.add([group], o.life, (age, _dt, now) => {
      if (o.jag && now - drawnAt > 0.05) { drawnAt = now; draw(); }
      const flicker = o.jag ? rand(0.6, 1) : 1;
      material.opacity = 0.95 * (1 - age) * flicker;
      halo.opacity = 0.3 * (1 - age) * flicker;
    }, () => { for (const m of [mesh, outer]) m?.geometry.dispose(); });
  }

  /** A sphere of light swelling to `radius` and fading: an explosion. */
  private blast(at: THREE.Vector3, radius: number, colours: [string, string], life = 0.9) {
    const outer = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), additive(colours[0], 0.75));
    const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), additive(colours[1], 0.9));
    for (const m of [outer, inner]) { m.position.copy(at); m.renderOrder = 9; }
    this.add([outer, inner], life, (age) => {
      const grow = Math.min(1, age / 0.3);
      const r = radius * (0.15 + 0.85 * (1 - (1 - grow) ** 3));
      outer.scale.set(r, r * 0.75, r);
      inner.scale.setScalar(r * 0.55 * (1 - age * 0.6));
      (outer.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - age) ** 1.5;
      (inner.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - age) ** 2.5;
    });
  }

  /** A column of light coming down onto a spot (Sacred Flame, Moonbeam). */
  private column(at: THREE.Vector3, radius: number, height: number, colour: string, life: number) {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 28, 1, true);
    geometry.translate(0, -height / 2, 0);
    const mesh = new THREE.Mesh(geometry, additive(colour, 0.55));
    mesh.position.set(at.x, this.surfaceY + height, at.z);
    mesh.renderOrder = 9;
    this.add([mesh], life, (age) => {
      mesh.scale.y = Math.min(1, age / 0.18);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (age < 0.7 ? 1 : (1 - age) / 0.3);
      mesh.rotation.y += 0.02;
    });
  }

  /** A sign drawn on a disc: flat on the map, or standing over a target's head. */
  private glyph(at: THREE.Vector3, size: number, colour: string, life: number, draw: (ctx: CanvasRenderingContext2D) => void, o: { flat?: boolean; spin?: number } = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 10;
    ctx.lineCap = ctx.lineJoin = "round";
    draw(ctx);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, color: colour, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    mesh.position.copy(at);
    if (o.flat) mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 10;
    const spin = o.spin ?? 0.8;
    this.add([mesh], life, (age, dt) => {
      if (o.flat) mesh.rotation.z += spin * dt; else mesh.rotation.y += spin * dt;
      const pop = Math.min(1, age / 0.12);
      mesh.scale.setScalar(0.6 + 0.4 * pop);
      material.opacity = age < 0.75 ? pop : (1 - age) / 0.25;
    }, () => texture.dispose());
  }

  /** A word or picture floating up and away (🔔, ✚, z). */
  private icon(text: string, at: THREE.Vector3, size: number, life: number, colour = "#ffffff", rise = 0.15) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "700 92px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = colour;
    ctx.fillText(text, 64, 70);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    sprite.scale.setScalar(size);
    sprite.position.copy(at);
    sprite.renderOrder = 11;
    const start = at.clone();
    this.add([sprite], life, (age) => {
      sprite.position.set(start.x, start.y + rise * age, start.z);
      sprite.material.opacity = age < 0.15 ? age / 0.15 : age > 0.7 ? (1 - age) / 0.3 : 1;
      sprite.material.rotation = Math.sin(age * 12) * 0.15 * (1 - age);
    }, () => texture.dispose());
  }

  /** A spectral hand: a palm, four fingers and a thumb in ghostly light. */
  private hand(colour: string, size: number) {
    const material = additive(colour, 0.7);
    const group = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.16), material);
    group.add(palm);
    const fingers: THREE.Object3D[] = [];
    [-0.19, -0.065, 0.065, 0.19].forEach((x, i) => {
      const joint = new THREE.Group();
      joint.position.set(x, 0.27, 0);
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.3 - Math.abs(i - 1.5) * 0.05, 4, 8), material);
      finger.position.y = 0.2;
      joint.add(finger);
      group.add(joint);
      fingers.push(joint);
    });
    const thumbJoint = new THREE.Group();
    thumbJoint.position.set(0.27, -0.05, 0);
    thumbJoint.rotation.z = -0.9;
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), material);
    thumb.position.y = 0.15;
    thumbJoint.add(thumb);
    group.add(thumbJoint);
    group.scale.setScalar(size);
    return { group, fingers, material };
  }

  /** Light rising round a creature: healing. */
  private heal(at: THREE.Vector3, big: boolean) {
    const green = [C("#16a34a"), C("#eab308"), C("#22c55e")];
    this.flash(at, "#22c55e", big ? 0.6 : 0.42, 0.8);
    this.ring(at.clone().setY(this.surfaceY), 0.04, big ? 0.16 : 0.12, "#16a34a", 0.9);
    for (let k = 0; k < (big ? 14 : 9); k++) {
      this.later(k * 0.07, () => {
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = rand(0.03, 0.1);
          (i % 3 ? this.sparks : this.glows).emit(new THREE.Vector3(at.x + Math.cos(a) * r, this.surfaceY + 0.02, at.z + Math.sin(a) * r), new THREE.Vector3(0, rand(0.25, 0.5), 0), green[i % 3], rand(0.7, 1.1), 0, 0.5);
        }
      });
    }
    for (let i = 0; i < (big ? 3 : 2); i++) this.later(i * 0.25, () => this.icon("✚", new THREE.Vector3(at.x + rand(-0.06, 0.06), at.y + 0.05, at.z + rand(-0.06, 0.06)), 0.1, 1.3, "#16a34a", 0.2));
  }

  /** Flames or frost blowing out in a cone from the caster. */
  private coneJet(shot: Shot, colours: string[], o: { life: number; glows: boolean }) {
    const palette = colours.map(C);
    const reach = shot.reach;
    const ticks = Math.round(o.life / 0.03);
    for (let k = 0; k < ticks; k++) {
      this.later(k * 0.03, () => {
        for (let i = 0; i < 9; i++) {
          // Within the cone: as wide as it is far (a half-angle of about 26.6 degrees).
          const spread = rand(-0.46, 0.46);
          const d = shot.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
          const speed = reach / rand(0.35, 0.55);
          const v = d.multiplyScalar(speed).add(new THREE.Vector3(0, rand(0, 0.25), 0));
          (o.glows && i % 2 ? this.glows : this.sparks).emit(shot.fromGround.clone().setY(this.surfaceY + 0.06), v, palette[i % palette.length], rand(0.35, 0.55), 0, 1.2);
        }
      });
    }
  }

  /** Bright motes appearing all over an area for a while (Faerie Fire, Sleep, Moonbeam). */
  private motes(centre: THREE.Vector3, radius: number, square: boolean, colours: string[], duration: number, o: { rise?: number; size?: "glow" | "spark" } = {}) {
    const palette = colours.map(C);
    for (let k = 0; k < Math.round(duration / 0.06); k++) {
      this.later(k * 0.06, () => {
        for (let i = 0; i < 5; i++) {
          const p = square
            ? new THREE.Vector3(centre.x + rand(-radius, radius), this.surfaceY + rand(0.02, 0.2), centre.z + rand(-radius, radius))
            : (() => { const a = Math.random() * Math.PI * 2; const r = radius * Math.sqrt(Math.random()); return new THREE.Vector3(centre.x + Math.cos(a) * r, this.surfaceY + rand(0.02, 0.2), centre.z + Math.sin(a) * r); })();
          (o.size === "glow" ? this.glows : this.sparks).emit(p, new THREE.Vector3(rand(-0.03, 0.03), o.rise ?? rand(0.02, 0.08), rand(-0.03, 0.03)), palette[(k + i) % palette.length], rand(0.6, 1.2), 0, 0.5);
        }
      });
    }
  }

  /** Where an area's middle is on the map. */
  private middle(shot: Shot) {
    if (!shot.area) return shot.toGround.clone();
    const c = areaCentre(shot.area, shot.metresPerFoot);
    return new THREE.Vector3(TABLE_CENTRE.x + c.x, this.surfaceY + 0.01, TABLE_CENTRE.z + c.z);
  }

  /** A spell without its own look: by its kind, in its damage's colour. */
  private generic(shot: Shot) {
    const e = shot.event;
    const colour = e.heals ? "#16a34a" : e.damageType ? areaColour(e.damageType) : "#8b5cf6";
    const palette = [C(colour), C("#ffffff")];
    if (shot.area) {
      const mid = this.middle(shot);
      if (shot.area.shape === "cone") { this.coneJet(shot, [colour, "#ffffff"], { life: 0.5, glows: true }); return; }
      if (shot.area.shape === "line") {
        const end = shot.fromGround.clone().addScaledVector(shot.dir, shot.reach).setY(this.surfaceY + 0.08);
        this.beam(shot.fromGround.clone().setY(this.surfaceY + 0.08), end, { colour, width: shot.area.width * shot.metresPerFoot * 0.25, life: 0.6 });
        return;
      }
      const r = shot.area.shape === "cube" ? shot.reach / 2 : shot.reach;
      this.ring(mid, r * 0.2, r, colour, 0.9, shot.area.shape === "cube", Math.atan2(shot.dir.x, shot.dir.z));
      this.glows.burst(mid.clone().setY(this.surfaceY + 0.05), 40, palette, { speed: r * 2.2, life: 0.7, flat: true });
      return;
    }
    if (e.heals) { this.heal(shot.to, false); return; }
    if (shot.from.distanceTo(shot.to) < 0.02) {
      this.flash(shot.from, colour, 0.4, 0.6);
      this.sparks.burst(shot.from, 30, palette, { speed: 0.3, up: 0.2, life: 0.8 });
      return;
    }
    this.orb(shot.from, shot.to, { colour, size: 0.05, speed: 2.4, arc: 0.04, trail: [colour, "#ffffff"], hit: (at) => { this.flash(at, colour, 0.3); this.sparks.burst(at, 24, palette, { speed: 0.35, life: 0.5 }); } });
  }

  update(t: number, dt: number) {
    this.now = t;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].at > t) continue;
      const { run } = this.queue[i];
      this.queue.splice(i, 1);
      run();
    }
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const piece = this.pieces[i];
      const age = (t - piece.born) / piece.life;
      if (age >= 1) {
        this.pieces.splice(i, 1);
        piece.done?.();
        for (const object of piece.objects) { this.root.remove(object); this.release(object); }
        continue;
      }
      piece.tick(Math.max(0, age), dt, t);
    }
    this.sparks.update(dt);
    this.glows.update(dt);
  }

  /** Frees what one piece made (shared textures and geometries stay). */
  private release(object: THREE.Object3D) {
    object.traverse((part) => {
      const mesh = part as THREE.Mesh;
      if (mesh.geometry && !this.keep.has(mesh.geometry)) mesh.geometry.dispose();
      for (const material of [mesh.material ?? []].flat() as THREE.MeshBasicMaterial[]) {
        if (material.map && !this.keep.has(material.map)) material.map.dispose();
        material.dispose();
      }
    });
  }

  dispose() {
    for (const piece of this.pieces) for (const object of piece.objects) { this.root.remove(object); this.release(object); }
    this.pieces.length = 0;
    this.queue.length = 0;
    for (const pool of [this.sparks, this.glows]) { this.root.remove(pool.points); pool.points.geometry.dispose(); (pool.points.material as THREE.Material).dispose(); }
    this.spot.dispose();
    this.ringGeometry.dispose();
    this.squareGeometry.dispose();
  }

  /* ---------- spells' own looks, used through LOOKS ---------- */

  fireBolt(s: Shot) {
    this.orb(s.from, s.to, {
      colour: "#ff7a1a", core: "#fff1a8", size: 0.06, speed: 1.6, arc: 0.06, trail: ["#ff8a2a", "#ffd23c", "#ff4a12"],
      hit: (at) => { this.flash(at, "#ffb347", 0.45); this.sparks.burst(at, 40, [C("#ff8a2a"), C("#ffd23c"), C("#ff4a12")], { speed: 0.5, up: 0.2, life: 0.7, gravity: -0.6 }); this.ring(at, 0.02, 0.14, "#ff9a3c", 0.5); },
    });
  }

  rayOfFrost(s: Shot) {
    this.beam(s.from, s.to, { colour: "#38bdf8", width: 0.006, life: 0.7 });
    for (let i = 0; i < 24; i++) this.sparks.emit(s.from.clone().lerp(s.to, Math.random()), new THREE.Vector3(rand(-0.05, 0.05), rand(-0.05, 0.05), rand(-0.05, 0.05)), C(i % 2 ? "#bae6fd" : "#0ea5e9"), rand(0.5, 0.9), -0.2, 1);
    this.flash(s.to, "#bdf0ff", 0.4, 0.6);
    this.sparks.burst(s.to, 30, [C("#e0f2fe"), C("#0ea5e9")], { speed: 0.3, life: 0.9, gravity: -0.5 });
    this.ring(s.toGround, 0.03, 0.12, "#0ea5e9", 1);
  }

  eldritchBlast(s: Shot) {
    for (let i = 0; i < s.count; i++) {
      this.later(i * 0.18, () => {
        const to = s.to.clone().add(new THREE.Vector3(rand(-0.02, 0.02), rand(-0.02, 0.02), rand(-0.02, 0.02)));
        this.beam(s.from, to, { colour: "#9333ea", width: 0.007, life: 0.4, jag: 0.015 });
        this.flash(to, "#d8b4fe", 0.35);
        this.sparks.burst(to, 26, [C("#a855f7"), C("#f0abfc"), C("#ffffff")], { speed: 0.45, life: 0.6 });
      });
    }
  }

  chillTouch(s: Shot) {
    const { group, fingers, material } = this.hand("#16a34a", 0.18);
    group.position.copy(s.toGround).setY(this.surfaceY - 0.05);
    this.add([group], 1.6, (age) => {
      group.position.y = this.surfaceY - 0.05 + Math.min(1, age / 0.35) * 0.14;
      for (const f of fingers) f.rotation.x = age > 0.4 ? Math.min(1.2, (age - 0.4) * 4) : 0;
      material.opacity = 0.7 * (age > 0.7 ? (1 - age) / 0.3 : 1);
    });
    this.motes(s.toGround, 0.06, false, ["#16a34a", "#4ade80"], 0.8, { rise: 0.12 });
  }

  sacredFlame(s: Shot) {
    this.column(s.toGround, 0.05, 0.7, "#ffe27a", 1.2);
    this.later(0.15, () => {
      this.flash(s.to, "#fff4c2", 0.5, 0.6);
      this.sparks.burst(s.toGround.clone().setY(this.surfaceY + 0.03), 40, [C("#ffe27a"), C("#ffffff")], { speed: 0.25, up: 0.5, life: 0.9, flat: true });
      this.ring(s.toGround, 0.02, 0.12, "#ffe27a", 0.7);
    });
  }

  tollTheDead(s: Shot) {
    this.icon("🔔", s.to.clone().setY(s.to.y + 0.18), 0.12, 1.6, "#ffffff", 0.04);
    for (let i = 0; i < 3; i++) this.later(0.2 + i * 0.35, () => this.ring(s.toGround, 0.03, 0.18, "#7c3aed", 0.6));
    this.motes(s.toGround, 0.05, false, ["#4c1d95", "#a78bfa"], 1, { rise: 0.05, size: "glow" });
  }

  viciousMockery(s: Shot) {
    this.icon("💢", s.to.clone().setY(s.to.y + 0.16), 0.1, 1.2);
    this.later(0.2, () => this.icon("😜", s.to.clone().add(new THREE.Vector3(0.07, 0.12, 0)), 0.08, 1));
    const swirl = [C("#e879f9"), C("#f0abfc")];
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 4;
      this.later(i * 0.02, () => this.sparks.emit(new THREE.Vector3(s.to.x + Math.cos(a) * 0.08, s.to.y + 0.08 + i * 0.003, s.to.z + Math.sin(a) * 0.08), new THREE.Vector3(0, 0.05, 0), swirl[i % 2], 0.6));
    }
  }

  mageHand(s: Shot) {
    const { group, fingers, material } = this.hand("#14b8a6", 0.2);
    const start = s.from.clone().add(new THREE.Vector3(0, 0.08, 0));
    const end = s.to.clone().add(new THREE.Vector3(0, 0.1, 0));
    group.position.copy(start);
    // Palm out to the table, turned the way it floats.
    group.rotation.set(-0.4, Math.atan2(s.dir.x, s.dir.z), 0);
    this.add([group], 4, (age, _dt, now) => {
      const fly = Math.min(1, age / 0.3);
      const e = fly * fly * (3 - 2 * fly);
      group.position.lerpVectors(start, end, e);
      group.position.y += Math.sin(now * 3) * 0.01 + 0.06 * Math.sin(e * Math.PI);
      // There: a wave, then the fingers curl as if it picked something up.
      group.rotation.z = age > 0.3 && age < 0.65 ? Math.sin(now * 9) * 0.35 : 0;
      for (const [i, f] of fingers.entries()) f.rotation.x = age > 0.65 ? Math.min(1.1, (age - 0.65) * 5) : Math.sin(now * 6 + i) * 0.15;
      material.opacity = 0.7 * (age < 0.05 ? age / 0.05 : age > 0.85 ? (1 - age) / 0.15 : 1);
      if (Math.random() < 0.4) this.sparks.emit(group.position, new THREE.Vector3(rand(-0.05, 0.05), rand(-0.08, 0), rand(-0.05, 0.05)), C("#2dd4bf"), 0.5, 0, 1);
    });
  }

  magicMissile(s: Shot) {
    for (let i = 0; i < s.count; i++) {
      this.later(i * 0.09, () => {
        const side = new THREE.Vector3(-s.dir.z, 0, s.dir.x).multiplyScalar(rand(-0.35, 0.35));
        const to = s.to.clone().add(new THREE.Vector3(rand(-0.02, 0.02), rand(-0.01, 0.03), rand(-0.02, 0.02)));
        this.orb(s.from, to, {
          colour: "#7c3aed", core: "#e0e7ff", size: 0.035, speed: 1.4, trail: ["#6366f1", "#a855f7", "#d946ef"], bend: side.add(new THREE.Vector3(0, rand(0.05, 0.2), 0)),
          hit: (at) => { this.flash(at, "#c7d2fe", 0.22, 0.25); this.sparks.burst(at, 14, [C("#a78bfa"), C("#ffffff")], { speed: 0.3, life: 0.4 }); },
        });
      });
    }
  }

  scorchingRay(s: Shot) {
    for (let i = 0; i < s.count; i++) {
      this.later(i * 0.2, () => {
        const to = s.to.clone().add(new THREE.Vector3(rand(-0.03, 0.03), rand(-0.02, 0.03), rand(-0.03, 0.03)));
        this.beam(s.from, to, { colour: "#ff6a1a", width: 0.008, life: 0.35 });
        this.flash(to, "#ffb347", 0.3);
        this.sparks.burst(to, 22, [C("#ff8a2a"), C("#ffd23c")], { speed: 0.4, up: 0.15, life: 0.6, gravity: -0.5 });
      });
    }
  }

  guidingBolt(s: Shot) {
    this.orb(s.from, s.to, {
      colour: "#fff4c2", core: "#ffffff", size: 0.07, speed: 3, arc: 0.03, trail: ["#ffe27a", "#ffffff"],
      hit: (at) => {
        this.flash(at, "#ffffff", 0.6, 0.5);
        this.sparks.burst(at, 40, [C("#ffe27a"), C("#ffffff")], { speed: 0.5, life: 0.7 });
        // The mark it leaves: the next attack has advantage.
        this.motes(at.clone().setY(this.surfaceY), 0.05, false, ["#ffe27a", "#ffffff"], 2, { rise: 0.1 });
      },
    });
  }

  shield(s: Shot) {
    const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), new THREE.MeshBasicMaterial({ color: "#2563eb", wireframe: true, transparent: true, depthWrite: false, toneMapped: false }));
    const skin = new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 16), additive("#3b82f6", 0.18));
    for (const m of [dome, skin]) m.position.copy(s.fromGround).setY(this.surfaceY + 0.08);
    this.add([dome, skin], 1.4, (age, dt) => {
      const pop = age < 0.12 ? age / 0.12 : 1;
      const k = 0.7 + 0.3 * pop + (age < 0.25 ? Math.sin(age * 40) * 0.03 : 0);
      dome.scale.setScalar(k); skin.scale.setScalar(k);
      dome.rotation.y += dt * 0.8;
      (dome.material as THREE.MeshBasicMaterial).opacity = 0.9 * (age > 0.7 ? (1 - age) / 0.3 : 1);
      (skin.material as THREE.MeshBasicMaterial).opacity = 0.18 * (age > 0.7 ? (1 - age) / 0.3 : 1);
    });
    this.flash(s.from, "#bfdbfe", 0.45, 0.4);
  }

  cureWounds(s: Shot) { this.heal(s.to, true); }

  healingWord(s: Shot) {
    this.orb(s.from, s.to, { colour: "#22c55e", core: "#ffffff", size: 0.035, speed: 3.2, arc: 0.12, trail: ["#16a34a", "#eab308"], hit: (at) => this.heal(at, false) });
  }

  bless(s: Shot) {
    this.glyph(s.toGround.clone().setY(this.surfaceY + 0.012), 0.22, "#ffe27a", 1.6, (ctx) => {
      ctx.beginPath(); ctx.arc(128, 128, 100, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(128 + Math.cos(a) * 52, 128 + Math.sin(a) * 52); ctx.lineTo(128 + Math.cos(a) * 84, 128 + Math.sin(a) * 84); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(128, 128, 34, 0, Math.PI * 2); ctx.fill();
    }, { flat: true, spin: 0.6 });
    for (let k = 0; k < 16; k++) this.later(k * 0.06, () => {
      for (let i = 0; i < 3; i++) this.sparks.emit(new THREE.Vector3(s.to.x + rand(-0.07, 0.07), s.to.y + 0.3, s.to.z + rand(-0.07, 0.07)), new THREE.Vector3(0, -rand(0.2, 0.35), 0), C(i % 2 ? "#ffe27a" : "#ffffff"), 1, 0, 0.3);
    });
  }

  huntersMark(s: Shot) {
    this.glyph(s.to.clone().setY(s.to.y + 0.2), 0.12, "#4ade80", 2.2, (ctx) => {
      ctx.beginPath(); ctx.arc(128, 128, 90, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(128, 128, 40, 0, Math.PI * 2); ctx.stroke();
      for (const [x1, y1, x2, y2] of [[128, 10, 128, 80], [128, 176, 128, 246], [10, 128, 80, 128], [176, 128, 246, 128]]) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    }, { spin: 1.4 });
    this.beam(s.to.clone().setY(s.to.y + 0.2), s.toGround, { colour: "#4ade80", width: 0.003, life: 0.8 });
  }

  hex(s: Shot) {
    this.glyph(s.to.clone().setY(s.to.y + 0.2), 0.13, "#a855f7", 2.2, (ctx) => {
      ctx.beginPath(); ctx.ellipse(128, 128, 104, 60, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(128, 128, 34, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.35; ctx.beginPath(); ctx.moveTo(128 + Math.cos(a) * 70, 128 + Math.sin(a) * 70); ctx.lineTo(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110); ctx.stroke(); }
    }, { spin: 0.5 });
    this.motes(s.toGround, 0.06, false, ["#7e22ce", "#c084fc"], 1.2, { rise: 0.1, size: "glow" });
  }

  holdPerson(s: Shot) {
    this.glyph(s.toGround.clone().setY(this.surfaceY + 0.012), 0.2, "#c084fc", 2.2, (ctx) => {
      ctx.beginPath(); ctx.arc(128, 128, 110, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(128, 128, 84, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(128 + Math.cos(a) * 84, 128 + Math.sin(a) * 84); ctx.lineTo(128 + Math.cos(a + 2.1) * 84, 128 + Math.sin(a + 2.1) * 84); ctx.stroke(); }
    }, { flat: true, spin: -0.5 });
    const rings = [0.05, 0.1, 0.15].map((h) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 6, 32), additive("#d8b4fe", 0.9));
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(s.toGround).setY(this.surfaceY + h);
      return ring;
    });
    this.add(rings, 2.2, (age) => {
      rings.forEach((ring, i) => {
        // Chains closing in, and holding.
        ring.scale.setScalar(Math.max(0.5, 1.4 - Math.min(1, age / 0.25) * 0.9) + Math.sin(age * 30 + i) * 0.01);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (age > 0.75 ? (1 - age) / 0.25 : 1);
      });
    });
  }

  mistyStep(s: Shot) {
    const mist = [C("#94a3b8"), C("#cbd5e1"), C("#818cf8")];
    this.glows.burst(s.fromGround.clone().setY(this.surfaceY + 0.06), 40, mist, { speed: 0.25, up: 0.1, life: 1.1, drag: 3 });
    this.later(0.25, () => {
      this.glows.burst(s.toGround.clone().setY(this.surfaceY + 0.06), 40, mist, { speed: 0.25, up: 0.1, life: 1.1, drag: 3 });
      this.flash(s.to, "#e0e7ff", 0.35, 0.4);
    });
  }

  fireball(s: Shot) {
    const bead = s.from.clone();
    const point = this.middle(s).setY(this.surfaceY + 0.06);
    this.orb(bead, point, {
      colour: "#ff9a3c", core: "#fff1a8", size: 0.03, speed: 2.8, arc: 0.25, trail: ["#ffb347", "#ff6a1a"],
      hit: (at) => {
        const r = s.reach;
        this.flash(at, "#fff1a8", r * 2.2, 0.35);
        this.blast(at, r, ["#ff6a1a", "#ffe08a"], 1.1);
        this.ring(at, r * 0.2, r * 1.15, "#ff8a2a", 0.9);
        this.glows.burst(at, 70, [C("#ff6a1a"), C("#ff9a3c"), C("#ffd23c")], { speed: r * 2.6, up: 0.2, life: 0.9, flat: true, drag: 3 });
        this.sparks.burst(at, 90, [C("#ffd23c"), C("#ff8a2a"), C("#ffffff")], { speed: r * 3, up: 0.6, life: 1.4, gravity: -0.9, drag: 1.2 });
        // Embers drifting up after.
        this.later(0.4, () => this.motes(at.clone().setY(this.surfaceY), r * 0.8, false, ["#ff8a2a", "#ffb347"], 1.2, { rise: 0.18 }));
      },
    });
  }

  lightningBolt(s: Shot) {
    const from = s.fromGround.clone().setY(this.surfaceY + 0.09);
    const to = from.clone().addScaledVector(s.dir, s.reach);
    this.beam(from, to, { colour: "#6366f1", width: 0.009, life: 0.7, jag: 0.03 });
    this.later(0.12, () => this.beam(from, to, { colour: "#38bdf8", width: 0.005, life: 0.5, jag: 0.045 }));
    this.flash(from.clone().lerp(to, 0.5), "#e0e7ff", s.reach * 0.9, 0.3);
    for (let i = 0; i < 50; i++) this.sparks.emit(from.clone().lerp(to, Math.random()), new THREE.Vector3(rand(-0.3, 0.3), rand(0, 0.4), rand(-0.3, 0.3)), C(i % 2 ? "#6366f1" : "#38bdf8"), rand(0.3, 0.6), -1, 2);
  }

  burningHands(s: Shot) { this.coneJet(s, ["#ff6a1a", "#ffd23c", "#ff9a3c"], { life: 0.6, glows: true }); }

  coneOfCold(s: Shot) {
    this.coneJet(s, ["#7dd3fc", "#0ea5e9", "#e0f2fe"], { life: 0.8, glows: true });
    this.later(0.5, () => this.motes(this.middle(s), s.reach * 0.35, false, ["#7dd3fc", "#e0f2fe"], 1, { rise: -0.02 }));
  }

  thunderwave(s: Shot) {
    const mid = this.middle(s);
    const turn = Math.atan2(s.dir.x, s.dir.z);
    this.ring(mid, s.reach * 0.1, s.reach * 0.75, "#6366f1", 0.6, true, turn);
    this.later(0.1, () => this.ring(mid, s.reach * 0.1, s.reach * 0.6, "#818cf8", 0.5, true, turn));
    this.flash(mid.clone().setY(this.surfaceY + 0.08), "#e0e7ff", s.reach * 1.4, 0.3);
    this.sparks.burst(mid.clone().setY(this.surfaceY + 0.04), 60, [C("#6366f1"), C("#a5b4fc")], { speed: s.reach * 3, life: 0.5, flat: true, drag: 3 });
  }

  shatter(s: Shot) {
    const mid = this.middle(s).setY(this.surfaceY + 0.06);
    this.flash(mid, "#f1f5f9", s.reach * 1.6, 0.3);
    this.ring(mid, s.reach * 0.2, s.reach, "#64748b", 0.6);
    this.later(0.08, () => this.ring(mid, s.reach * 0.1, s.reach * 0.8, "#94a3b8", 0.5));
    this.sparks.burst(mid, 70, [C("#475569"), C("#94a3b8"), C("#6366f1")], { speed: s.reach * 3.5, up: 0.3, life: 0.8, gravity: -1.2, drag: 1 });
  }

  spiritGuardians(s: Shot) {
    const centre = s.fromGround.clone();
    const r = s.reach;
    const spirits = Array.from({ length: 10 }, (_, i) => ({ sprite: this.glowSprite(i % 3 ? "#ffe9a8" : "#ffffff", 0.07), phase: (i / 10) * Math.PI * 2, h: rand(0.04, 0.16) }));
    this.add(spirits.map((p) => p.sprite), 3.2, (age, _dt, now) => {
      const out = Math.min(1, age / 0.2);
      for (const p of spirits) {
        const a = p.phase + now * 1.6;
        p.sprite.position.set(centre.x + Math.cos(a) * r * out, this.surfaceY + p.h + Math.sin(now * 3 + p.phase) * 0.02, centre.z + Math.sin(a) * r * out);
        p.sprite.material.opacity = age > 0.8 ? (1 - age) / 0.2 : 1;
        if (Math.random() < 0.3) this.sparks.emit(p.sprite.position, new THREE.Vector3(0, 0.03, 0), C("#ffe9a8"), 0.5);
      }
    });
    this.ring(centre, r * 0.3, r, "#ffe27a", 1.2);
  }

  moonbeam(s: Shot) {
    const mid = this.middle(s);
    this.column(mid, s.reach, 0.8, "#94a3b8", 2.6);
    this.motes(mid, s.reach * 0.9, false, ["#64748b", "#818cf8"], 2.2, { rise: 0.12 });
  }

  faerieFire(s: Shot) {
    this.motes(this.middle(s), s.reach / 2, true, ["#60a5fa", "#a78bfa", "#4ade80", "#f0abfc"], 1.8, { rise: 0.03 });
  }

  sleep(s: Shot) {
    const mid = this.middle(s);
    this.motes(mid, s.reach, false, ["#f9a8d4", "#fbcfe8", "#ffffff"], 1.6, { rise: 0.05, size: "glow" });
    for (let i = 0; i < 4; i++) this.later(0.2 + i * 0.3, () => this.icon("z", new THREE.Vector3(mid.x + rand(-1, 1) * s.reach * 0.6, this.surfaceY + 0.12, mid.z + rand(-1, 1) * s.reach * 0.6), 0.08, 1.4, "#fbcfe8", 0.2));
  }

  web(s: Shot) {
    const mid = this.middle(s);
    const h = s.reach / 2;
    const points: number[] = [];
    const corner = () => [mid.x + rand(-h, h), this.surfaceY + rand(0.01, 0.12), mid.z + rand(-h, h)];
    for (let i = 0; i < 60; i++) points.push(...corner(), ...corner());
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({ color: "#64748b", transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const strands = new THREE.LineSegments(geometry, material);
    strands.renderOrder = 9;
    this.add([strands], 3.2, (age) => { material.opacity = 0.75 * (age < 0.15 ? age / 0.15 : age > 0.8 ? (1 - age) / 0.2 : 1); });
  }
}

type Look = (this: SpellFx, shot: Shot) => void;

/** Each named spell's own look (TypeScript checks that every name in LOOK_NAMES has one). */
const LOOKS: Record<LookName, Look> = {
  "fire bolt": SpellFx.prototype.fireBolt,
  "ray of frost": SpellFx.prototype.rayOfFrost,
  "eldritch blast": SpellFx.prototype.eldritchBlast,
  "chill touch": SpellFx.prototype.chillTouch,
  "sacred flame": SpellFx.prototype.sacredFlame,
  "toll the dead": SpellFx.prototype.tollTheDead,
  "vicious mockery": SpellFx.prototype.viciousMockery,
  "mage hand": SpellFx.prototype.mageHand,
  "magic missile": SpellFx.prototype.magicMissile,
  "scorching ray": SpellFx.prototype.scorchingRay,
  "guiding bolt": SpellFx.prototype.guidingBolt,
  "shield": SpellFx.prototype.shield,
  "cure wounds": SpellFx.prototype.cureWounds,
  "healing word": SpellFx.prototype.healingWord,
  "bless": SpellFx.prototype.bless,
  "hunter's mark": SpellFx.prototype.huntersMark,
  "hex": SpellFx.prototype.hex,
  "hold person": SpellFx.prototype.holdPerson,
  "misty step": SpellFx.prototype.mistyStep,
  "fireball": SpellFx.prototype.fireball,
  "lightning bolt": SpellFx.prototype.lightningBolt,
  "burning hands": SpellFx.prototype.burningHands,
  "thunderwave": SpellFx.prototype.thunderwave,
  "shatter": SpellFx.prototype.shatter,
  "spirit guardians": SpellFx.prototype.spiritGuardians,
  "moonbeam": SpellFx.prototype.moonbeam,
  "faerie fire": SpellFx.prototype.faerieFire,
  "sleep": SpellFx.prototype.sleep,
  "web": SpellFx.prototype.web,
  "cone of cold": SpellFx.prototype.coneOfCold,
};
