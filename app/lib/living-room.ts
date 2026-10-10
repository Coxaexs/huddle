/**
 * The Living Room: a small shared room a voice channel can hang out in.
 *
 * Everyone in the call has a spot on the floor (or a seat on the couch) and a
 * heading. Where people are is what you hear: a voice across the room is
 * quieter and comes from over there, the person next to you on the couch is
 * right at your shoulder. Positions are in metres, +X east, +Z south, and a
 * heading of 0 faces north (-Z), towards the fireplace.
 */
import type { Vector } from "./spatial-audio";

export interface LoungePose {
  x: number;
  z: number;
  /** Radians; 0 faces the fireplace, positive turns right (clockwise from above). */
  facing: number;
  seat: string | null;
}

export interface LoungeSeat { id: string; label: string; x: number; z: number; facing: number; height: number }

/** Half extents of the floor. */
export const ROOM_HALF_X = 4;
export const ROOM_HALF_Z = 3;

/** Bodies keep this far from the walls. */
const WALL_MARGIN = 0.35;

/** The quiet corner: inside it you are only half-heard from the rest of the room. */
export const NOOK = { x: 3.1, z: 2.1, radius: 0.95 };

export const LOUNGE_SEATS: LoungeSeat[] = [
  { id: "couch-l", label: "Couch", x: -0.75, z: 0.75, facing: 0, height: 0.45 },
  { id: "couch-m", label: "Couch", x: 0, z: 0.75, facing: 0, height: 0.45 },
  { id: "couch-r", label: "Couch", x: 0.75, z: 0.75, facing: 0, height: 0.45 },
  { id: "arm-w", label: "Armchair", x: -2.1, z: -0.55, facing: Math.PI / 2.6, height: 0.45 },
  { id: "arm-e", label: "Armchair", x: 2.1, z: -0.55, facing: -Math.PI / 2.6, height: 0.45 },
  { id: "bean-1", label: "Beanbag", x: -1.1, z: -1.35, facing: Math.PI * 0.85, height: 0.25 },
  { id: "bean-2", label: "Beanbag", x: 1.1, z: -1.35, facing: -Math.PI * 0.85, height: 0.25 },
  { id: "nook-1", label: "Window nook", x: 3.15, z: 1.75, facing: -2.55, height: 0.42 },
  { id: "nook-2", label: "Window nook", x: 2.75, z: 2.35, facing: 0.59, height: 0.42 },
];

export const seatById = (id: string | null | undefined) => LOUNGE_SEATS.find((seat) => seat.id === id) ?? null;

const finite = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function wrapHeading(radians: number): number {
  const turn = 2 * Math.PI;
  const wrapped = ((finite(radians) + Math.PI) % turn + turn) % turn - Math.PI;
  return wrapped;
}

/** Whatever arrives over the wire becomes a pose inside the room, or null. */
export function clampPose(raw: unknown): LoungePose | null {
  if (!raw || typeof raw !== "object") return null;
  const { x, z, facing, seat } = raw as Record<string, unknown>;
  if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const known = typeof seat === "string" ? seatById(seat) : null;
  if (known) return { x: known.x, z: known.z, facing: known.facing, seat: known.id };
  return {
    x: Math.max(-ROOM_HALF_X + WALL_MARGIN, Math.min(ROOM_HALF_X - WALL_MARGIN, x)),
    z: Math.max(-ROOM_HALF_Z + WALL_MARGIN, Math.min(ROOM_HALF_Z - WALL_MARGIN, z)),
    facing: wrapHeading(finite(facing)),
    seat: null,
  };
}

/**
 * Where someone who has not picked a spot stands: a ring around the rug, in a
 * stable order every client agrees on, skipping seats already taken.
 */
export function defaultPoses(ids: string[], taken: Map<string, LoungePose>): Map<string, LoungePose> {
  const result = new Map(taken);
  const busy = new Set([...taken.values()].map((pose) => pose.seat).filter(Boolean));
  let ring = 0;
  for (const id of ids) {
    if (result.has(id)) continue;
    const seat = LOUNGE_SEATS.find((candidate) => !busy.has(candidate.id));
    if (seat) {
      busy.add(seat.id);
      result.set(id, { x: seat.x, z: seat.z, facing: seat.facing, seat: seat.id });
      continue;
    }
    const angle = (ring++ * 2.4) % (2 * Math.PI);
    const x = Math.sin(angle) * 1.6;
    const z = -0.3 + Math.cos(angle) * 1.2;
    result.set(id, { x, z, facing: headingTo({ x, z }, { x: 0, z: -0.3 }), seat: null });
  }
  return result;
}

/** The first free seat, for someone walking in. */
export function freeSeat(others: Iterable<LoungePose>): LoungeSeat | null {
  const busy = new Set([...others].map((pose) => pose.seat));
  return LOUNGE_SEATS.find((seat) => !busy.has(seat.id)) ?? null;
}

export const inNook = (pose: LoungePose) => Math.hypot(pose.x - NOOK.x, pose.z - NOOK.z) <= NOOK.radius;

/** Heading that looks from one point to another. */
export function headingTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, -(to.z - from.z));
}

export interface HeardFrom {
  /** Source position in the listener's Web Audio frame (listener at origin facing -Z). */
  seat: Vector;
  /** Stereo pan for loudspeakers, -0.65..0.65. */
  pan: number;
  /** Extra gain for loudspeakers, where nothing else models distance. */
  attenuation: number;
  /** Gain under HRTF, where the panner already models distance: only the nook's muffling. */
  privacy: number;
  /** Straight-line distance in metres. */
  distance: number;
}

/**
 * Turns two room poses into how the listener should hear the speaker. The room
 * frame is rotated into the listener's own: whatever is ahead of their body is
 * -Z, to their right is +X. A seated voice comes from a little lower.
 */
export function hearFrom(listener: LoungePose, speaker: LoungePose): HeardFrom {
  const dx = speaker.x - listener.x;
  const dz = speaker.z - listener.z;
  const [s, c] = [Math.sin(listener.facing), Math.cos(listener.facing)];
  // Forward is (sin f, -cos f); right is (cos f, sin f).
  const right = dx * c + dz * s;
  const ahead = dx * s - dz * c;
  const height = (speaker.seat ? 0.95 : 1.55) - (listener.seat ? 0.95 : 1.55);
  const distance = Math.hypot(dx, dz);
  // Never inside the head: a voice closer than half a metre is held there.
  const scale = distance < 0.5 ? 0.5 / Math.max(distance, 1e-3) : 1;
  const flat = distance < 1e-3 ? { x: 0, z: -0.5 } : { x: right * scale, z: -ahead * scale };
  const pan = distance < 1e-3 ? 0 : 0.65 * Math.max(-1, Math.min(1, right / Math.max(distance, 0.5)));
  // The nook keeps a conversation private-ish: in or out, the other side is muffled.
  const privacy = inNook(listener) !== inNook(speaker) ? 0.3 : 1;
  const attenuation = privacy / (1 + 0.22 * Math.max(0, distance - 1.2));
  return { seat: { x: flat.x, y: height, z: flat.z }, pan, attenuation, privacy, distance };
}

/** Emotes anyone can send; anything else on the wire is dropped. */
export const LOUNGE_EMOTES = ["👋", "😂", "❤️", "🎉", "🔥", "👏", "😮", "🍿"] as const;
export const isLoungeEmote = (value: unknown): value is string =>
  typeof value === "string" && (LOUNGE_EMOTES as readonly string[]).includes(value);

/** Moving a step: stops at walls, and the couch and fireplace are solid. */
export function stepTo(pose: LoungePose, target: { x: number; z: number }): LoungePose {
  const next = clampPose({ x: target.x, z: target.z, facing: pose.facing, seat: null }) ?? pose;
  const inside = (p: { x: number; z: number }, box: (typeof SOLIDS)[number]) =>
    p.x > box.x0 && p.x < box.x1 && p.z > box.z0 && p.z < box.z1;
  for (const box of SOLIDS) {
    // Getting up off the couch starts inside it; only walking in is blocked.
    if (inside(next, box) && !inside(pose, box)) return { ...pose, seat: null };
  }
  return next;
}

/** Furniture you walk around, not through. */
export const SOLIDS = [
  { x0: -1.3, x1: 1.3, z0: 0.55, z1: 1.35 }, // couch
  { x0: -1.0, x1: 1.0, z0: -3, z1: -2.45 }, // fireplace
  { x0: -0.55, x1: 0.55, z0: -0.75, z1: -0.15 }, // coffee table
];
