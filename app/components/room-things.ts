/**
 * Things you can touch in the Living Room's rooms, the shared machinery: a
 * room tags its objects, registers its switches (a lamp, the fire, the
 * tabletop's mood) and its moments (the cat purring), and this keeps them
 * easing, playing and answering the pointer. Switches are the whole call's
 * (kept by the hub, see lib/lounge-shared.ts); moments play here at once and
 * for everyone else when the hub passes them on.
 */
import * as THREE from "three";
import type { TableMood } from "@/lib/lounge-shared";
import { canvasTexture } from "./living-room-scene";
import { playSwitch } from "./living-room-sounds";

/** The switches as the hub has them. */
export interface SwitchState { off: readonly string[]; curtains: boolean; mood: TableMood }

/** What touching a thing does: flip (or set) a switch everyone shares, draw the curtains, change the mood, or play a moment. */
export type Touch = { switch: string; on?: boolean } | { curtains: true } | { mood: true } | { moment: string };

/** What a room's things offer the view (living-room.tsx). */
export interface RoomThings {
  /** What touching it does. */
  route: (id: string) => Touch | null;
  /** What touching it does, for the pointer's tip; null when it is not a thing here. */
  label: (id: string) => string | null;
  /** The room's switches as everyone has them; sounds play for what changed. */
  set: (state: SwitchState) => void;
  /** Plays a moment here: the cat purrs, the guitar strums. */
  play: (thing: string) => void;
  /** Every object that is a thing, for pointing at. */
  targets: THREE.Object3D[];
  /** Something is still moving (a curtain, the cat), so shadows need redrawing. */
  busy: () => boolean;
  /** The lights changed and have settled since; the reflections should be taken again. */
  relit: () => boolean;
}

type Floater = "heart" | "note" | "spark" | "star";

export class ThingKit {
  readonly targets: THREE.Object3D[] = [];
  /** What each thing does when touched: called each frame with seconds since, until it returns false. */
  readonly things: Record<string, (since: number) => boolean> = {};
  /** The moments playing now, by thing, and when each started (seconds on the room's clock). */
  readonly playing = new Map<string, number>();
  private switches = new Map<string, { now: number; want: number; speed: number; apply: Array<(level: number) => void> }>();
  private moods: Array<(mood: TableMood, instant: boolean) => void> = [];
  private mood: TableMood = "warm";
  private clock = 0;
  private relight = false;
  private primed = false;
  private floaters: Array<{ sprite: THREE.Sprite; start: number; from: THREE.Vector3; drift: number; rise: number }> = [];
  private textures = new Map<Floater, THREE.Texture>();

  constructor(private root: THREE.Object3D) {}

  /** Seconds on the room's clock, as of the last update. */
  get now() { return this.clock; }

  /** Makes `object` (and everything in it) the thing called `thing`. */
  tag = <T extends THREE.Object3D>(object: T, thing: string): T => {
    object.traverse((part) => { part.userData.thing = thing; });
    this.targets.push(object);
    return object;
  };

  /** A switch eases between off (0) and on (1); curtains between open (0) and drawn (1). */
  onSwitch = (id: string, apply: (level: number) => void, speed?: number) => {
    let entry = this.switches.get(id);
    if (!entry) {
      const start = id === "curtains" ? 0 : 1;
      this.switches.set(id, (entry = { now: start, want: start, speed: speed ?? (id === "fire" ? 0.9 : id === "curtains" ? 1.3 : 8), apply: [] }));
    }
    entry.apply.push(apply);
  };

  /** How on a switch is right now. */
  level = (id: string) => this.switches.get(id)?.now ?? 1;

  /** Whether a switch is set on (where it is heading, not where it is). */
  wanted = (id: string) => (this.switches.get(id)?.want ?? (id === "curtains" ? 0 : 1)) > 0.5;

  /** The tabletop's mood changing: `instant` when it is how the room already was. */
  onMood = (apply: (mood: TableMood, instant: boolean) => void) => { this.moods.push(apply); };

  get currentMood() { return this.mood; }

  /** Hearts, notes or sparks float up from a point and fade. */
  floatUp(kind: Floater, from: THREE.Vector3, count: number, colour = "#ffd27a") {
    let texture = this.textures.get(kind);
    if (!texture) {
      texture = canvasTexture(64, 64, (ctx) => {
        ctx.fillStyle = kind === "heart" ? "#ff5a7a" : colour;
        if (kind === "heart") {
          ctx.beginPath();
          ctx.moveTo(32, 56);
          ctx.bezierCurveTo(4, 36, 6, 10, 22, 10);
          ctx.bezierCurveTo(28, 10, 32, 16, 32, 20);
          ctx.bezierCurveTo(32, 16, 36, 10, 42, 10);
          ctx.bezierCurveTo(58, 10, 60, 36, 32, 56);
          ctx.fill();
        } else if (kind === "star") {
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
            const r = i % 2 ? 11 : 28;
            ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
          }
          ctx.fill();
        } else if (kind === "spark") {
          const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
          g.addColorStop(0, "#fff6d8"); g.addColorStop(0.3, colour); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 64, 64);
        } else {
          ctx.font = "bold 52px serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("♪", 32, 34);
        }
      });
      this.textures.set(kind, texture);
    }
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
      sprite.scale.setScalar(0.12);
      sprite.renderOrder = 7;
      this.root.add(sprite);
      const spread = kind === "spark" || kind === "star";
      this.floaters.push({ sprite, start: this.clock + i * (spread ? 0.03 : 0.35), from: from.clone(), drift: spread ? (Math.random() - 0.5) * 0.9 : (i - (count - 1) / 2) * 0.12, rise: spread ? 0.9 + Math.random() * 0.8 : 0.7 });
    }
  }

  /**
   * The view's handle on all this. `label` says what touching each thing does; `sounds` play with moments;
   * `switched` plays when a switch changes (a lamp's click by default).
   */
  api(options: { label: (id: string) => string | null; route?: (id: string) => Touch | null | undefined; sounds?: Record<string, () => void>; switched?: (id: string, on: boolean) => void; played?: (thing: string) => void }): RoomThings {
    return {
      targets: this.targets,
      route: (id) => {
        const chosen = options.route?.(id);
        if (chosen !== undefined) return chosen;
        if (id === "curtains") return { curtains: true };
        if (id === "mood") return { mood: true };
        if (this.switches.has(id)) return { switch: id };
        return this.things[id] ? { moment: id } : null;
      },
      label: options.label,
      set: ({ off, curtains, mood }) => {
        for (const [id, entry] of this.switches) {
          const want = id === "curtains" ? (curtains ? 1 : 0) : off.includes(id) ? 0 : 1;
          if (want === entry.want) continue;
          entry.want = want;
          if (!this.primed) {
            // The room as it already is when you walk in: no fades, no clicks.
            entry.now = want;
            for (const apply of entry.apply) apply(want);
            continue;
          }
          if (options.switched) options.switched(id, want === 1);
          else playSwitch(want === 1);
        }
        if (mood !== this.mood || !this.primed) {
          const instant = !this.primed;
          this.mood = mood;
          for (const apply of this.moods) apply(mood, instant);
          if (!instant) this.relight = true;
        }
        this.primed = true;
      },
      play: (thing) => {
        const moment = this.things[thing];
        if (!moment) return;
        this.playing.set(thing, this.clock);
        moment(0);
        options.sounds?.[thing]?.();
        options.played?.(thing);
      },
      busy: () => this.playing.size > 0 || this.floaters.length > 0 || [...this.switches.values()].some((entry) => entry.now !== entry.want),
      relit: () => {
        const was = this.relight;
        this.relight = false;
        return was;
      },
    };
  }

  /** Once a frame, from the room's update. */
  update(t: number, dt: number) {
    this.clock = t;
    for (const entry of this.switches.values()) {
      if (entry.now === entry.want) continue;
      const step = entry.speed * dt;
      entry.now = entry.want > entry.now ? Math.min(entry.want, entry.now + step) : Math.max(entry.want, entry.now - step);
      for (const apply of entry.apply) apply(entry.now);
      if (entry.now === entry.want) this.relight = true;
    }
    for (const [thing, start] of this.playing) if (!this.things[thing](t - start)) this.playing.delete(thing);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const floater = this.floaters[i];
      const k = (t - floater.start) / 1.8;
      floater.sprite.visible = k >= 0;
      if (k < 0) continue;
      if (k >= 1) {
        floater.sprite.removeFromParent();
        floater.sprite.material.dispose();
        this.floaters.splice(i, 1);
        continue;
      }
      floater.sprite.position.set(floater.from.x + floater.drift * (floater.rise > 0.8 ? k : 1) + Math.sin(k * 9) * 0.04, floater.from.y + k * floater.rise, floater.from.z + (floater.rise > 0.8 ? floater.drift * 0.6 * k : 0));
      floater.sprite.material.opacity = Math.sin(k * Math.PI);
      floater.sprite.scale.setScalar(0.08 + k * 0.08);
    }
  }

  /** Every switch shown as it starts (call once the room is built). */
  settle() {
    for (const entry of this.switches.values()) for (const apply of entry.apply) apply(entry.now);
  }

  dispose() {
    for (const texture of this.textures.values()) texture.dispose();
    for (const floater of this.floaters) floater.sprite.material.dispose();
  }
}

/**
 * A handful of popcorn jumping out of `from` and bouncing on the floor at `floorY` (a table top inside
 * `table`, if given): a moment for ThingKit.things. One instanced mesh, there from the start.
 */
export function popcornBurst(root: THREE.Object3D, from: THREE.Vector3, floorY: number, table?: { x: number; z: number; halfX: number; halfZ: number; y: number }) {
  const KERNELS = 16;
  const flying = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.018, 0), new THREE.MeshStandardMaterial({ color: "#fff3c4", roughness: 1 }), KERNELS);
  flying.count = 0;
  flying.frustumCulled = false;
  root.add(flying);
  const kernels = Array.from({ length: KERNELS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), spin: 0 }));
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const axis = new THREE.Vector3(0.3, 1, 0.2).normalize();
  const size = new THREE.Vector3();
  let last = 0;
  return (since: number) => {
    if (since === 0) {
      last = 0;
      for (const kernel of kernels) {
        kernel.p.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1));
        const a = Math.random() * Math.PI * 2;
        const out = 0.25 + Math.random() * 0.55;
        kernel.v.set(Math.cos(a) * out, 1.3 + Math.random() * 1.1, Math.sin(a) * out);
        kernel.spin = (Math.random() - 0.5) * 20;
      }
    }
    const dt = Math.min(0.05, since - last);
    last = since;
    flying.count = since < 2.4 ? KERNELS : 0;
    kernels.forEach((kernel, i) => {
      kernel.v.y -= 9.8 * dt;
      kernel.p.addScaledVector(kernel.v, dt);
      const onTable = table && Math.abs(kernel.p.x - table.x) < table.halfX && Math.abs(kernel.p.z - table.z) < table.halfZ;
      const ground = onTable ? table.y : floorY;
      if (kernel.p.y < ground) { kernel.p.y = ground; kernel.v.y *= -0.35; kernel.v.x *= 0.6; kernel.v.z *= 0.6; kernel.spin *= 0.5; }
      turn.setFromAxisAngle(axis, since * kernel.spin);
      const shrink = since > 1.9 ? Math.max(0.001, (2.4 - since) / 0.5) : 1;
      matrix.compose(kernel.p, turn, size.setScalar(shrink));
      flying.setMatrixAt(i, matrix);
    });
    flying.instanceMatrix.needsUpdate = true;
    return since < 2.4;
  };
}
