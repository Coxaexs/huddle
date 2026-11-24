/** Shared shapes for the voice-channel battlemap (a small VTT). */

export type HpVisibility = "exact" | "tier" | "hidden";
export type FogMode = "cover" | "reveal";

export interface HpTierInfo {
  label: "Healthy" | "Wounded" | "Bloodied" | "Critical" | "Down";
  color: string;
}

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
  /** Computed status tier shown to players when `hpVisibility === "tier"`. */
  hpTier?: HpTierInfo | null;
  /** Active status condition markers (e.g. 'blinded', 'concentrating'). */
  conditions?: string[];
  /** Optional round timers per active condition id. */
  conditionDurations?: Record<string, number>;
  /** Initiative roll score for encounter turn tracking. */
  initiative?: number | null;
  /** Hidden on the GM layer until revealed to players. */
  hidden?: boolean;
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

/** A rectangle of fog hiding (or revealing) part of the map for non-GM players. */
export interface MapFog {
  id: string;
  /** Top-left corner in grid units. */
  x: number;
  y: number;
  /** Width/height in grid units. */
  w: number;
  h: number;
  /** Whether this rect adds fog ("cover", default) or cuts out a hole ("reveal"). */
  mode?: FogMode;
}

export interface MapArea {
  id: string;
  shape: "sphere" | "cone" | "cube" | "line";
  /** Anchor/origin point in grid units. */
  x: number;
  y: number;
  /** Target/direction point in grid units. */
  tx: number;
  ty: number;
  /** Radius (sphere) or length/side (cone, cube, line) in feet. */
  sizeFt: number;
  color: string;
  label?: string;
  ownerId?: string;
}

export interface MapPing {
  id: string;
  x: number;
  y: number;
  color: string;
  byName: string;
  pullView?: boolean;
  at: number;
}

export interface BattlemapSceneSummary {
  id: string;
  name: string;
  imageUrl: string | null;
  active: boolean;
  tokenCount: number;
  createdAt: string;
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
  /** Rectangles of fog hiding/revealing parts of the map from non-GMs. */
  fog: MapFog[];
  /** Persistent AoE spell templates in grid coordinates. */
  areas?: MapArea[];
  /** Grid overlay and snapping geometry. */
  gridType?: GridType;
  /** Set by the GM; switching it can swap the call's music. */
  encounter?: "combat" | "exploration";
  /** How monster HP is shown to non-GMs (`"exact"` default for backwards compat). */
  hpVisibility?: HpVisibility;
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
  areas?: string;
  encounter?: string | null;
  hp_visibility?: string | null;
  active: number;
  created_at?: string;
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

export function normalizeHpVisibility(raw: unknown): HpVisibility {
  return raw === "tier" || raw === "hidden" ? raw : "exact";
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
    areas: parseJson<MapArea[]>(row.areas, []),
    encounter: row.encounter === "combat" ? "combat" : "exploration",
    hpVisibility: normalizeHpVisibility(row.hp_visibility),
  };
}

/** Health tier label + colour for `hpVisibility === "tier"`. */
export function hpTierFor(hp: number, maxHp: number): HpTierInfo {
  if (hp <= 0) return { label: "Down", color: "#64748b" };
  const safeMax = Math.max(1, maxHp);
  const ratio = hp / safeMax;
  if (ratio <= 0.25) return { label: "Critical", color: "#ef4444" };
  if (ratio <= 0.5) return { label: "Bloodied", color: "#f97316" };
  if (ratio < 1) return { label: "Wounded", color: "#eab308" };
  return { label: "Healthy", color: "#22c55e" };
}

/** Measures grid distance in feet (`5e` = max(dx, dy) Chebyshev, `euclid` = straight line). */
export function measureFeet(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  feetPerCell = 5,
  mode: "5e" | "euclid" = "5e",
): number {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const cells = mode === "euclid" ? Math.hypot(dx, dy) : Math.max(dx, dy);
  return Math.round(cells * feetPerCell);
}

/**
 * Redacts GM-only data (hidden tokens and monster HP according to `hpVisibility`)
 * before sending a battlemap to a non-GM player.
 */
export function maskMapForPlayer(map: Battlemap, userId: string): Battlemap {
  const vis = normalizeHpVisibility(map.hpVisibility);
  const tokens = map.tokens
    .filter((token) => !token.hidden)
    .map((token) => {
      const isMine = Boolean(token.ownerId && token.ownerId === userId);
      if (isMine || token.ownerId) return token;
      if (vis === "exact") return token;
      if (vis === "hidden") {
        const { hp: _hp, maxHp: _max, hpTier: _tier, ...rest } = token;
        return rest;
      }
      const hasHp = typeof token.hp === "number" && typeof token.maxHp === "number" && token.maxHp > 0;
      const hpTier = hasHp ? hpTierFor(token.hp!, token.maxHp!) : null;
      const { hp: _hp, maxHp: _max, ...rest } = token;
      return hpTier ? { ...rest, hpTier } : rest;
    });
  return { ...map, tokens, hpVisibility: vis };
}

/**
 * Decrements timed conditions on `activeTokenId` at the start/advance of its turn.
 * Conditions that reach 0 are removed and listed in `expired`.
 */
export function tickConditionDurations(
  tokens: MapToken[],
  activeTokenId: string,
): {
  tokens: MapToken[];
  expired: Array<{ tokenId: string; label: string; conditionId: string }>;
} {
  const expired: Array<{ tokenId: string; label: string; conditionId: string }> = [];
  const nextTokens = tokens.map((token) => {
    if (token.id !== activeTokenId || !token.conditionDurations) return token;
    const nextDurations: Record<string, number> = {};
    const expiredIds = new Set<string>();
    for (const [condId, remaining] of Object.entries(token.conditionDurations)) {
      const next = Math.floor(remaining) - 1;
      if (next <= 0) {
        expiredIds.add(condId);
        expired.push({ tokenId: token.id, label: token.label, conditionId: condId });
      } else {
        nextDurations[condId] = next;
      }
    }
    const nextConditions = (token.conditions || []).filter((c) => !expiredIds.has(c));
    return {
      ...token,
      conditions: nextConditions,
      conditionDurations: Object.keys(nextDurations).length ? nextDurations : undefined,
    };
  });
  return { tokens: nextTokens, expired };
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

export type AreaSvgGeometry =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "polygon"; points: string };

/** Computes SVG primitives in grid units (1 cell = 5 ft) for an AoE template. */
export function areaSvgGeometry(area: Pick<MapArea, "shape" | "x" | "y" | "tx" | "ty" | "sizeFt">): AreaSvgGeometry {
  const cells = Math.max(1, area.sizeFt / 5);
  if (area.shape === "sphere") {
    return { kind: "circle", cx: area.x, cy: area.y, r: cells };
  }
  const vx = area.tx - area.x;
  const vy = area.ty - area.y;
  const len = Math.hypot(vx, vy);
  const dx = len > 0.15 ? vx / len : 1;
  const dy = len > 0.15 ? vy / len : 0;
  const px = -dy;
  const py = dx;

  if (area.shape === "cone") {
    // 5e cone width at distance L equals L
    const halfW = cells / 2;
    const x1 = area.x + dx * cells + px * halfW;
    const y1 = area.y + dy * cells + py * halfW;
    const x2 = area.x + dx * cells - px * halfW;
    const y2 = area.y + dy * cells - py * halfW;
    return {
      kind: "polygon",
      points: `${area.x},${area.y} ${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}`,
    };
  }

  if (area.shape === "line") {
    const hw = 0.5; // 5 ft wide beam
    const p1x = area.x + px * hw;
    const p1y = area.y + py * hw;
    const p2x = area.x + dx * cells + px * hw;
    const p2y = area.y + dy * cells + py * hw;
    const p3x = area.x + dx * cells - px * hw;
    const p3y = area.y + dy * cells - py * hw;
    const p4x = area.x - px * hw;
    const p4y = area.y - py * hw;
    return {
      kind: "polygon",
      points: `${p1x.toFixed(2)},${p1y.toFixed(2)} ${p2x.toFixed(2)},${p2y.toFixed(2)} ${p3x.toFixed(2)},${p3y.toFixed(2)} ${p4x.toFixed(2)},${p4y.toFixed(2)}`,
    };
  }

  // Cube: if dragged out, extend from origin face toward cursor; otherwise center on origin.
  const half = cells / 2;
  const cx = len > 0.15 ? area.x + dx * half : area.x;
  const cy = len > 0.15 ? area.y + dy * half : area.y;
  const c1x = cx + dx * half + px * half;
  const c1y = cy + dy * half + py * half;
  const c2x = cx + dx * half - px * half;
  const c2y = cy + dy * half - py * half;
  const c3x = cx - dx * half - px * half;
  const c3y = cy - dy * half - py * half;
  const c4x = cx - dx * half + px * half;
  const c4y = cy - dy * half + py * half;
  return {
    kind: "polygon",
    points: `${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${c3x.toFixed(2)},${c3y.toFixed(2)} ${c4x.toFixed(2)},${c4y.toFixed(2)}`,
  };
}
