/**
 * Fishing at the meadow's pond. Cast from the jetty or the bank: the bobber
 * flies out and floats, and after a while something bites (it dips, a ring
 * spreads). Reel in while it is down and a fish leaps out of the water to
 * you; too early and it was only a nibble, too late and it got away.
 *
 * Only you see your line; a catch is announced to the room with a 🐟 over
 * your head. Your best catches are kept in this browser (the tackle box).
 */
import * as THREE from "three";
import { POND, WATER_Y } from "../lib/living-room";

export type FishRarity = "junk" | "common" | "uncommon" | "rare" | "legendary";

export interface Catch {
  name: string;
  emoji: string;
  rarity: FishRarity;
  /** Kilograms. */
  weight: number;
  colour: string;
}

interface Species { name: string; emoji: string; rarity: FishRarity; min: number; max: number; colour: string }

const SPECIES: Species[] = [
  { name: "Old boot", emoji: "🥾", rarity: "junk", min: 0.4, max: 0.9, colour: "#6b5440" },
  { name: "Tin can", emoji: "🥫", rarity: "junk", min: 0.1, max: 0.3, colour: "#9aa3ad" },
  { name: "Perch", emoji: "🐟", rarity: "common", min: 0.15, max: 0.9, colour: "#9bb35a" },
  { name: "Roach", emoji: "🐟", rarity: "common", min: 0.1, max: 0.6, colour: "#b7c2c9" },
  { name: "Bream", emoji: "🐟", rarity: "common", min: 0.4, max: 2.5, colour: "#c2a46a" },
  { name: "Trout", emoji: "🐟", rarity: "uncommon", min: 0.5, max: 3, colour: "#d08a7a" },
  { name: "Carp", emoji: "🐟", rarity: "uncommon", min: 1, max: 8, colour: "#b8862f" },
  { name: "Pike", emoji: "🐊", rarity: "uncommon", min: 1.5, max: 9, colour: "#6d8a4a" },
  { name: "Catfish", emoji: "🐟", rarity: "rare", min: 3, max: 20, colour: "#6b6458" },
  { name: "Golden carp", emoji: "✨", rarity: "rare", min: 1, max: 5, colour: "#f2c14e" },
  { name: "Koi", emoji: "🎏", rarity: "rare", min: 1, max: 6, colour: "#f06a3a" },
  { name: "Pond Blåhaj", emoji: "🦈", rarity: "legendary", min: 0.5, max: 0.5, colour: "#5a8fb8" },
];
const ODDS: Array<[FishRarity, number]> = [["junk", 0.07], ["common", 0.55], ["uncommon", 0.27], ["rare", 0.095], ["legendary", 0.015]];

function pickCatch(): Catch {
  let roll = Math.random();
  let rarity: FishRarity = "common";
  for (const [tier, chance] of ODDS) {
    if (roll < chance) { rarity = tier; break; }
    roll -= chance;
  }
  const pool = SPECIES.filter((species) => species.rarity === rarity);
  const species = pool[Math.floor(Math.random() * pool.length)];
  // Most fish are small; a few are whoppers.
  const size = Math.pow(Math.random(), 2.2);
  const weight = Math.round((species.min + (species.max - species.min) * size) * 100) / 100;
  return { name: species.name, emoji: species.emoji, rarity, weight, colour: species.colour };
}

export type FishingPhase =
  | { phase: "idle" }
  | { phase: "waiting" }
  | { phase: "bite" }
  | { phase: "caught"; fish: Catch }
  | { phase: "lost"; reason: string };

const CAST_SECONDS = 0.7;
const BITE_WINDOW = 1.4;

/** A quiet plop for the bobber landing, a bite, and a splash for a catch. */
function splash(volume = 0.25, low = 300) {
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    const ctx = new AudioContext();
    const length = Math.floor(ctx.sampleRate * 0.35);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = low;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    source.onended = () => void ctx.close();
  } catch {
    // No audio here: silent fishing.
  }
}

export class FishingRod {
  private readonly group = new THREE.Group();
  private readonly bobber: THREE.Group;
  private readonly line: THREE.Line;
  private readonly ring: THREE.Mesh;
  private readonly fish: THREE.Mesh;
  /** The rod itself, held out from your hands to the tip. */
  private readonly rod: THREE.Mesh;
  private state: "idle" | "casting" | "waiting" | "bite" | "landing" = "idle";
  private castAt = 0;
  private biteAt = 0;
  private landAt = 0;
  private landed: Catch | null = null;
  private readonly from = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private now = 0;

  constructor(parent: THREE.Object3D, private readonly onPhase: (phase: FishingPhase) => void) {
    // A red and white float.
    this.bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#e03131", roughness: 0.4 }));
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#f8f9fa", roughness: 0.4 }));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), new THREE.MeshStandardMaterial({ color: "#e03131" }));
    stick.position.y = 0.1;
    this.bobber.add(top, bottom, stick);
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 16 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: "#f1f3f5", transparent: true, opacity: 0.7 }));
    this.line.frustumCulled = false;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 32), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    // The fish on its way out of the water: a squashed, tailed spindle.
    const body = new THREE.SphereGeometry(0.12, 14, 10);
    body.scale(2.2, 0.8, 0.6);
    this.fish = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: "#9bb35a", roughness: 0.35, metalness: 0.3 }));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 4), this.fish.material);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.32;
    this.fish.add(tail);
    const rodGeometry = new THREE.CylinderGeometry(0.008, 0.02, 1, 6);
    rodGeometry.translate(0, 0.5, 0);
    this.rod = new THREE.Mesh(rodGeometry, new THREE.MeshStandardMaterial({ color: "#3b2a1a", roughness: 0.6 }));
    this.group.add(this.bobber, this.line, this.ring, this.fish, this.rod);
    this.group.visible = false;
    parent.add(this.group);
  }

  busy() {
    return this.state !== "idle";
  }

  /** Where a cast from `from` (the rod tip) heading `facing` lands: in the water, never on the bank. */
  static target(from: THREE.Vector3, facing: number): THREE.Vector3 {
    const ahead = new THREE.Vector3(from.x + Math.sin(facing) * 3.4, WATER_Y, from.z - Math.cos(facing) * 3.4);
    const fromCentre = Math.hypot(ahead.x - POND.x, ahead.z - POND.z);
    if (fromCentre < POND.radius * 0.85) return ahead;
    // Facing away from the water: cast towards the middle instead.
    const toward = new THREE.Vector3(POND.x - from.x, 0, POND.z - from.z).normalize();
    const reach = Math.min(3.4, Math.max(1.2, Math.hypot(POND.x - from.x, POND.z - from.z) - 0.6));
    return new THREE.Vector3(from.x + toward.x * reach, WATER_Y, from.z + toward.z * reach);
  }

  cast(from: THREE.Vector3, facing: number) {
    if (this.state !== "idle") return;
    this.from.copy(from);
    this.at.copy(FishingRod.target(from, facing));
    this.state = "casting";
    this.castAt = this.now;
    // Something bites after a while: rarely at once, sometimes a long wait.
    this.biteAt = this.now + CAST_SECONDS + 2.5 + Math.random() * 8;
    this.group.visible = true;
    this.fish.visible = false;
    this.onPhase({ phase: "waiting" });
  }

  /** Pull in: on a bite, a catch; otherwise you have scared it off. */
  reel() {
    if (this.state === "bite") {
      const fish = pickCatch();
      this.landed = fish;
      this.state = "landing";
      this.landAt = this.now;
      (this.fish.material as THREE.MeshStandardMaterial).color.set(fish.colour);
      this.fish.scale.setScalar(0.7 + Math.min(1.6, Math.sqrt(fish.weight) * 0.45));
      this.fish.visible = true;
      this.bobber.visible = false;
      splash(0.4, 500);
      return;
    }
    if (this.state === "casting" || this.state === "waiting") this.stop({ phase: "lost", reason: "Too early: it was only a nibble." });
  }

  /** Walked off, or left: wind the line in. */
  cancel() {
    if (this.state !== "idle") this.stop({ phase: "idle" });
  }

  private stop(phase: FishingPhase) {
    this.state = "idle";
    this.group.visible = false;
    this.bobber.visible = true;
    this.onPhase(phase);
  }

  /** `tip` is where the rod's end is now (it follows you), or null if you are not here. */
  update(t: number, tip: THREE.Vector3 | null) {
    this.now = t;
    if (this.state === "idle") return;
    if (!tip) { this.cancel(); return; }
    // Wandered off with the line out: reel it in.
    if (Math.hypot(tip.x - this.from.x, tip.z - this.from.z) > 1.6 && this.state !== "landing") { this.cancel(); return; }
    this.from.copy(tip);
    const bob = this.bobber.position;
    const ringMaterial = this.ring.material as THREE.MeshBasicMaterial;
    if (this.state === "casting") {
      const k = Math.min(1, (t - this.castAt) / CAST_SECONDS);
      bob.lerpVectors(this.from, this.at, k);
      bob.y = this.from.y + (this.at.y - this.from.y) * k + Math.sin(Math.PI * k) * 1.2;
      if (k >= 1) {
        this.state = "waiting";
        this.ripple(t);
        splash(0.12, 700);
      }
    } else if (this.state === "waiting") {
      bob.copy(this.at);
      bob.y = WATER_Y + Math.sin(t * 2.1) * 0.012;
      if (t >= this.biteAt) {
        this.state = "bite";
        this.biteAt = t;
        this.ripple(t);
        splash(0.2, 400);
        this.onPhase({ phase: "bite" });
      }
    } else if (this.state === "bite") {
      // Tugged under, again and again.
      bob.copy(this.at);
      bob.y = WATER_Y - 0.06 - Math.abs(Math.sin((t - this.biteAt) * 11)) * 0.07;
      bob.x += Math.sin(t * 17) * 0.02;
      if (t - this.biteAt > BITE_WINDOW) this.stop({ phase: "lost", reason: "Too slow: it got away." });
    } else if (this.state === "landing") {
      // The fish leaps from the water to you.
      const k = Math.min(1, (t - this.landAt) / 0.8);
      this.fish.position.lerpVectors(this.at, this.from, k);
      this.fish.position.y = WATER_Y + (this.from.y - 0.4 - WATER_Y) * k + Math.sin(Math.PI * k) * 1.4;
      this.fish.rotation.set(0, Math.atan2(this.from.x - this.at.x, this.from.z - this.at.z) - Math.PI / 2, Math.sin(t * 20) * 0.4 + (k - 0.5) * 1.2);
      bob.copy(this.fish.position);
      if (k >= 1) {
        const fish = this.landed!;
        this.landed = null;
        this.stop({ phase: "caught", fish });
        return;
      }
    }
    // The rod: from about the hands, angled up and out to the tip; it bends down a little on a bite.
    const out = new THREE.Vector3(this.at.x - this.from.x, 0, this.at.z - this.from.z).normalize();
    const hands = this.from.clone().addScaledVector(out, -1.1).add(new THREE.Vector3(0, this.state === "bite" ? -0.35 : -0.55, 0));
    const length = hands.distanceTo(this.from);
    this.rod.position.copy(hands);
    this.rod.scale.set(1, length, 1);
    this.rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.from.clone().sub(hands).normalize());
    // The ring spreads and fades.
    const age = t - (this.ring.userData.at as number ?? -10);
    ringMaterial.opacity = Math.max(0, 0.7 - age * 0.6);
    this.ring.scale.setScalar(1 + age * 4);
    this.ring.position.set(this.at.x, WATER_Y + 0.01, this.at.z);
    // The line sags from the tip to the float.
    const points = this.line.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < points.count; i++) {
      const k = i / (points.count - 1);
      const sag = this.state === "bite" || this.state === "landing" ? 0.05 : 0.35;
      points.setXYZ(i,
        this.from.x + (bob.x - this.from.x) * k,
        this.from.y + (bob.y + 0.12 - this.from.y) * k - Math.sin(Math.PI * k) * sag,
        this.from.z + (bob.z - this.from.z) * k);
    }
    points.needsUpdate = true;
  }

  private ripple(t: number) {
    this.ring.userData.at = t;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.group.traverse((part) => {
      const mesh = part as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    });
  }
}

/* ---------- the tackle box: your best catches, kept in this browser ---------- */

export interface TackleEntry { name: string; emoji: string; rarity: FishRarity; count: number; best: number }
const TACKLE_KEY = "huddle_tackle_box";

export function readTackle(): Record<string, TackleEntry> {
  try {
    const raw = JSON.parse(localStorage.getItem(TACKLE_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/** Records a catch; says whether it beat your best of that kind. */
export function recordCatch(fish: Catch): { log: Record<string, TackleEntry>; record: boolean } {
  const log = readTackle();
  const entry = log[fish.name];
  const record = !entry || fish.weight > entry.best;
  log[fish.name] = { name: fish.name, emoji: fish.emoji, rarity: fish.rarity, count: (entry?.count ?? 0) + 1, best: Math.max(entry?.best ?? 0, fish.weight) };
  try { localStorage.setItem(TACKLE_KEY, JSON.stringify(log)); } catch { /* private mode: not kept */ }
  return { log, record };
}
