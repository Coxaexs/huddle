/**
 * Conversation games, Messenger-style: someone sends an invitation into a
 * chat, someone else accepts, and the game plays out in that one message
 * card. Tic-Tac-Toe, Four in a Row, Rock Paper Scissors and Minesweeper
 * Flags (the MSN classic: take turns uncovering a minefield, and every mine
 * you find is a point and another go).
 *
 * Everything here is pure: /api/games loads the stored state, calls these,
 * and saves the result. Anything the players mustn't see yet (where the mines
 * are, what the other player threw) lives in `secret`, stored server-side
 * and never sent to clients.
 */

import { guessRota, newRota, revealRota, type RotaState } from "./rota";

export type GameKind = "tictactoe" | "connect4" | "rps" | "mines" | "rota";

export interface GamePlayer {
  id: string;
  name: string;
}

export type GameStatus = "waiting" | "playing" | "won" | "draw" | "declined" | "cancelled";

export interface GameState {
  kind: GameKind;
  status: GameStatus;
  /** [host, guest]; the guest seat is empty until someone accepts. */
  players: [GamePlayer, GamePlayer | null];
  /** DM invites name who may accept; open invites in a channel don't. */
  invitee: string | null;
  /** Whose go it is (index into players). */
  turn: 0 | 1;
  winner: 0 | 1 | null;
  /**
   * The board as a string, one character per cell:
   * - tictactoe: 9 cells, "." / "X" (host) / "O" (guest)
   * - connect4: 42 cells, 7 columns × 6 rows, row 0 at the top; "." / "R" / "Y"
   * - mines: 256 cells (16×16): "." hidden, "0"–"8" uncovered, "A"/"B" a mine
   *   claimed by host/guest
   */
  board: string;
  /** Minesweeper Flags mines claimed; RPS rounds won. */
  scores: [number, number];
  /** The cell / column / throw from the last move, for highlighting. */
  last: number | null;
  /** RPS: who has thrown this round, and how the last round went. */
  rps?: {
    round: number;
    thrown: [boolean, boolean];
    lastRound: { throws: [Throw, Throw]; winner: 0 | 1 | null } | null;
  };
  /** Played alone (Rota): no second seat, and every turn is the host's. */
  solo?: boolean;
  /** Rota: the two countries to connect and every guess so far. */
  rota?: RotaState;
  /** A move counter, so a stale click can't land twice. */
  moves: number;
}

export type Throw = "rock" | "paper" | "scissors";

export interface GameSecret {
  /** mines: 256 "0"/"1" flags. */
  mines?: string;
  /** rps: this round's throws, hidden until both are in. */
  throws?: [Throw | null, Throw | null];
}

export const GAME_INFO: Record<GameKind, { name: string; emoji: string; blurb: string }> = {
  tictactoe: { name: "Tic-Tac-Toe", emoji: "⭕", blurb: "Three in a row on a 3×3 grid." },
  connect4: { name: "Four in a Row", emoji: "🔴", blurb: "Drop counters; line up four." },
  rps: { name: "Rock Paper Scissors", emoji: "✊", blurb: "Best of three, throws stay hidden." },
  mines: { name: "Minesweeper Flags", emoji: "🚩", blurb: "Find the mines; first to 26 wins." },
  rota: { name: "Rota", emoji: "🗺️", blurb: "Name countries to link two on the map." },
};

/** Games that can also be played alone. */
export const SOLO_GAMES: GameKind[] = ["rota"];

export const GAME_KINDS = Object.keys(GAME_INFO) as GameKind[];

export function isGameKind(value: unknown): value is GameKind {
  return typeof value === "string" && value in GAME_INFO;
}

export const MINES_SIZE = 16;
export const MINES_COUNT = 51;
/** More than half of 51: the game is decided. */
export const MINES_TO_WIN = 26;
const C4_COLS = 7;
const C4_ROWS = 6;
const RPS_TO_WIN = 2;

function emptyBoard(kind: GameKind): string {
  if (kind === "tictactoe") return ".".repeat(9);
  if (kind === "connect4") return ".".repeat(C4_COLS * C4_ROWS);
  if (kind === "mines") return ".".repeat(MINES_SIZE * MINES_SIZE);
  return "";
}

/** Shuffles MINES_COUNT mines into the field. `random` is injectable for tests. */
export function layMines(random: () => number = Math.random): string {
  const cells = MINES_SIZE * MINES_SIZE;
  const order = Array.from({ length: cells }, (_, i) => i);
  for (let i = cells - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const field = new Array<string>(cells).fill("0");
  for (const index of order.slice(0, MINES_COUNT)) field[index] = "1";
  return field.join("");
}

export function newGame(
  kind: GameKind,
  host: GamePlayer,
  invitee: string | null,
  random: () => number = Math.random,
  solo = false,
): { state: GameState; secret: GameSecret } {
  const state: GameState = {
    kind,
    status: solo ? "playing" : "waiting",
    ...(solo ? { solo: true } : {}),
    players: [host, null],
    invitee,
    turn: 0,
    winner: null,
    board: emptyBoard(kind),
    scores: [0, 0],
    last: null,
    moves: 0,
  };
  const secret: GameSecret = {};
  if (kind === "mines") secret.mines = layMines(random);
  if (kind === "rota") state.rota = newRota(random);
  if (kind === "rps") {
    state.rps = { round: 1, thrown: [false, false], lastRound: null };
    secret.throws = [null, null];
  }
  return { state, secret };
}

export type GameResult = { state: GameState; secret: GameSecret } | { error: string };

function seatOf(state: GameState, userId: string): 0 | 1 | null {
  if (state.players[0].id === userId) return 0;
  if (state.players[1]?.id === userId) return 1;
  return null;
}

/** Accepting the invitation takes the empty seat and starts the game. */
export function joinGame(state: GameState, secret: GameSecret, player: GamePlayer): GameResult {
  if (state.status !== "waiting") return { error: "This game has already started." };
  if (state.solo) return { error: "This is a one-player game." };
  if (player.id === state.players[0].id) return { error: "You can't play against yourself." };
  if (state.invitee && state.invitee !== player.id) return { error: "This invitation is for someone else." };
  return {
    state: { ...state, status: "playing", players: [state.players[0], player], moves: state.moves + 1 },
    secret,
  };
}

export function declineGame(state: GameState, secret: GameSecret, userId: string): GameResult {
  if (state.status !== "waiting") return { error: "This game has already started." };
  if (userId === state.players[0].id) {
    return { state: { ...state, status: "cancelled", moves: state.moves + 1 }, secret };
  }
  if (state.invitee && state.invitee !== userId) return { error: "This invitation is for someone else." };
  return { state: { ...state, status: "declined", moves: state.moves + 1 }, secret };
}

/** Giving up mid-game hands the win to the other player. */
export function resignGame(state: GameState, secret: GameSecret, userId: string): GameResult {
  const seat = seatOf(state, userId);
  if (seat === null) return { error: "You're not playing this game." };
  if (state.status !== "playing") return { error: "This game isn't being played." };
  if (state.solo) {
    const rota = state.rota && revealRota(state.rota);
    return { state: { ...state, rota, status: "cancelled", moves: state.moves + 1 }, secret };
  }
  const winner = (seat === 0 ? 1 : 0) as 0 | 1;
  return { state: { ...state, status: "won", winner, moves: state.moves + 1 }, secret };
}

const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

/** The winning line's cells, if there is one. */
export function tictactoeLine(board: string): number[] | null {
  for (const line of TTT_LINES) {
    const [a, b, c] = line;
    if (board[a] !== "." && board[a] === board[b] && board[a] === board[c]) return line;
  }
  return null;
}

/** Four in a row (any direction) through the cells, if there is one. */
export function connect4Line(board: string): number[] | null {
  const at = (row: number, col: number) =>
    row >= 0 && row < C4_ROWS && col >= 0 && col < C4_COLS ? board[row * C4_COLS + col] : "";
  for (let row = 0; row < C4_ROWS; row += 1) {
    for (let col = 0; col < C4_COLS; col += 1) {
      const piece = at(row, col);
      if (piece === ".") continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const cells = [0, 1, 2, 3].map((k) => [row + dr * k, col + dc * k]);
        if (cells.every(([r, c]) => at(r, c) === piece)) {
          return cells.map(([r, c]) => r * C4_COLS + c);
        }
      }
    }
  }
  return null;
}

function neighbours(index: number): number[] {
  const row = Math.floor(index / MINES_SIZE);
  const col = index % MINES_SIZE;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (!dr && !dc) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < MINES_SIZE && c >= 0 && c < MINES_SIZE) out.push(r * MINES_SIZE + c);
    }
  }
  return out;
}

/** Uncovers a safe cell, flooding outward through empty (0) cells. */
function uncover(board: string[], mines: string, start: number): void {
  const queue = [start];
  while (queue.length) {
    const index = queue.pop()!;
    if (board[index] !== ".") continue;
    const count = neighbours(index).filter((n) => mines[n] === "1").length;
    board[index] = String(count);
    if (count === 0) {
      for (const n of neighbours(index)) if (board[n] === "." && mines[n] !== "1") queue.push(n);
    }
  }
}

function beats(a: Throw, b: Throw): boolean {
  return (a === "rock" && b === "scissors") || (a === "paper" && b === "rock") || (a === "scissors" && b === "paper");
}

/**
 * One move by `userId`. `move` is a cell (tictactoe, mines), a column
 * (connect4) or a throw (rps).
 */
export function playMove(
  state: GameState,
  secret: GameSecret,
  userId: string,
  move: unknown,
): GameResult {
  if (state.status !== "playing") return { error: "This game isn't being played." };
  const seat = seatOf(state, userId);
  if (seat === null) return { error: "You're not playing this game." };
  const next = { ...state, moves: state.moves + 1 };
  const other = (seat === 0 ? 1 : 0) as 0 | 1;

  if (state.kind === "rps") {
    if (move !== "rock" && move !== "paper" && move !== "scissors") return { error: "Pick rock, paper or scissors." };
    const rps = state.rps ?? { round: 1, thrown: [false, false] as [boolean, boolean], lastRound: null };
    if (rps.thrown[seat]) return { error: "You've already thrown this round." };
    const throws: [Throw | null, Throw | null] = [...(secret.throws ?? [null, null])] as [Throw | null, Throw | null];
    throws[seat] = move;
    const thrown: [boolean, boolean] = [...rps.thrown] as [boolean, boolean];
    thrown[seat] = true;
    if (!throws[0] || !throws[1]) {
      return { state: { ...next, rps: { ...rps, thrown } }, secret: { throws } };
    }
    const both = throws as [Throw, Throw];
    const winner: 0 | 1 | null = both[0] === both[1] ? null : beats(both[0], both[1]) ? 0 : 1;
    const scores: [number, number] = [...state.scores] as [number, number];
    if (winner !== null) scores[winner] += 1;
    const over = winner !== null && scores[winner] >= RPS_TO_WIN;
    return {
      state: {
        ...next,
        scores,
        status: over ? "won" : "playing",
        winner: over ? winner : null,
        rps: { round: rps.round + 1, thrown: [false, false], lastRound: { throws: both, winner } },
      },
      secret: { throws: [null, null] },
    };
  }

  if (state.turn !== seat) return { error: "It's not your turn." };

  if (state.kind === "rota") {
    if (!state.rota) return { error: "This game is broken." };
    const result = guessRota(state.rota, seat, move);
    if ("error" in result) return result;
    const scores: [number, number] = [...state.scores] as [number, number];
    scores[seat] += 1;
    if (result.connected) return { state: { ...next, rota: result.rota, scores, status: "won", winner: seat }, secret };
    if (result.exhausted) return { state: { ...next, rota: result.rota, scores, status: "draw" }, secret };
    return { state: { ...next, rota: result.rota, scores, turn: state.solo ? seat : other }, secret };
  }

  const index = Number(move);

  if (state.kind === "tictactoe") {
    if (!Number.isInteger(index) || index < 0 || index > 8 || state.board[index] !== ".") {
      return { error: "Pick an empty square." };
    }
    const board = state.board.slice(0, index) + (seat === 0 ? "X" : "O") + state.board.slice(index + 1);
    if (tictactoeLine(board)) return { state: { ...next, board, last: index, status: "won", winner: seat }, secret };
    if (!board.includes(".")) return { state: { ...next, board, last: index, status: "draw" }, secret };
    return { state: { ...next, board, last: index, turn: other }, secret };
  }

  if (state.kind === "connect4") {
    if (!Number.isInteger(index) || index < 0 || index >= C4_COLS) return { error: "Pick a column." };
    let row = -1;
    for (let r = C4_ROWS - 1; r >= 0; r -= 1) {
      if (state.board[r * C4_COLS + index] === ".") {
        row = r;
        break;
      }
    }
    if (row < 0) return { error: "That column is full." };
    const cell = row * C4_COLS + index;
    const board = state.board.slice(0, cell) + (seat === 0 ? "R" : "Y") + state.board.slice(cell + 1);
    if (connect4Line(board)) return { state: { ...next, board, last: cell, status: "won", winner: seat }, secret };
    if (!board.includes(".")) return { state: { ...next, board, last: cell, status: "draw" }, secret };
    return { state: { ...next, board, last: cell, turn: other }, secret };
  }

  // Minesweeper Flags.
  const mines = secret.mines ?? "";
  if (!Number.isInteger(index) || index < 0 || index >= MINES_SIZE * MINES_SIZE || state.board[index] !== ".") {
    return { error: "Pick a covered square." };
  }
  const board = state.board.split("");
  if (mines[index] === "1") {
    // Found one: it's yours, and you go again.
    board[index] = seat === 0 ? "A" : "B";
    const scores: [number, number] = [...state.scores] as [number, number];
    scores[seat] += 1;
    const won = scores[seat] >= MINES_TO_WIN;
    return {
      state: { ...next, board: board.join(""), scores, last: index, status: won ? "won" : "playing", winner: won ? seat : null },
      secret,
    };
  }
  uncover(board, mines, index);
  return { state: { ...next, board: board.join(""), last: index, turn: other }, secret };
}
