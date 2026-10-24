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
  /** Never handed out automatically: someone has to choose it (the game master's chair). */
  reserved?: boolean;
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

export type VenueId = "lounge" | "cinema" | "tabletop" | "boardhall" | "meadow" | "club";
export const VENUE_IDS: readonly VenueId[] = ["lounge", "cinema", "tabletop", "boardhall", "meadow", "club"];
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
/** The game master's chair, at the head of the table under the wall screen. */
export const GM_SEAT_ID = "tab-gm";
/** Chair 0 is the game master's, at the head (north); nine players sit round the rest. */
const TABLETOP_SEATS: LoungeSeat[] = Array.from({ length: TABLE_CHAIRS }, (_, i) => {
  const angle = (i / TABLE_CHAIRS) * Math.PI * 2;
  const reach = i === 0 ? 2.2 : 2.1;
  const x = Math.round((TABLE_CENTRE.x + Math.sin(angle) * reach) * 100) / 100;
  const z = Math.round((TABLE_CENTRE.z - Math.cos(angle) * reach) * 100) / 100;
  const facing = headingTo({ x, z }, TABLE_CENTRE);
  return i === 0
    ? { id: GM_SEAT_ID, label: "Game master's chair", x, z, facing, height: 0.45, reserved: true }
    : { id: `tab-${i}`, label: "Table seat", x, z, facing, height: 0.45 };
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

/**
 * The board hall: the room's DeepPixel game laid out as a giant board on the
 * floor, big enough to walk on, with the players' pawns hopping round it.
 * Spectators sit on benches along the four sides.
 */
export const BOARD_HALL_HALF = 12;
/** Width of the floor board, edge to edge. */
export const FLOOR_BOARD_SIZE = 15;
const BENCH_DISTANCE = 9.7;
const BOARD_HALL_SEATS: LoungeSeat[] = [0, 1, 2, 3].flatMap((side) =>
  [-2.4, -0.8, 0.8, 2.4].map((along, i) => {
    // Side 0 south, 1 west, 2 north, 3 east; everyone faces the board.
    const x = side === 1 ? -BENCH_DISTANCE : side === 3 ? BENCH_DISTANCE : along;
    const z = side === 0 ? BENCH_DISTANCE : side === 2 ? -BENCH_DISTANCE : along;
    return { id: `bench-${side}-${i}`, label: "Bench", x, z, facing: headingTo({ x, z }, { x: 0, z: 0 }), height: 0.45 };
  }),
);
const BOARD_HALL_SOLIDS: Box[] = [
  // The four benches.
  { x0: -3.2, x1: 3.2, z0: BENCH_DISTANCE + 0.05, z1: BENCH_DISTANCE + 0.55 },
  { x0: -3.2, x1: 3.2, z0: -BENCH_DISTANCE - 0.55, z1: -BENCH_DISTANCE - 0.05 },
  { x0: -BENCH_DISTANCE - 0.55, x1: -BENCH_DISTANCE - 0.05, z0: -3.2, z1: 3.2 },
  { x0: BENCH_DISTANCE + 0.05, x1: BENCH_DISTANCE + 0.55, z0: -3.2, z1: 3.2 },
];

export const BOARD_HALL: Venue = {
  id: "boardhall",
  label: "Board hall",
  halfX: BOARD_HALL_HALF,
  halfZ: BOARD_HALL_HALF,
  height: 5,
  seats: BOARD_HALL_SEATS,
  seatIndex: indexSeats(BOARD_HALL_SEATS),
  solids: BOARD_HALL_SOLIDS,
  nook: null,
  tv: { x: 0, z: -BOARD_HALL_HALF + 0.1, height: 3.1 },
  focus: { x: 0, z: 0 },
  // Standing room is the board itself: stand on your street.
  crowd: crowdSpots({
    halfX: BOARD_HALL_HALF, halfZ: BOARD_HALL_HALF, solids: BOARD_HALL_SOLIDS, seats: BOARD_HALL_SEATS, centre: { x: 0, z: 8.4 }, margin: 1, top: 1, step: 1.1,
    avoid: [{ x: 0, z: 0, radius: 2.4 }],
  }),
  spawn: { x: 0, z: 8.6 },
  floorY: () => 0,
  capacity: 60,
};

/**
 * The meadow: a small outdoor world to wander. Rolling hills, a pond with a
 * jetty, a campfire with log seats, a cabin, a picnic table and a lookout on
 * the hill. Kept small (about 50 m across) so it draws cheaply.
 */
export const MEADOW_HALF = 25;
export const CAMPFIRE = { x: 0, z: 3 };
export const POND = { x: -11, z: 8, radius: 5 };
export const WATER_Y = -0.35;
export const LOOKOUT = { x: 14, z: -13 };
/** Home: a log cabin you can walk into (the door is in the middle of its south wall). */
export const CABIN = { x: -12, z: -11, w: 7, d: 5.5 };
export const CABIN_DOOR_HALF = 0.65;
/** Height of the cabin's plank floor. */
export const CABIN_FLOOR_Y = 0.3;
const CABIN_WALL = 0.3;
export const inCabin = (x: number, z: number) =>
  Math.abs(x - CABIN.x) < CABIN.w / 2 && Math.abs(z - CABIN.z) < CABIN.d / 2;
export const PICNIC = { x: 9, z: 9 };
export const JETTY = { x0: -7.2, x1: -4.6, z: 8 };

const smooth = (edge0: number, edge1: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Height of the ground anywhere in (and past) the meadow. */
export function meadowHeight(x: number, z: number): number {
  let h = 0.55 * Math.sin(x * 0.17 + 0.6) * Math.cos(z * 0.13 - 0.4) + 0.35 * Math.sin((x + z) * 0.09);
  // The lookout hill, and a rim of higher ground at the edge of the world.
  h += 3.2 * Math.exp(-((x - LOOKOUT.x) ** 2 + (z - LOOKOUT.z) ** 2) / 55);
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += smooth(MEADOW_HALF - 2, MEADOW_HALF + 12, edge) * 6;
  // Level ground where things stand.
  const flatten = (cx: number, cz: number, r: number, level: number) => {
    const k = 1 - smooth(r * 0.6, r, Math.hypot(x - cx, z - cz));
    h = h * (1 - k) + level * k;
  };
  flatten(CAMPFIRE.x, CAMPFIRE.z, 6.5, 0.1);
  flatten(CABIN.x, CABIN.z, 7, 0.25);
  flatten(PICNIC.x, PICNIC.z, 3.5, 0.15);
  // The pond is a bowl under the water line.
  const d = Math.hypot(x - POND.x, z - POND.z);
  if (d < POND.radius + 2.5) {
    const k = 1 - smooth(POND.radius - 1.5, POND.radius + 2.5, d);
    h = h * (1 - k) + (WATER_Y - 0.9) * k;
  }
  return h;
}

/** Where people stand: on the ground, or on the jetty over the water. */
const meadowFloorY = (x: number, z: number) => {
  if (inCabin(x, z)) return CABIN_FLOOR_Y;
  if (x > JETTY.x0 && x < JETTY.x1 + 0.4 && Math.abs(z - JETTY.z) < 0.7) return WATER_Y + 0.35;
  return Math.max(meadowHeight(x, z), WATER_Y - 0.2);
};

/** Trees, the same on every client: a seeded scatter that leaves the paths and places clear. */
export const MEADOW_TREES: Array<{ x: number; z: number; scale: number; kind: 0 | 1 }> = (() => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const trees: Array<{ x: number; z: number; scale: number; kind: 0 | 1 }> = [];
  const clearOf = [
    { ...CAMPFIRE, r: 8 }, { x: POND.x, z: POND.z, r: POND.radius + 2.2 }, { x: CABIN.x, z: CABIN.z, r: 6.5 },
    { ...PICNIC, r: 4 }, { ...LOOKOUT, r: 3.5 }, { x: 0, z: 10, r: 4 }, { x: -6, z: 8, r: 2.5 },
  ];
  for (let tries = 0; trees.length < 70 && tries < 2000; tries++) {
    const x = (rand() * 2 - 1) * (MEADOW_HALF + 8);
    const z = (rand() * 2 - 1) * (MEADOW_HALF + 8);
    if (clearOf.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3)) continue;
    // Keep the middle airy: trees thin out towards the campfire.
    if (Math.hypot(x, z) < 14 && rand() < 0.55) continue;
    trees.push({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, scale: 0.8 + rand() * 0.6, kind: rand() < 0.6 ? 0 : 1 });
  }
  return trees;
})();

const meadowSeat = (id: string, label: string, x: number, z: number, look: Spot, height = 0.45): LoungeSeat => ({
  id, label, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, facing: headingTo({ x, z }, look), height, y: meadowFloorY(x, z),
});
const MEADOW_SEATS: LoungeSeat[] = [
  ...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return meadowSeat(`fire-${i}`, "Log by the fire", CAMPFIRE.x + Math.sin(a) * 2.5, CAMPFIRE.z + Math.cos(a) * 2.5, CAMPFIRE, 0.38);
  }),
  ...[-0.9, 0, 0.9].flatMap((dx, i) => [
    meadowSeat(`picnic-n${i}`, "Picnic bench", PICNIC.x + dx, PICNIC.z - 0.75, { x: PICNIC.x + dx, z: PICNIC.z }),
    meadowSeat(`picnic-s${i}`, "Picnic bench", PICNIC.x + dx, PICNIC.z + 0.75, { x: PICNIC.x + dx, z: PICNIC.z }),
  ]),
  meadowSeat("lookout-1", "Lookout bench", LOOKOUT.x - 0.5, LOOKOUT.z + 0.6, { x: 0, z: 6 }),
  meadowSeat("lookout-2", "Lookout bench", LOOKOUT.x + 0.5, LOOKOUT.z + 0.6, { x: 0, z: 6 }),
  { id: "jetty-1", label: "End of the jetty", x: JETTY.x0 + 0.35, z: JETTY.z - 0.3, facing: -Math.PI / 2, height: 0.2, y: WATER_Y + 0.35 },
  { id: "jetty-2", label: "End of the jetty", x: JETTY.x0 + 0.35, z: JETTY.z + 0.3, facing: -Math.PI / 2, height: 0.2, y: WATER_Y + 0.35 },
  meadowSeat("porch-1", "Cabin porch", CABIN.x - 2.1, CABIN.z + CABIN.d / 2 + 0.7, { x: 0, z: 3 }),
  meadowSeat("porch-2", "Cabin porch", CABIN.x + 2.1, CABIN.z + CABIN.d / 2 + 0.7, { x: 0, z: 3 }),
  // Inside: the couch faces the fireplace on the north wall.
  ...[-0.8, 0, 0.8].map((dx, i): LoungeSeat => ({ id: `home-couch-${i}`, label: "Couch at home", x: CABIN.x + dx, z: CABIN.z + 0.75, facing: 0, height: 0.45, y: CABIN_FLOOR_Y })),
  { id: "home-arm", label: "Armchair at home", x: CABIN.x - 2.5, z: CABIN.z - 0.6, facing: Math.PI / 2, height: 0.45, y: CABIN_FLOOR_Y },
  ...[-0.75, 0.75].map((dx, i): LoungeSeat => {
    const x = CABIN.x + dx;
    const z = CABIN.z - CABIN.d / 2 + 1.35;
    return { id: `home-fire-${i}`, label: "By the fire at home", x, z, facing: headingTo({ x, z }, { x: CABIN.x, z: CABIN.z - CABIN.d / 2 }), height: 0.12, y: CABIN_FLOOR_Y };
  }),
];
const cabinX0 = CABIN.x - CABIN.w / 2;
const cabinX1 = CABIN.x + CABIN.w / 2;
const cabinZ0 = CABIN.z - CABIN.d / 2;
const cabinZ1 = CABIN.z + CABIN.d / 2;
const MEADOW_SOLIDS: Box[] = [
  // The cabin's walls, with a gap for the door; its couch and hearth inside.
  { x0: cabinX0 - CABIN_WALL / 2, x1: cabinX1 + CABIN_WALL / 2, z0: cabinZ0 - CABIN_WALL / 2, z1: cabinZ0 + CABIN_WALL / 2 },
  { x0: cabinX0 - CABIN_WALL / 2, x1: cabinX0 + CABIN_WALL / 2, z0: cabinZ0, z1: cabinZ1 },
  { x0: cabinX1 - CABIN_WALL / 2, x1: cabinX1 + CABIN_WALL / 2, z0: cabinZ0, z1: cabinZ1 },
  { x0: cabinX0 - CABIN_WALL / 2, x1: CABIN.x - CABIN_DOOR_HALF, z0: cabinZ1 - CABIN_WALL / 2, z1: cabinZ1 + CABIN_WALL / 2 },
  { x0: CABIN.x + CABIN_DOOR_HALF, x1: cabinX1 + CABIN_WALL / 2, z0: cabinZ1 - CABIN_WALL / 2, z1: cabinZ1 + CABIN_WALL / 2 },
  { x0: CABIN.x - 1.35, x1: CABIN.x + 1.35, z0: CABIN.z + 0.95, z1: CABIN.z + 1.55 },
  { x0: CABIN.x - 1.1, x1: CABIN.x + 1.1, z0: cabinZ0, z1: cabinZ0 + 0.6 },
  { x0: PICNIC.x - 1.3, x1: PICNIC.x + 1.3, z0: PICNIC.z - 0.4, z1: PICNIC.z + 0.4 },
  { x0: CAMPFIRE.x - 0.6, x1: CAMPFIRE.x + 0.6, z0: CAMPFIRE.z - 0.6, z1: CAMPFIRE.z + 0.6 },
  // The pond: wade in at the edge, but not across (the jetty runs out over it).
  { x0: POND.x - POND.radius * 0.7, x1: JETTY.x0 - 0.05, z0: POND.z - POND.radius * 0.7, z1: POND.z + POND.radius * 0.7 },
  ...MEADOW_TREES.filter((t) => Math.abs(t.x) < MEADOW_HALF && Math.abs(t.z) < MEADOW_HALF)
    .map((t) => ({ x0: t.x - 0.3, x1: t.x + 0.3, z0: t.z - 0.3, z1: t.z + 0.3 })),
];

export const MEADOW: Venue = {
  id: "meadow",
  label: "Meadow",
  halfX: MEADOW_HALF,
  halfZ: MEADOW_HALF,
  height: 30,
  seats: MEADOW_SEATS,
  seatIndex: indexSeats(MEADOW_SEATS),
  solids: MEADOW_SOLIDS,
  nook: null,
  // An open-air screen just north of the fire.
  tv: { x: CAMPFIRE.x, z: CAMPFIRE.z - 6.2, height: 2.4 },
  focus: CAMPFIRE,
  crowd: crowdSpots({
    halfX: 14, halfZ: 14, solids: MEADOW_SOLIDS, seats: MEADOW_SEATS, centre: { x: CAMPFIRE.x, z: CAMPFIRE.z + 3.8 }, margin: 1, top: 1, step: 1.1,
    avoid: [{ x: CAMPFIRE.x, z: CAMPFIRE.z, radius: 3.2 }, { x: POND.x, z: POND.z, radius: POND.radius + 0.5 }, { x: CABIN.x, z: CABIN.z, radius: 5 }],
  }),
  spawn: { x: 0, z: 10 },
  floorY: meadowFloorY,
  capacity: 80,
};

/**
 * The club: a stage across the north end with the DJ's decks in front of an
 * LED wall, an LED dance floor in the middle, booths along the side walls and
 * a bar at the back. The stage is for whoever has the decks: the crowd stays
 * on the floor, and the DJ steps up by taking the decks (a seat nobody is
 * given without choosing it, like every seat here: in a club you start on the
 * dance floor).
 */
export const CLUB_HALF_X = 9;
export const CLUB_HALF_Z = 8;
export const CLUB_STAGE = { x0: -6.2, x1: 6.2, z0: -CLUB_HALF_Z, z1: -5.2, height: 0.8 };
export const CLUB_DANCE_FLOOR = { x0: -5, x1: 5, z0: -4.6, z1: 2.6, tile: 0.9 };
export const CLUB_BAR = { x0: -4.2, x1: 4.2, z0: 6.15, z1: 6.85 };
/** The DJ's spot behind the decks, and the decks (the booth's table). */
export const CLUB_DJ_SEAT = "club-dj";
export const CLUB_DECKS = { x: 0, z: -6.15, width: 2.6, depth: 0.75 };
const CLUB_BOOTH_SIDES: Array<{ side: -1 | 1; z: number }> = [-2.4, 1.6].flatMap((z) => [{ side: -1 as const, z }, { side: 1 as const, z }]);
const CLUB_SEATS: LoungeSeat[] = [
  { id: CLUB_DJ_SEAT, label: "DJ booth", x: CLUB_DECKS.x, z: CLUB_DECKS.z - 0.75, facing: Math.PI, height: 0.6, y: CLUB_STAGE.height, reserved: true },
  // Booths: two sofas of three on each side wall, facing the floor.
  ...CLUB_BOOTH_SIDES.flatMap(({ side, z }, booth) => [-0.75, 0, 0.75].map((dz, i): LoungeSeat => ({
    id: `club-booth-${booth}-${i}`, label: "Booth", x: side * (CLUB_HALF_X - 0.75), z: z + dz,
    facing: side < 0 ? Math.PI / 2 : -Math.PI / 2, height: 0.45, reserved: true,
  }))),
  // Bar stools along the counter, facing the bar.
  ...Array.from({ length: 8 }, (_, i): LoungeSeat => ({
    id: `club-bar-${i}`, label: "Bar stool", x: Math.round((CLUB_BAR.x0 + 0.6 + i * ((CLUB_BAR.x1 - CLUB_BAR.x0 - 1.2) / 7)) * 100) / 100,
    z: CLUB_BAR.z0 - 0.55, facing: Math.PI, height: 0.75, reserved: true,
  })),
];
const CLUB_SOLIDS: Box[] = [
  { x0: CLUB_STAGE.x0, x1: CLUB_STAGE.x1, z0: CLUB_STAGE.z0, z1: CLUB_STAGE.z1 },
  { x0: CLUB_BAR.x0, x1: CLUB_BAR.x1, z0: CLUB_BAR.z0, z1: CLUB_BAR.z1 },
  // Speaker stacks either side of the stage.
  { x0: -CLUB_HALF_X, x1: -7.0, z0: -CLUB_HALF_Z, z1: -5.6 },
  { x0: 7.0, x1: CLUB_HALF_X, z0: -CLUB_HALF_Z, z1: -5.6 },
  // The booths' sofas, and a low table in front of each.
  ...CLUB_BOOTH_SIDES.flatMap(({ side, z }) => [
    side < 0
      ? { x0: -CLUB_HALF_X, x1: -CLUB_HALF_X + 1.1, z0: z - 1.25, z1: z + 1.25 }
      : { x0: CLUB_HALF_X - 1.1, x1: CLUB_HALF_X, z0: z - 1.25, z1: z + 1.25 },
    side < 0
      ? { x0: -CLUB_HALF_X + 1.45, x1: -CLUB_HALF_X + 2.05, z0: z - 0.5, z1: z + 0.5 }
      : { x0: CLUB_HALF_X - 2.05, x1: CLUB_HALF_X - 1.45, z0: z - 0.5, z1: z + 0.5 },
  ]),
];
/** On the stage or not: the DJ stands 80 cm up. */
const clubFloorY = (x: number, z: number) =>
  x > CLUB_STAGE.x0 && x < CLUB_STAGE.x1 && z < CLUB_STAGE.z1 ? CLUB_STAGE.height : 0;

export const CLUB: Venue = {
  id: "club",
  label: "Club",
  halfX: CLUB_HALF_X,
  halfZ: CLUB_HALF_Z,
  height: 6,
  seats: CLUB_SEATS,
  seatIndex: indexSeats(CLUB_SEATS),
  solids: CLUB_SOLIDS,
  nook: null,
  // The music comes off the stage: the stacks and the booth.
  tv: { x: 0, z: -6.4, height: 2.6 },
  focus: { x: CLUB_DECKS.x, z: CLUB_DECKS.z },
  // Standing room is the dance floor, nearest the decks first.
  crowd: crowdSpots({
    halfX: CLUB_HALF_X, halfZ: CLUB_HALF_Z, solids: CLUB_SOLIDS, seats: CLUB_SEATS, centre: { x: 0, z: -3.6 }, margin: 0.9, top: 3.4, step: 0.8,
    avoid: [{ x: 0, z: CLUB_BAR.z0 - 0.55, radius: 1.2 }],
  }).sort((a, b) => Number(!inDanceFloor(a)) - Number(!inDanceFloor(b))),
  spawn: { x: 0, z: 3.4 },
  floorY: clubFloorY,
  capacity: 80,
};

/** On the LED dance floor. */
export function inDanceFloor(spot: Spot): boolean {
  const f = CLUB_DANCE_FLOOR;
  return spot.x > f.x0 && spot.x < f.x1 && spot.z > f.z0 && spot.z < f.z1;
}

/** Just outside and just inside the cabin's door. */
export const CABIN_DOOR_OUT = { x: CABIN.x, z: cabinZ1 + 0.7 };
export const CABIN_DOOR_IN = { x: CABIN.x, z: cabinZ1 - 0.7 };

/**
 * The way to walk somewhere: straight there, except into or out of the meadow's
 * cabin, which goes through its door.
 */
export function routeTo(venue: Venue, from: Spot, to: Spot): Spot[] {
  if (venue.id !== "meadow") return [to];
  const fromIn = inCabin(from.x, from.z);
  const toIn = inCabin(to.x, to.z);
  if (fromIn === toIn) return [to];
  return fromIn ? [CABIN_DOOR_IN, CABIN_DOOR_OUT, to] : [CABIN_DOOR_OUT, CABIN_DOOR_IN, to];
}

/** Where you can fish from: the end of the jetty, or the pond's edge. */
export function fishingSpot(pose: Spot): boolean {
  if (pose.x < JETTY.x0 + 1.4 && pose.x > JETTY.x0 - 0.5 && Math.abs(pose.z - JETTY.z) < 0.8) return true;
  return Math.hypot(pose.x - POND.x, pose.z - POND.z) < POND.radius + 2.2;
}

export const VENUES: Record<VenueId, Venue> = { lounge: LOUNGE, cinema: CINEMA, tabletop: TABLETOP, boardhall: BOARD_HALL, meadow: MEADOW, club: CLUB };
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
  for (const seat of venue.seats) if (seat.reserved) busy.add(seat.id);
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
  return venue.seats.find((seat) => !seat.reserved && !busy.has(seat.id)) ?? null;
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
export function hearFrom(listener: LoungePose, speaker: LoungePose, speakerHeight?: number, venue: Venue = LOUNGE, echo = 0.5): HeardFrom {
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
  const echoMultiplier = Number.isFinite(echo) ? Math.max(0, Math.min(1, echo)) * 2 : 1;
  const baseWet = 0.012 + distance * 0.012 + (1 - facingYou) * 0.02;
  const wet = Math.max(0, Math.min(0.18, baseWet * echoMultiplier));
  const attenuation = (privacy * directivity) / (1 + 0.2 * Math.max(0, distance - 1.2));
  return { seat: { x: flat.x, y: height, z: flat.z }, pan, attenuation, privacy: privacy * directivity, distance, cutoff, wet };
}

/** Emotes anyone can send; anything else on the wire is dropped. */
export const LOUNGE_EMOTES = ["👋", "😂", "❤️", "🎉", "🔥", "👏", "😮", "🍿"] as const;
/** Not in the emote bar, but sent the same way: a jump, and a fish caught in the meadow. */
export const JUMP_SIGNAL = "⤒";
export const LOUNGE_SIGNALS = [JUMP_SIGNAL, "🐟"] as const;
export const isLoungeEmote = (value: unknown): value is string =>
  typeof value === "string" && ((LOUNGE_EMOTES as readonly string[]).includes(value) || (LOUNGE_SIGNALS as readonly string[]).includes(value));

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
