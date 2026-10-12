/**
 * The board hall's view of the room's DeepPixel game.
 *
 * The game itself runs on the DeepPixel server (deeppixel.online/monogame);
 * players play it in the activity panel. The board hall only watches: it
 * opens its own socket, asks for the game by code and redraws the floor board,
 * the pawns, the houses and the dice from every state the server broadcasts.
 */
import { DEEPPIXEL_URL } from "@/lib/activities";
import { FLOOR_BOARD_SIZE } from "./living-room";

export interface BoardSpace {
  name: string;
  type: string;
  color?: string | null;
  price?: number;
  countryCode?: string;
}

export interface BoardPlayer {
  id: string;
  name: string;
  color?: string;
  money?: number;
  position?: number;
  inJail?: boolean;
  isBankrupt?: boolean;
  isBot?: boolean;
}

export interface BoardProperty {
  spaceIndex: number;
  ownerId: string | null;
  houses?: number;
  mortgaged?: boolean;
}

export interface BoardGameState {
  gameId: string;
  state?: string;
  hostId?: string;
  players: BoardPlayer[];
  properties?: BoardProperty[];
  currentPlayerIndex?: number;
  turnState?: string;
  lastDiceRoll?: number[];
  /** Set by the roller's page as the dice are thrown, before anyone moves. */
  rollId?: string;
  gameLog?: string[];
  settings?: { board?: BoardSpace[]; startingMoney?: number };
}

/** DeepPixel's own default ("classic") board, drawn before a game has started. */
export const DEFAULT_BOARD: BoardSpace[] = [
  { name: "GO", type: "go" }, { name: "Salvador", type: "property", color: "#a55a40", price: 60 }, { name: "Treasure", type: "community_chest" },
  { name: "Rio", type: "property", color: "#a55a40", price: 60 }, { name: "Earnings Tax", type: "tax" }, { name: "TLV Airport", type: "railroad", price: 200 },
  { name: "Tel Aviv", type: "property", color: "#add8e6", price: 100 }, { name: "Surprise", type: "chance" }, { name: "Haifa", type: "property", color: "#add8e6", price: 100 },
  { name: "Jerusalem", type: "property", color: "#add8e6", price: 120 }, { name: "In Prison / Just Visiting", type: "jail" },
  { name: "Venice", type: "property", color: "#d25298", price: 140 }, { name: "Power Company", type: "utility", price: 150 }, { name: "Milan", type: "property", color: "#d25298", price: 140 },
  { name: "Rome", type: "property", color: "#d25298", price: 160 }, { name: "NUC Airport", type: "railroad", price: 200 }, { name: "Frankfurt", type: "property", color: "#f7941e", price: 180 },
  { name: "Treasure", type: "community_chest" }, { name: "Munich", type: "property", color: "#f7941e", price: 180 }, { name: "Berlin", type: "property", color: "#f7941e", price: 200 },
  { name: "Vacation", type: "free_parking" }, { name: "Shenzhen", type: "property", color: "#ed1c24", price: 220 }, { name: "Surprise", type: "chance" },
  { name: "Beijing", type: "property", color: "#ed1c24", price: 220 }, { name: "Shanghai", type: "property", color: "#ed1c24", price: 240 }, { name: "CDG Airport", type: "railroad", price: 200 },
  { name: "Lyon", type: "property", color: "#ffeb3b", price: 260 }, { name: "Toulouse", type: "property", color: "#ffeb3b", price: 260 }, { name: "Water Company", type: "utility", price: 150 },
  { name: "Paris", type: "property", color: "#ffeb3b", price: 280 }, { name: "Go to prison", type: "go_to_jail" },
  { name: "Liverpool", type: "property", color: "#4caf50", price: 300 }, { name: "Manchester", type: "property", color: "#4caf50", price: 300 }, { name: "Treasure", type: "community_chest" },
  { name: "London", type: "property", color: "#4caf50", price: 320 }, { name: "JFK Airport", type: "railroad", price: 200 }, { name: "Surprise", type: "chance" },
  { name: "San Francisco", type: "property", color: "#2196f3", price: 350 }, { name: "Premium Tax", type: "tax" }, { name: "New York", type: "property", color: "#2196f3", price: 400 },
];

/** The board a game is played on, or the default before there is one. */
export const boardOf = (game: BoardGameState | null): BoardSpace[] => {
  const board = game?.settings?.board;
  return Array.isArray(board) && board.length >= 8 && board.length % 4 === 0 ? board : DEFAULT_BOARD;
};

/** DeepPixel player ids for Hoffle accounts: "h-" and the account id (see ?pid= in the embed). */
export const deepPixelPlayerId = (userId: string) => `h-${userId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64)}`;

export interface TileSpot {
  /** Centre of the tile on the floor. */
  x: number;
  z: number;
  /** Which edge: 0 south (GO's row), 1 west, 2 north, 3 east. */
  edge: number;
  corner: boolean;
  /** Width along the edge and depth towards the middle, in metres. */
  width: number;
  depth: number;
  /** Unit vector from the tile towards the middle of the board. */
  inX: number;
  inZ: number;
}

/**
 * Where tile `index` of an `count`-tile board lies on the floor. Classic
 * layout: GO in the south-east corner, play runs west along the south edge,
 * up the west, east along the north and back down the east side.
 */
export function tileSpot(index: number, count: number, size = FLOOR_BOARD_SIZE): TileSpot {
  const side = count / 4;
  const width = size / (side - 1 + 2 * 1.6);
  const depth = width * 1.6;
  const half = size / 2;
  const i = ((index % count) + count) % count;
  const edge = Math.floor(i / side);
  const k = i % side;
  const corner = k === 0;
  // Along the edge from its starting corner, and how far in from the outside.
  const along = corner ? depth / 2 : depth + (k - 0.5) * width;
  const inset = depth / 2;
  let x = 0;
  let z = 0;
  let inX = 0;
  let inZ = 0;
  if (edge === 0) { x = half - along; z = half - inset; inZ = -1; }
  else if (edge === 1) { x = -half + inset; z = half - along; inX = 1; }
  else if (edge === 2) { x = -half + along; z = -half + inset; inZ = 1; }
  else { x = half - inset; z = -half + along; inX = -1; }
  return { x, z, edge, corner, width: corner ? depth : width, depth, inX, inZ };
}

const SPACE_GLYPHS: Record<string, string> = {
  go: "➜", jail: "⛓", free_parking: "☀", go_to_jail: "👮", chance: "?", community_chest: "💰", tax: "💸", railroad: "✈", utility: "⚡",
};
export const spaceGlyph = (space: BoardSpace) => SPACE_GLYPHS[space.type] ?? "";

/** Where the DeepPixel socket lives: the game's mount point, as wss. */
function socketUrl() {
  const url = new URL(DEEPPIXEL_URL);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  return url.toString();
}

/**
 * Watches one DeepPixel game. Until someone opens the game it does not exist
 * yet, so "not found" just means try again shortly. Reconnects on its own.
 */
export class DeepPixelWatcher {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private attempts = 0;

  constructor(private readonly gameId: string, private readonly onGame: (game: BoardGameState | null) => void) {
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(socketUrl());
    } catch {
      this.later(10_000);
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.attempts = 0;
      socket.send(JSON.stringify({ type: "get_game", gameId: this.gameId }));
    };
    socket.onmessage = (event) => {
      let message: { type?: string; game?: BoardGameState; message?: string };
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if ((message.type === "game_state" || message.type === "game_updated" || message.type === "game_created" || message.type === "game_started") && message.game?.gameId === this.gameId) {
        this.onGame(message.game);
      } else if (message.type === "error" && /not found/i.test(message.message ?? "")) {
        // Nobody has opened the game yet: ask again in a moment.
        this.onGame(null);
        setTimeout(() => { if (this.socket === socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "get_game", gameId: this.gameId })); }, 4000);
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.later(Math.min(30_000, 1500 * 2 ** this.attempts++));
    };
    socket.onerror = () => socket.close();
  }

  private later(ms: number) {
    if (this.closed || this.retry) return;
    this.retry = setTimeout(() => { this.retry = null; this.connect(); }, ms);
  }

  close() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}

/** Which tile of the floor board a point is on, or null off the board / in the middle. */
export function tileAt(x: number, z: number, count: number, size = FLOOR_BOARD_SIZE): number | null {
  for (let i = 0; i < count; i++) {
    const spot = tileSpot(i, count, size);
    // Along the edge is the tile's width; across it, its depth.
    const halfX = (spot.inX ? spot.depth : spot.width) / 2;
    const halfZ = (spot.inZ ? spot.depth : spot.width) / 2;
    if (Math.abs(x - spot.x) <= halfX && Math.abs(z - spot.z) <= halfZ) return i;
  }
  return null;
}

/** The way play runs along a tile's edge: west on the south side, north on the west, and so on. */
export const travelDirection = (edge: number) => [{ x: -1, z: 0 }, { x: 0, z: -1 }, { x: 1, z: 0 }, { x: 0, z: 1 }][edge] ?? { x: -1, z: 0 };

/* ---------- the bridge to the game's own page (see the Hoffle bridge in DeepPixel's index.html) ---------- */

export type BridgeItem =
  | { kind: "text"; text: string; color?: string | null; strong?: boolean }
  | { kind: "button"; id: string; label: string; tone?: string; disabled?: boolean }
  | { kind: "input"; id: string; inputType: string; value: string; min?: string; max?: string; step?: string; placeholder?: string; label?: string; disabled?: boolean }
  | { kind: "select"; id: string; value: string; label?: string; options: Array<{ value: string; label: string }>; disabled?: boolean }
  | { kind: "check"; id: string; checked: boolean; radio?: boolean; label?: string; disabled?: boolean };

export interface BridgeDialog {
  key: string;
  title: string;
  items: BridgeItem[];
  /** Closes by clicking away in the game, so the hall can offer a close button. */
  dismissable?: boolean;
}

export interface BridgeControl {
  key: "roll" | "end" | "joker" | "manage" | "credit" | "team" | "trades";
  id: string;
  label: string;
  disabled: boolean;
  hidden: boolean;
}

export interface BridgeState {
  me: string | null;
  gameId: string | null;
  state: string | null;
  turnInfo: string;
  controls: BridgeControl[];
  dialogs: BridgeDialog[];
  trades: BridgeItem[];
}

export type BridgeCommand =
  | { type: "hall"; on: boolean }
  | { type: "sync" }
  | { type: "click"; id: string }
  | { type: "input"; id: string; value: string | boolean }
  | { type: "open"; what: "tile"; index: number }
  | { type: "open"; what: "player" | "trade"; id: string }
  | { type: "open"; what: "close" };
