/**
 * The Living Room: a small shared room a voice channel can hang out in.
 *
 * Everyone in the call has a spot on the floor (or a seat) and a heading.
 * Where people are is what you hear: a voice across the room is quieter and
 * comes from over there, the person next to you on the couch is right at your
 * shoulder. Positions are in metres, +X east, +Z south, and a heading of 0
 * faces north (-Z), towards the fireplace.
 *
 * The floor plan is shared by every client whatever theme they look at it in;
 * only the furnishings' looks change per theme.
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
export const ROOM_HALF_X = 6;
export const ROOM_HALF_Z = 4.5;
export const ROOM_HEIGHT = 3;

/** Bodies keep this far from the walls. */
const WALL_MARGIN = 0.35;

/** The quiet window nook: inside it you are only half-heard from the rest of the room. */
export const NOOK = { x: 4.85, z: 2.75, radius: 1.25 };

/** Heading that looks from one point to another. */
export function headingTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, -(to.z - from.z));
}

const HEARTH = { x: 0, z: -1.2 };
const facingHearth = (x: number, z: number) => headingTo({ x, z }, HEARTH);

export const LOUNGE_SEATS: LoungeSeat[] = [
  { id: "couch-l", label: "Couch", x: -0.8, z: 0.6, facing: 0, height: 0.45 },
  { id: "couch-m", label: "Couch", x: 0, z: 0.6, facing: 0, height: 0.45 },
  { id: "couch-r", label: "Couch", x: 0.8, z: 0.6, facing: 0, height: 0.45 },
  { id: "love-1", label: "Loveseat", x: -2.75, z: -1.9, facing: Math.PI / 2, height: 0.45 },
  { id: "love-2", label: "Loveseat", x: -2.75, z: -1.05, facing: Math.PI / 2, height: 0.45 },
  { id: "arm-e", label: "Armchair", x: 2.75, z: -1.45, facing: -Math.PI / 2, height: 0.45 },
  { id: "cushion-1", label: "Fireside cushion", x: -0.95, z: -3.05, facing: facingHearth(-0.95, -3.05), height: 0.12 },
  { id: "cushion-2", label: "Fireside cushion", x: 0.95, z: -3.05, facing: facingHearth(0.95, -3.05), height: 0.12 },
  { id: "bean-1", label: "Beanbag", x: -2.3, z: 1.0, facing: facingHearth(-2.3, 1.0), height: 0.25 },
  { id: "bean-2", label: "Beanbag", x: 2.3, z: 1.0, facing: facingHearth(2.3, 1.0), height: 0.25 },
  { id: "read-1", label: "Reading chair", x: -4.85, z: 3.2, facing: facingHearth(-4.85, 3.2), height: 0.45 },
  { id: "nook-1", label: "Window nook", x: 5.25, z: 2.35, facing: headingTo({ x: 5.25, z: 2.35 }, { x: 4.5, z: 3.4 }), height: 0.45 },
  { id: "nook-2", label: "Window nook", x: 4.5, z: 3.4, facing: headingTo({ x: 4.5, z: 3.4 }, { x: 5.25, z: 2.35 }), height: 0.42 },
];

export const seatById = (id: string | null | undefined) => LOUNGE_SEATS.find((seat) => seat.id === id) ?? null;

/** Sitting right where you are, on the floor or the rug: a pose's seat, not a place. */
export const FLOOR_SEAT = "floor";

/** How high someone's voice (and eyes) are for a seat. */
export const earHeight = (seat: string | null) => (seat === FLOOR_SEAT ? 0.7 : seat ? 0.95 : 1.55);

const finite = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function wrapHeading(radians: number): number {
  const turn = 2 * Math.PI;
  return ((finite(radians) + Math.PI) % turn + turn) % turn - Math.PI;
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
    seat: seat === FLOOR_SEAT ? FLOOR_SEAT : null,
  };
}

/**
 * Where someone who has not picked a spot is: the first free seat, or a ring
 * around the rug, in a stable order every client agrees on.
 */
export function defaultPoses(ids: string[], taken: Map<string, LoungePose>): Map<string, LoungePose> {
  const result = new Map(taken);
  const busy = new Set([...taken.values()].map((pose) => pose.seat).filter((seat) => seat && seat !== FLOOR_SEAT));
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
    const x = Math.sin(angle) * 2.1;
    const z = HEARTH.z + 0.2 + Math.cos(angle) * 1.4;
    result.set(id, { x, z, facing: headingTo({ x, z }, HEARTH), seat: null });
  }
  return result;
}

/** The first free seat, for someone walking in. */
export function freeSeat(others: Iterable<LoungePose>): LoungeSeat | null {
  const busy = new Set([...others].map((pose) => pose.seat));
  return LOUNGE_SEATS.find((seat) => !busy.has(seat.id)) ?? null;
}

export const inNook = (pose: LoungePose) => Math.hypot(pose.x - NOOK.x, pose.z - NOOK.z) <= NOOK.radius;

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
  const height = earHeight(speaker.seat) - earHeight(listener.seat);
  const distance = Math.hypot(dx, dz);
  // Never inside the head: a voice closer than half a metre is held there.
  const scale = distance < 0.5 ? 0.5 / Math.max(distance, 1e-3) : 1;
  const flat = distance < 1e-3 ? { x: 0, z: -0.5 } : { x: right * scale, z: -ahead * scale };
  const pan = distance < 1e-3 ? 0 : 0.65 * Math.max(-1, Math.min(1, right / Math.max(distance, 0.5)));
  // The nook keeps a conversation private-ish: in or out, the other side is muffled.
  const privacy = inNook(listener) !== inNook(speaker) ? 0.3 : 1;
  const attenuation = privacy / (1 + 0.2 * Math.max(0, distance - 1.2));
  return { seat: { x: flat.x, y: height, z: flat.z }, pan, attenuation, privacy, distance };
}

/** Emotes anyone can send; anything else on the wire is dropped. */
export const LOUNGE_EMOTES = ["👋", "😂", "❤️", "🎉", "🔥", "👏", "😮", "🍿"] as const;
export const isLoungeEmote = (value: unknown): value is string =>
  typeof value === "string" && (LOUNGE_EMOTES as readonly string[]).includes(value);

/** Furniture you walk around, not through. */
export const SOLIDS = [
  { x0: -1.35, x1: 1.35, z0: 0.35, z1: 1.35 }, // couch
  { x0: -3.2, x1: -2.4, z0: -2.4, z1: -0.55 }, // loveseat
  { x0: 2.35, x1: 3.2, z0: -1.9, z1: -1.0 }, // armchair
  { x0: -1.4, x1: 1.4, z0: -4.5, z1: -3.85 }, // fireplace
  { x0: -0.7, x1: 0.7, z0: -1.55, z1: -0.85 }, // coffee table
];

/** Moving a step: stops at walls, and furniture is solid. */
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
