import { describe, expect, it } from "vitest";
import {
  MINES_COUNT,
  MINES_SIZE,
  MINES_TO_WIN,
  declineGame,
  joinGame,
  layMines,
  newGame,
  playMove,
  resignGame,
  type GameKind,
  type GameResult,
  type GameSecret,
  type GameState,
} from "./games";

const host = { id: "h", name: "Host" };
const guest = { id: "g", name: "Guest" };

function ok(result: GameResult): { state: GameState; secret: GameSecret } {
  if ("error" in result) throw new Error(result.error);
  return result;
}

function started(kind: GameKind, random?: () => number) {
  const game = newGame(kind, host, null, random);
  return ok(joinGame(game.state, game.secret, guest));
}

describe("invitations", () => {
  it("lets someone else accept, and only the invitee in a DM", () => {
    const open = newGame("tictactoe", host, null);
    expect("error" in joinGame(open.state, open.secret, host)).toBe(true);
    expect(ok(joinGame(open.state, open.secret, guest)).state.status).toBe("playing");

    const dm = newGame("tictactoe", host, "someone-else");
    expect("error" in joinGame(dm.state, dm.secret, guest)).toBe(true);
  });

  it("declines, cancels and resigns", () => {
    const game = newGame("connect4", host, null);
    expect(ok(declineGame(game.state, game.secret, "g")).state.status).toBe("declined");
    expect(ok(declineGame(game.state, game.secret, "h")).state.status).toBe("cancelled");
    const playing = started("connect4");
    const resigned = ok(resignGame(playing.state, playing.secret, "h")).state;
    expect(resigned.status).toBe("won");
    expect(resigned.winner).toBe(1);
  });
});

describe("tic-tac-toe", () => {
  it("takes turns and spots three in a row", () => {
    let game = started("tictactoe");
    expect("error" in playMove(game.state, game.secret, "g", 0)).toBe(true); // not their turn
    for (const [who, cell] of [["h", 0], ["g", 3], ["h", 1], ["g", 4]] as const) {
      game = ok(playMove(game.state, game.secret, who, cell));
    }
    expect("error" in playMove(game.state, game.secret, "h", 0)).toBe(true); // taken
    game = ok(playMove(game.state, game.secret, "h", 2));
    expect(game.state.status).toBe("won");
    expect(game.state.winner).toBe(0);
    expect(game.state.board).toBe("XXXOO....");
  });

  it("calls a full board with no line a draw", () => {
    let game = started("tictactoe");
    for (const [who, cell] of [["h", 0], ["g", 1], ["h", 2], ["g", 4], ["h", 3], ["g", 5], ["h", 7], ["g", 6], ["h", 8]] as const) {
      game = ok(playMove(game.state, game.secret, who, cell));
    }
    expect(game.state.status).toBe("draw");
  });
});

describe("four in a row", () => {
  it("drops counters to the bottom and finds a vertical four", () => {
    let game = started("connect4");
    for (const [who, col] of [["h", 3], ["g", 4], ["h", 3], ["g", 4], ["h", 3], ["g", 4]] as const) {
      game = ok(playMove(game.state, game.secret, who, col));
    }
    expect(game.state.board[5 * 7 + 3]).toBe("R");
    game = ok(playMove(game.state, game.secret, "h", 3));
    expect(game.state.status).toBe("won");
  });

  it("refuses a full column", () => {
    let game = started("connect4");
    for (let i = 0; i < 6; i += 1) {
      game = ok(playMove(game.state, game.secret, i % 2 ? "g" : "h", 0));
    }
    expect("error" in playMove(game.state, game.secret, "h", 0)).toBe(true);
  });
});

describe("rock paper scissors", () => {
  it("hides the first throw and scores the round when both are in", () => {
    let game = started("rps");
    game = ok(playMove(game.state, game.secret, "h", "rock"));
    expect(game.state.rps?.thrown).toEqual([true, false]);
    expect(JSON.stringify(game.state)).not.toContain("rock");
    expect("error" in playMove(game.state, game.secret, "h", "paper")).toBe(true);
    game = ok(playMove(game.state, game.secret, "g", "scissors"));
    expect(game.state.scores).toEqual([1, 0]);
    expect(game.state.rps?.lastRound?.winner).toBe(0);
    game = ok(playMove(game.state, game.secret, "h", "paper"));
    game = ok(playMove(game.state, game.secret, "g", "rock"));
    expect(game.state.status).toBe("won");
    expect(game.state.winner).toBe(0);
  });

  it("replays a tied round without scoring", () => {
    let game = started("rps");
    game = ok(playMove(game.state, game.secret, "h", "rock"));
    game = ok(playMove(game.state, game.secret, "g", "rock"));
    expect(game.state.scores).toEqual([0, 0]);
    expect(game.state.rps?.round).toBe(2);
  });
});

describe("minesweeper flags", () => {
  it("lays exactly the right number of mines", () => {
    const mines = layMines();
    expect(mines).toHaveLength(MINES_SIZE * MINES_SIZE);
    expect([...mines].filter((c) => c === "1")).toHaveLength(MINES_COUNT);
  });

  it("keeps the turn on a mine, passes it on a safe square, and floods zeros", () => {
    let game = started("mines");
    const mine = game.secret.mines!.indexOf("1");
    game = ok(playMove(game.state, game.secret, "h", mine));
    expect(game.state.board[mine]).toBe("A");
    expect(game.state.scores).toEqual([1, 0]);
    expect(game.state.turn).toBe(0);

    const safe = game.secret.mines!.indexOf("0");
    game = ok(playMove(game.state, game.secret, "h", safe));
    expect(game.state.board[safe]).toMatch(/[0-8]/);
    expect(game.state.turn).toBe(1);
    // No mine is ever uncovered as a number.
    [...game.state.board].forEach((cell, i) => {
      if (/[0-8]/.test(cell)) expect(game.secret.mines![i]).toBe("0");
    });
  });

  it("ends when someone reaches the winning count", () => {
    let game = started("mines");
    const mines = [...game.secret.mines!].flatMap((c, i) => (c === "1" ? [i] : []));
    for (const cell of mines.slice(0, MINES_TO_WIN)) {
      game = ok(playMove(game.state, game.secret, "h", cell));
    }
    expect(game.state.status).toBe("won");
    expect(game.state.winner).toBe(0);
  });
});
