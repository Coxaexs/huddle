/** Shared shapes for the voice-channel battlemap (a small VTT). */

export interface MapToken {
  id: string;
  label: string;
  color: string;
  /** Uploaded picture for the token, usually the owner's avatar. */
  avatarUrl?: string | null;
  /** Grid coordinates, not pixels, so any screen size lines up. */
  x: number;
  y: number;
  /** Token diameter in grid cells (default 1). Shared so everyone sees the same size. */
  size?: number;
  /** Who may move it; GMs may move anything. Null tokens are free-for-all. */
  ownerId?: string | null;
  hp?: number | null;
  maxHp?: number | null;
  /** Active status condition markers (e.g. 'blinded', 'concentrating'). */
  conditions?: string[];
  /** Initiative roll score for encounter turn tracking. */
  initiative?: number | null;
}

export interface ConditionInfo {
  id: string;
  label: string;
  color: string;
  badge: string;
  description: string;
}

export const CONDITIONS: ConditionInfo[] = [
  { id: "blinded", label: "Blinded", color: "#64748b", badge: "BLI", description: "Auto-fails sight checks. Attacks against have advantage, own attacks disadvantage." },
  { id: "charmed", label: "Charmed", color: "#ec4899", badge: "CHA", description: "Cannot attack the charmer. Charmer has advantage on social interactions." },
  { id: "concentrating", label: "Concentrating", color: "#0284c7", badge: "CNC", description: "Concentrating on a spell. Damage triggers Constitution save to maintain." },
  { id: "deafened", label: "Deafened", color: "#94a3b8", badge: "DEF", description: "Cannot hear. Auto-fails ability checks requiring hearing." },
  { id: "frightened", label: "Frightened", color: "#a855f7", badge: "FRI", description: "Disadvantage on checks/attacks while source in sight. Cannot willingly move closer." },
  { id: "grappled", label: "Grappled", color: "#f97316", badge: "GRP", description: "Speed is 0. Ends if grappler is incapacitated or moved away." },
  { id: "incapacitated", label: "Incapacitated", color: "#ef4444", badge: "INC", description: "Cannot take actions or reactions." },
  { id: "invisible", label: "Invisible", color: "#06b6d4", badge: "INV", description: "Unseeable without special senses. Attacks have advantage, attacks against disadvantage." },
  { id: "paralyzed", label: "Paralyzed", color: "#dc2626", badge: "PAR", description: "Incapacitated, cannot move/speak. Auto-fails Str/Dex saves. Attacks within 5ft are crits." },
  { id: "petrified", label: "Petrified", color: "#78716c", badge: "PET", description: "Transformed into solid stone. Weight x10. Resistance to all damage." },
  { id: "poisoned", label: "Poisoned", color: "#22c55e", badge: "POI", description: "Disadvantage on attack rolls and ability checks." },
  { id: "prone", label: "Prone", color: "#eab308", badge: "PRO", description: "Crawling costs movement. Attacks have disadvantage. Melee attacks against have advantage." },
  { id: "restrained", label: "Restrained", color: "#d97706", badge: "RES", description: "Speed is 0. Attacks against have advantage, own disadvantage. Disadvantage on Dex saves." },
  { id: "stunned", label: "Stunned", color: "#8b5cf6", badge: "STU", description: "Incapacitated, faltering speech. Auto-fails Str/Dex saves. Attacks against have advantage." },
  { id: "unconscious", label: "Unconscious", color: "#475569", badge: "UNC", description: "Incapacitated, drops items, falls prone. Attacks within 5ft are crits." },
];

export interface MapStroke {
  id: string;
  color: string;
  width: number;
  /** Flat [x0,y0,x1,y1,…] in grid units, kept compact for the socket. */
  points: number[];
  by?: string;
}

/** A rectangle of fog hiding part of the map from non-GM players. */
export interface MapFog {
  id: string;
  /** Top-left corner in grid units. */
  x: number;
  y: number;
  /** Width/height in grid units. */
  w: number;
  h: number;
}

export type GridType = "square" | "hex" | "none";

export interface Battlemap {
  id: string;
  channelId: string;
  name: string;
  imageUrl: string | null;
  /** Columns across the map; rows follow the image's aspect ratio. */
  grid: number;
  /** Explicit row count if fixed/saved from image aspect ratio. */
  rows?: number | null;
  tokens: MapToken[];
  strokes: MapStroke[];
  /** Rectangles of fog hiding parts of the map from non-GMs. */
  fog: MapFog[];
  /** Grid overlay and snapping geometry. */
  gridType?: GridType;
  /** Set by the GM; switching it can swap the call's music. */
  encounter?: "combat" | "exploration";
}

export interface BattlemapRow {
  id: string;
  channel_id: string;
  name: string;
  image_key: string | null;
  grid: number;
  rows?: number | null;
  tokens: string;
  strokes: string;
  fog?: string;
  encounter?: string | null;
  active: number;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export function publicBattlemap(row: BattlemapRow): Battlemap {
  return {
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    imageUrl: row.image_key
      ? `/hangout/api/uploads/${encodeURIComponent(row.image_key)}`
      : null,
    grid: row.grid || 20,
    rows: row.rows ? Number(row.rows) : null,
    tokens: parseJson<MapToken[]>(row.tokens, []),
    strokes: parseJson<MapStroke[]>(row.strokes, []),
    fog: parseJson<MapFog[]>(row.fog, []),
    encounter: row.encounter === "combat" ? "combat" : "exploration",
  };
}

/** Clamps a token to the board and rounds to a sensible precision. */
export function clampPoint(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(max, value)) * 100) / 100;
}

export const HEX_ROW_HEIGHT = 0.866;

/** Snaps coordinates according to the selected grid mode. */
export function snapPoint(
  x: number,
  y: number,
  mode: GridType,
  maxX = 60,
  maxY = 60,
): { x: number; y: number } {
  if (mode === "none") {
    return { x: clampPoint(x, maxX), y: clampPoint(y, maxY) };
  }
  if (mode === "square") {
    return {
      x: clampPoint(Math.round(x), maxX),
      y: clampPoint(Math.round(y), maxY),
    };
  }
  // Hex grid with staggered alternating rows
  const row = Math.round(y / HEX_ROW_HEIGHT);
  const rowOffset = (Math.abs(row) % 2 === 1) ? 0.5 : 0;
  const col = Math.round(x - rowOffset) + rowOffset;
  return {
    x: clampPoint(col, maxX),
    y: clampPoint(row * HEX_ROW_HEIGHT, maxY),
  };
}
