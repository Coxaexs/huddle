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

export interface LoungeSeat {
  id: string; label: string; x: number; z: number; facing: number;
  /** Height of the seat itself above the floor under it. */
  height: number;
  /** Height of the floor under it, where the room has tiers. */
  y?: number;
}

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

/** Two cushion circles on the south floor, for conversations of their own: ten more seats. */
export const CIRCLES = [
  { id: "circ-w", x: -1.9, z: 3.2, radius: 0.85 },
  { id: "circ-e", x: 1.9, z: 3.2, radius: 0.85 },
];
const CIRCLE_SEATS: LoungeSeat[] = CIRCLES.flatMap((circle) =>
  Array.from({ length: 5 }, (_, i) => {
    const angle = (i / 5) * Math.PI * 2 + Math.PI / 5;
    const x = Math.round((circle.x + Math.sin(angle) * circle.radius) * 100) / 100;
    const z = Math.round((circle.z + Math.cos(angle) * circle.radius) * 100) / 100;
    return { id: `${circle.id}-${i}`, label: "Floor cushion", x, z, facing: headingTo({ x, z }, circle), height: 0.12 };
  }),
);

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
  ...CIRCLE_SEATS,
];

/** Sitting right where you are, on the floor or the rug: a pose's seat, not a place. */
export const FLOOR_SEAT = "floor";

/** How high someone's voice (and eyes) are for a seat, above the floor they are on. */
export const earHeight = (seat: string | null) => (seat === FLOOR_SEAT ? 0.7 : seat ? 0.95 : 1.55);

const finite = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function wrapHeading(radians: number): number {
  const turn = 2 * Math.PI;
  return ((finite(radians) + Math.PI) % turn + turn) % turn - Math.PI;
}

/** Furniture you walk around, not through. */
export const SOLIDS = [
  { x0: -1.35, x1: 1.35, z0: 0.35, z1: 1.35 }, // couch
  { x0: -3.2, x1: -2.4, z0: -2.4, z1: -0.55 }, // loveseat
  { x0: 2.35, x1: 3.2, z0: -1.9, z1: -1.0 }, // armchair
  { x0: -1.4, x1: 1.4, z0: -4.5, z1: -3.85 }, // fireplace
  { x0: -0.7, x1: 0.7, z0: -1.55, z1: -0.85 }, // coffee table
];

/** Corners dressed with props, so a crowd leaves the floor there clear. */
export const PROP_ZONES = [
  { x: 4.7, z: -2.6, radius: 1.3 },
  { x: -4.6, z: -3.2, radius: 1.3 },
  { x: -2.1, z: -3.6, radius: 0.55 },
];

type Box = { x0: number; x1: number; z0: number; z1: number };
type Spot = { x: number; z: number };

export type VenueId = "lounge" | "cinema" | "tabletop";
export const VENUE_IDS: readonly VenueId[] = ["lounge", "cinema", "tabletop"];
export const isVenueId = (value: unknown): value is VenueId => typeof value === "string" && (VENUE_IDS as readonly string[]).includes(value);

/**
 * A place the call can hang out in. Every venue has a floor plan, seats and
 * furniture to walk around; the pose maths below works the same in all of them.
 */
export interface Venue {
  id: VenueId;
  label: string;
  halfX: number;
  halfZ: number;
  height: number;
  /** In the order people are seated when they have not chosen: the best seats first. */
  seats: LoungeSeat[];
  seatIndex: Map<string, LoungeSeat>;
  solids: Box[];
  nook: { x: number; z: number; radius: number } | null;
  /** Where the screen hangs, and so where the music bot is heard from. */
  tv: { x: number; z: number; height: number };
  /** Where people face when they have no seat. */
  focus: Spot;
  /** Open floor for those without a seat: a stable order every client agrees on. */
  crowd: Spot[];
  /** Where someone arriving without a seat steps in. */
  spawn: Spot;
  /** Height of the floor at a point, where it has tiers. */
  floorY: (x: number, z: number) => number;
  /** Most people the room is meant for. */
  capacity: number;
  /** A staff-only room behind a door in the far wall (the cinema's projection booth). */
  annex?: Annex;
}

/** A room off the hall: through a door in the wall at `z0`, out to `z1`. Only those allowed in can walk through. */
export interface Annex { x0: number; x1: number; z0: number; z1: number; doorX: number; doorHalf: number }

/**
 * Open floor for a crowd: a grid of spots `step` metres apart, nearest `centre`
 * first, with furniture, seats and the walls left clear. Built once; every
 * client derives the same list, so everyone agrees who stands where.
 */
function crowdSpots(opts: {
  halfX: number; halfZ: number; solids: Box[]; seats: LoungeSeat[]; centre: Spot;
  margin?: number; top?: number; step?: number; avoid?: Array<Spot & { radius: number }>;
}): Spot[] {
  const { halfX, halfZ, solids, seats, centre, margin = 0.6, top = 1.2, step = 0.8, avoid = [] } = opts;
  const spots: Spot[] = [];
  const clear = 0.3;
  for (let x = -halfX + margin; x <= halfX - margin; x += step) {
    for (let z = -halfZ + top; z <= halfZ - margin; z += step) {
      if (solids.some((b) => x > b.x0 - clear && x < b.x1 + clear && z > b.z0 - clear && z < b.z1 + clear)) continue;
      if (seats.some((seat) => Math.hypot(seat.x - x, seat.z - z) < 0.55)) continue;
      if (avoid.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius)) continue;
      spots.push({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 });
    }
  }
  return spots.sort((a, b) => Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z) || a.x - b.x || a.z - b.z);
}

const indexSeats = (seats: LoungeSeat[]) => new Map(seats.map((seat) => [seat.id, seat]));

export const LOUNGE: Venue = {
  id: "lounge",
  label: "Living room",
  halfX: ROOM_HALF_X,
  halfZ: ROOM_HALF_Z,
  height: ROOM_HEIGHT,
  seats: LOUNGE_SEATS,
  seatIndex: indexSeats(LOUNGE_SEATS),
  solids: SOLIDS,
  nook: NOOK,
  tv: { x: 0, z: -ROOM_HALF_Z + 0.5, height: 2.15 },
  focus: HEARTH,
  crowd: crowdSpots({
    halfX: ROOM_HALF_X, halfZ: ROOM_HALF_Z, solids: SOLIDS, seats: LOUNGE_SEATS, centre: { x: 0, z: 0.4 },
    avoid: [{ x: NOOK.x, z: NOOK.z, radius: NOOK.radius }, ...PROP_ZONES.map((zone) => ({ ...zone }))],
  }),
  spawn: { x: 0, z: 1.8 },
  floorY: () => 0,
  capacity: 40,
};

/**
 * The cinema: a tiered hall of 150 seats, ten rows of three blocks of five,
 * facing a big screen. Each row sits 30 cm above the one in front.
 */
export const CINEMA_ROWS = 10;
export const CINEMA_BLOCKS = [-4.5, 0, 4.5];
export const CINEMA_SEAT_PITCH = 0.72;
export const CINEMA_ROW_PITCH = 0.95;
export const CINEMA_RISE = 0.3;
export const CINEMA_FIRST_ROW_Z = -3.6;

const cinemaFloorY = (_x: number, z: number) => {
  const row = Math.floor((z - (CINEMA_FIRST_ROW_Z - CINEMA_ROW_PITCH / 2)) / CINEMA_ROW_PITCH);
  return Math.max(0, Math.min(CINEMA_ROWS - 1, row)) * CINEMA_RISE;
};

const CINEMA_SEATS: LoungeSeat[] = (() => {
  const seats: LoungeSeat[] = [];
  for (let row = 0; row < CINEMA_ROWS; row++) {
    for (let block = 0; block < CINEMA_BLOCKS.length; block++) {
      for (let i = 0; i < 5; i++) {
        const x = Math.round((CINEMA_BLOCKS[block] + (i - 2) * CINEMA_SEAT_PITCH) * 100) / 100;
        const z = Math.round((CINEMA_FIRST_ROW_Z + row * CINEMA_ROW_PITCH) * 100) / 100;
        seats.push({ id: `cin-${row}-${block * 5 + i}`, label: `Row ${row + 1}, seat ${block * 5 + i + 1}`, x, z, facing: 0, height: 0.45, y: row * CINEMA_RISE });
      }
    }
  }
  // Best seats first: about two thirds back, in the middle.
  return seats.sort((a, b) => Math.hypot(a.x, a.z - 1.0) - Math.hypot(b.x, b.z - 1.0) || a.x - b.x);
})();

export const CINEMA: Venue = {
  id: "cinema",
  label: "Cinema",
  halfX: 7,
  halfZ: 8,
  height: 6,
  seats: CINEMA_SEATS,
  seatIndex: indexSeats(CINEMA_SEATS),
  solids: [],
  nook: null,
  tv: { x: 0, z: -7.6, height: 3.3 },
  focus: { x: 0, z: -7.6 },
  crowd: crowdSpots({
    halfX: 7, halfZ: 8, solids: [], seats: CINEMA_SEATS, centre: { x: 0, z: -5.5 }, margin: 0.8, top: 0.8, step: 0.9,
    // The tiers are for the seats; standing room is the stage in front and the walkway behind.
    avoid: [{ x: 0, z: 0.7, radius: 0 }],
  }).filter((spot) => spot.z < CINEMA_FIRST_ROW_Z - 0.7 || spot.z > CINEMA_FIRST_ROW_Z + (CINEMA_ROWS - 1) * CINEMA_ROW_PITCH + 0.9),
  spawn: { x: 0, z: -5.6 },
  floorY: cinemaFloorY,
  capacity: 150,
  // The projection booth: behind the back wall, on the walkway's level, through a door in the left aisle.
  annex: { x0: -5, x1: 5, z0: 8, z1: 11.4, doorX: -3.5, doorHalf: 0.7 },
};

/** Is this pose inside the venue's annex (the booth), past the door? */
export const inAnnex = (pose: { z: number }, venue: Venue): boolean => !!venue.annex && pose.z > venue.annex.z0 + 0.2;

/** The tabletop room: a round table with ten chairs, and room to stand around it. */
export const TABLE_CENTRE = { x: 0, z: 0.3 };
export const TABLE_RADIUS = 1.5;
const TABLE_CHAIRS = 10;
const TABLETOP_SEATS: LoungeSeat[] = Array.from({ length: TABLE_CHAIRS }, (_, i) => {
  const angle = (i / TABLE_CHAIRS) * Math.PI * 2 + Math.PI / TABLE_CHAIRS;
  const x = Math.round((TABLE_CENTRE.x + Math.sin(angle) * 2.1) * 100) / 100;
  const z = Math.round((TABLE_CENTRE.z - Math.cos(angle) * 2.1) * 100) / 100;
  return { id: `tab-${i}`, label: "Table seat", x, z, facing: headingTo({ x, z }, TABLE_CENTRE), height: 0.45 };
});
const TABLETOP_SOLIDS: Box[] = [{ x0: -1.6, x1: 1.6, z0: TABLE_CENTRE.z - 1.6, z1: TABLE_CENTRE.z + 1.6 }];

export const TABLETOP: Venue = {
  id: "tabletop",
  label: "Tabletop",
  halfX: 5.5,
  halfZ: 4.5,
  height: 3.2,
  seats: TABLETOP_SEATS,
  seatIndex: indexSeats(TABLETOP_SEATS),
  solids: TABLETOP_SOLIDS,
  nook: null,
  tv: { x: 0, z: -4.0, height: 2.1 },
  focus: TABLE_CENTRE,
  crowd: crowdSpots({
    halfX: 5.5, halfZ: 4.5, solids: TABLETOP_SOLIDS, seats: TABLETOP_SEATS, centre: TABLE_CENTRE, top: 1.0,
    avoid: [{ ...TABLE_CENTRE, radius: 2.9 }, { x: 4.8, z: -3.0, radius: 1.2 }, { x: -4.2, z: 3.3, radius: 1.0 }, { x: 5.0, z: 1.3, radius: 0.9 }],
  }),
  spawn: { x: 0, z: 3.4 },
  floorY: () => 0,
  capacity: 10,
};

export const VENUES: Record<VenueId, Venue> = { lounge: LOUNGE, cinema: CINEMA, tabletop: TABLETOP };
export const venueById = (id: VenueId | null | undefined): Venue => VENUES[id ?? "lounge"] ?? LOUNGE;

export const seatById = (id: string | null | undefined, venue: Venue = LOUNGE) => (id ? venue.seatIndex.get(id) ?? null : null);

/** Whatever arrives over the wire becomes a pose inside the room, or null. */
export function clampPose(raw: unknown, venue: Venue = LOUNGE, allowAnnex = false): LoungePose | null {
  if (!raw || typeof raw !== "object") return null;
  const { x, z, facing, seat } = raw as Record<string, unknown>;
  if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const known = typeof seat === "string" ? seatById(seat, venue) : null;
  if (known) return { x: known.x, z: known.z, facing: known.facing, seat: known.id };
  let px = Math.max(-venue.halfX + WALL_MARGIN, Math.min(venue.halfX - WALL_MARGIN, x));
  let pz = Math.max(-venue.halfZ + WALL_MARGIN, Math.min(venue.halfZ - WALL_MARGIN, z));
  const a = venue.annex;
  if (a && allowAnnex && z > a.z0 - WALL_MARGIN) {
    // Through the door, or not at all: the wall either side of it holds you in the hall.
    const atDoor = Math.abs(x - a.doorX) <= a.doorHalf - 0.2;
    if (z > a.z0 + WALL_MARGIN) {
      px = Math.max(a.x0 + WALL_MARGIN, Math.min(a.x1 - WALL_MARGIN, x));
      pz = Math.min(a.z1 - WALL_MARGIN, z);
    } else if (atDoor) {
      px = x;
      pz = z;
    }
  }
  return { x: px, z: pz, facing: wrapHeading(finite(facing)), seat: seat === FLOOR_SEAT ? FLOOR_SEAT : null };
}

/** How many people fit with a seat or a clear spot of their own. */
export const ROOM_COMFORT = LOUNGE.seats.length + LOUNGE.crowd.length;

/**
 * Where someone who has not picked a spot is: the first free seat, then the
 * next clear spot on the floor facing the room's focus, in a stable order every
 * client agrees on. Past the last spot people share the floor in a spiral.
 */
export function defaultPoses(ids: string[], taken: Map<string, LoungePose>, venue: Venue = LOUNGE): Map<string, LoungePose> {
  const result = new Map(taken);
  const busy = new Set([...taken.values()].map((pose) => pose.seat).filter((seat) => seat && seat !== FLOOR_SEAT));
  const standing = [...taken.values()].filter((pose) => !pose.seat || pose.seat === FLOOR_SEAT);
  const free = (spot: Spot) => !standing.some((pose) => Math.hypot(pose.x - spot.x, pose.z - spot.z) < 0.5);
  const { crowd, focus } = venue;
  let seatAt = 0;
  let next = 0;
  let extra = 0;
  for (const id of ids) {
    if (result.has(id)) continue;
    while (seatAt < venue.seats.length && busy.has(venue.seats[seatAt].id)) seatAt++;
    const seat = venue.seats[seatAt];
    if (seat) {
      busy.add(seat.id);
      result.set(id, { x: seat.x, z: seat.z, facing: seat.facing, seat: seat.id });
      continue;
    }
    while (next < crowd.length && !free(crowd[next])) next++;
    let x: number;
    let z: number;
    if (next < crowd.length) ({ x, z } = crowd[next++]);
    else {
      const angle = extra * 2.4;
      const reach = 0.5 + 0.35 * Math.sqrt(extra++);
      x = Math.max(-venue.halfX + 0.5, Math.min(venue.halfX - 0.5, focus.x + Math.sin(angle) * reach * 2));
      z = Math.max(-venue.halfZ + 1.2, Math.min(venue.halfZ - 0.5, focus.z + 1.6 + Math.cos(angle) * reach * 1.4));
    }
    standing.push({ x, z, facing: 0, seat: null });
    result.set(id, { x, z, facing: headingTo({ x, z }, focus), seat: null });
  }
  return result;
}

/** The first free seat, for someone walking in. */
export function freeSeat(others: Iterable<LoungePose>, venue: Venue = LOUNGE): LoungeSeat | null {
  const busy = new Set([...others].map((pose) => pose.seat));
  return venue.seats.find((seat) => !busy.has(seat.id)) ?? null;
}

export const inNook = (pose: LoungePose, venue: Venue = LOUNGE) =>
  venue.nook ? Math.hypot(pose.x - venue.nook.x, pose.z - venue.nook.z) <= venue.nook.radius : false;

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
  /**
   * Low-pass cutoff in Hz: air takes the top off distant voices, a voice
   * turned away loses its brightness, and the nook sounds as if behind a wall.
   */
  cutoff: number;
  /** How much of the voice goes to the room's reverb: close is dry, far is roomy. */
  wet: number;
}

/** Where the TV hangs: the music bot plays from here. */
export const TV_SPOT = LOUNGE.tv;
/** The TV, as a pose facing into the room. */
export const TV_POSE: LoungePose = { x: TV_SPOT.x, z: TV_SPOT.z, facing: Math.PI, seat: null };
export const tvPoseFor = (venue: Venue): LoungePose => ({ x: venue.tv.x, z: venue.tv.z, facing: Math.PI, seat: null });

/**
 * Turns two room poses into how the listener should hear the speaker. The room
 * frame is rotated into the listener's own: whatever is ahead of their body is
 * -Z, to their right is +X. A seated voice comes from a little lower.
 */
export function hearFrom(listener: LoungePose, speaker: LoungePose, speakerHeight?: number, venue: Venue = LOUNGE): HeardFrom {
  const dx = speaker.x - listener.x;
  const dz = speaker.z - listener.z;
  const [s, c] = [Math.sin(listener.facing), Math.cos(listener.facing)];
  // Forward is (sin f, -cos f); right is (cos f, sin f).
  const right = dx * c + dz * s;
  const ahead = dx * s - dz * c;
  const height = (speakerHeight ?? earHeight(speaker.seat) + venue.floorY(speaker.x, speaker.z)) - (earHeight(listener.seat) + venue.floorY(listener.x, listener.z));
  const distance = Math.hypot(dx, dz);
  // Never inside the head: a voice closer than half a metre is held there.
  const scale = distance < 0.5 ? 0.5 / Math.max(distance, 1e-3) : 1;
  const flat = distance < 1e-3 ? { x: 0, z: -0.5 } : { x: right * scale, z: -ahead * scale };
  const pan = distance < 1e-3 ? 0 : 0.65 * Math.max(-1, Math.min(1, right / Math.max(distance, 0.5)));
  // Voices are directional: facing you is full and bright, turned away is softer
  // and duller, the way someone talking to the person beside them sounds.
  const toListener = distance < 1e-3 ? 1 : (-dx * Math.sin(speaker.facing) + dz * Math.cos(speaker.facing)) / distance;
  const facingYou = (1 + toListener) / 2; // 1 facing you, 0 facing away
  const directivity = 0.62 + 0.38 * facingYou;
  // The nook keeps a conversation private-ish: in or out, the other side is muffled.
  const walled = inNook(listener, venue) !== inNook(speaker, venue);
  const privacy = walled ? 0.45 : 1;
  const air = 18000 / (1 + 0.22 * Math.max(0, distance - 1.5));
  const turned = 5200 + 14000 * facingYou;
  const cutoff = Math.round(Math.max(900, Math.min(air, turned, walled ? 1400 : 20000)));
  const wet = Math.max(0.04, Math.min(0.32, 0.03 + distance * 0.04 + (1 - facingYou) * 0.06));
  const attenuation = (privacy * directivity) / (1 + 0.2 * Math.max(0, distance - 1.2));
  return { seat: { x: flat.x, y: height, z: flat.z }, pan, attenuation, privacy: privacy * directivity, distance, cutoff, wet };
}

/** Emotes anyone can send; anything else on the wire is dropped. */
export const LOUNGE_EMOTES = ["👋", "😂", "❤️", "🎉", "🔥", "👏", "😮", "🍿"] as const;
export const isLoungeEmote = (value: unknown): value is string =>
  typeof value === "string" && (LOUNGE_EMOTES as readonly string[]).includes(value);

/** Moving a step: stops at walls, and furniture is solid. */
export function stepTo(pose: LoungePose, target: { x: number; z: number }, venue: Venue = LOUNGE, allowAnnex = false): LoungePose {
  const next = clampPose({ x: target.x, z: target.z, facing: pose.facing, seat: null }, venue, allowAnnex) ?? pose;
  const inside = (p: Spot, box: Box) => p.x > box.x0 && p.x < box.x1 && p.z > box.z0 && p.z < box.z1;
  for (const box of venue.solids) {
    // Getting up off the couch starts inside it; only walking in is blocked.
    if (inside(next, box) && !inside(pose, box)) return { ...pose, seat: null };
  }
  return next;
}
