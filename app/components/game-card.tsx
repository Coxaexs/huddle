"use client";

import { useEffect, useRef, useState } from "react";
import { playSound } from "../lib/msn-sounds";
import { apiFetch } from "../lib/client";
import {
  GAME_INFO,
  GAME_KINDS,
  SOLO_GAMES,
  MINES_SIZE,
  MINES_TO_WIN,
  connect4Line,
  tictactoeLine,
  type GameKind,
  type GameState,
  type Throw,
} from "@/lib/games";
import { stripTextStyle } from "@/lib/text-style";
import { StyledText } from "./message-body";
import { RotaBoard } from "./rota-board";

const THROWS: Array<{ id: Throw; emoji: string }> = [
  { id: "rock", emoji: "✊" },
  { id: "paper", emoji: "✋" },
  { id: "scissors", emoji: "✌️" },
];

/** Each seat's piece, per game. */
const PIECES: Record<GameKind, [string, string]> = {
  tictactoe: ["✕", "◯"],
  connect4: ["🔴", "🟡"],
  rps: ["", ""],
  mines: ["🚩", "🚩"],
  rota: ["", ""],
};

/**
 * A conversation game (lib/games.ts) as a card: the invitation, the board,
 * and whatever the viewer can do next. Moves go to /api/games; the new state
 * comes back to everyone as an edit of this message.
 */
export function GameCard({
  messageId,
  game,
  userId,
  onPlayAgain,
}: {
  messageId: string;
  game: GameState;
  userId: string;
  /** Starts a fresh game of the same kind in this conversation. */
  onPlayAgain: (kind: GameKind, solo?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = GAME_INFO[game.kind];
  const [host, guest] = game.players;
  const seat = host.id === userId ? 0 : guest?.id === userId ? 1 : null;
  const myTurn = game.status === "playing" && seat !== null && (game.kind === "rps" || game.turn === seat);
  const over = game.status === "won" || game.status === "draw";

  // Game sounds (the Sounds dialog's "Games" choice): a win, a mine found,
  // or your turn coming round. Only for changes that arrive while watching.
  const seen = useRef<GameState | null>(null);
  useEffect(() => {
    const before = seen.current;
    seen.current = game;
    if (!before || before.moves === game.moves || seat === null) return;
    if (game.status === "won" && before.status !== "won") {
      playSound("game", game.winner === seat ? "win" : "turn");
    } else if (game.kind === "mines" && game.scores.some((n, i) => n > before.scores[i])) {
      playSound("game", "mine");
    } else if (game.status === "playing" && game.kind !== "rps" && game.turn === seat && before.turn !== seat) {
      playSound("game", "turn");
    } else if (game.kind === "rps" && (game.rps?.round ?? 0) > (before.rps?.round ?? 0)) {
      playSound("game", "turn");
    } else if (game.status === "playing" && before.status === "waiting") {
      playSound("game", "turn");
    }
  }, [game, seat]);

  async function act(action: string, move?: unknown) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/games", {
        method: "POST",
        body: JSON.stringify({ action, messageId, move }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  /** Plain names for sentences; the player chips below show them decorated. */
  const nameOf = (i: 0 | 1) => stripTextStyle(i === 0 ? host.name : guest?.name ?? "…");
  let status: string;
  if (game.status === "waiting") {
    status =
      seat === 0
        ? "Waiting for someone to accept…"
        : `${nameOf(0)} has invited you to play ${info.name}.`;
  } else if (game.status === "declined") {
    status = "The invitation was declined.";
  } else if (game.status === "cancelled") {
    status = game.solo ? `${nameOf(0)} gave up.` : `${nameOf(0)} cancelled the invitation.`;
  } else if (game.status === "draw") {
    status = game.solo ? "Out of guesses!" : "It's a draw!";
  } else if (game.status === "won") {
    status = game.winner === seat ? "You won! 🎉" : `${nameOf(game.winner ?? 0)} won!`;
  } else if (game.solo) {
    status = seat === 0 ? "Name a country." : `${nameOf(0)} is playing solo.`;
  } else if (game.kind === "rps") {
    const thrown = game.rps?.thrown ?? [false, false];
    status =
      seat !== null && thrown[seat]
        ? `Waiting for ${nameOf(seat === 0 ? 1 : 0)} to throw…`
        : seat !== null
          ? `Round ${game.rps?.round ?? 1}: pick your throw.`
          : `Round ${game.rps?.round ?? 1}`;
  } else {
    status = myTurn ? "Your turn." : `${nameOf(game.turn)}'s turn.`;
  }

  const winLine =
    game.kind === "tictactoe" ? tictactoeLine(game.board) : game.kind === "connect4" ? connect4Line(game.board) : null;

  return (
    <section
      className={`game-card game-${game.kind} ${game.status === "won" && game.winner === seat ? "game-won" : ""} ${myTurn ? "my-turn" : ""}`}
      aria-label={info.name}
    >
      {game.status === "won" && (
        <div className="game-banner" role="status">
          🏆 {game.winner === seat ? "You win!" : `${nameOf(game.winner ?? 0)} wins!`}
        </div>
      )}
      <header className="game-card-head">
        <span className="game-card-icon" aria-hidden="true">
          {info.emoji}
        </span>
        <div>
          <strong>{info.name}</strong>
          <small>{status}</small>
        </div>
      </header>

      <div className="game-players">
        {(game.solo ? ([0] as const) : ([0, 1] as const)).map((i) => (
          <span
            key={i}
            className={`game-player seat-${i} ${game.status === "playing" && game.kind !== "rps" && game.turn === i ? "to-move" : ""} ${over && game.winner === i ? "winner" : ""}`}
          >
            {PIECES[game.kind][i] && <span className="game-piece">{PIECES[game.kind][i]}</span>}
            {i === 1 && !guest ? <em>Open seat</em> : <StyledText text={i === 0 ? host.name : guest?.name} />}
            {(game.kind === "mines" || game.kind === "rps" || game.kind === "rota") && <b>{game.scores[i]}</b>}
          </span>
        ))}
      </div>

      {game.status !== "waiting" && game.status !== "declined" && (game.status !== "cancelled" || game.solo) && (
        <>
          {game.kind === "tictactoe" && (
            <div className="game-grid ttt-grid">
              {[...game.board].map((cell, i) => (
                <button
                  key={i}
                  type="button"
                  className={`ttt-cell ${winLine?.includes(i) ? "win" : ""} ${game.last === i ? "last" : ""}`}
                  disabled={!myTurn || cell !== "." || busy}
                  onClick={() => void act("move", i)}
                  aria-label={`Square ${i + 1}${cell === "." ? "" : `, ${cell}`}`}
                >
                  {cell === "X" ? PIECES.tictactoe[0] : cell === "O" ? PIECES.tictactoe[1] : ""}
                </button>
              ))}
            </div>
          )}

          {game.kind === "connect4" && (
            <div className="game-grid c4-grid" role="grid">
              {[...game.board].map((cell, i) => (
                <button
                  key={i}
                  type="button"
                  className={`c4-cell ${winLine?.includes(i) ? "win" : ""} ${game.last === i ? "last" : ""}`}
                  disabled={!myTurn || busy || game.board[i % 7] !== "."}
                  onClick={() => void act("move", i % 7)}
                  aria-label={`Column ${(i % 7) + 1}`}
                >
                  <span className={`c4-disc ${cell === "R" ? "red" : cell === "Y" ? "yellow" : ""}`} />
                </button>
              ))}
            </div>
          )}

          {game.kind === "rps" && (
            <div className="rps-area">
              {game.rps?.lastRound && (
                <p className="rps-last">
                  {THROWS.find((t) => t.id === game.rps!.lastRound!.throws[0])?.emoji} {nameOf(0)} vs{" "}
                  {nameOf(1)} {THROWS.find((t) => t.id === game.rps!.lastRound!.throws[1])?.emoji}
                  {" — "}
                  {game.rps.lastRound.winner === null ? "tie!" : `${nameOf(game.rps.lastRound.winner)} takes it`}
                </p>
              )}
              {game.status === "playing" && seat !== null && !(game.rps?.thrown[seat]) && (
                <div className="rps-throws">
                  {THROWS.map((t) => (
                    <button key={t.id} type="button" disabled={busy} onClick={() => void act("move", t.id)}>
                      <span>{t.emoji}</span>
                      {t.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {game.kind === "rota" && game.rota && (
            <RotaBoard
              rota={game.rota}
              canGuess={myTurn}
              busy={busy}
              onGuess={(country) => void act("move", country)}
            />
          )}

          {game.kind === "mines" && (
            <>
              <p className="mines-goal">First to {MINES_TO_WIN} mines wins. Find one and you go again.</p>
              <div className="game-grid mines-grid" style={{ gridTemplateColumns: `repeat(${MINES_SIZE}, 1fr)` }}>
                {[...game.board].map((cell, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`mines-cell ${cell === "." ? "covered" : cell === "A" || cell === "B" ? `flag flag-${cell}` : `open n${cell}`} ${game.last === i ? "last" : ""}`}
                    disabled={!myTurn || cell !== "." || busy}
                    onClick={() => void act("move", i)}
                    aria-label={`Row ${Math.floor(i / MINES_SIZE) + 1}, column ${(i % MINES_SIZE) + 1}`}
                  >
                    {cell === "A" || cell === "B" ? <span className="mines-flag">🚩</span> : cell !== "." && cell !== "0" ? cell : ""}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="game-actions">
        {game.status === "waiting" && seat === null && (
          <>
            <button type="button" className="primary" disabled={busy} onClick={() => void act("join")}>
              Accept
            </button>
            <button type="button" disabled={busy} onClick={() => void act("decline")}>
              Decline
            </button>
          </>
        )}
        {game.status === "waiting" && seat === 0 && (
          <button type="button" disabled={busy} onClick={() => void act("decline")}>
            Cancel
          </button>
        )}
        {game.status === "playing" && seat !== null && (
          <button type="button" disabled={busy} onClick={() => void act("resign")}>
            Give up
          </button>
        )}
        {(over || game.status === "declined" || (game.solo && game.status === "cancelled")) && (
          <button type="button" className="primary" onClick={() => onPlayAgain(game.kind, game.solo)}>
            Play again
          </button>
        )}
      </div>
      {error && <p className="game-error">{error}</p>}
    </section>
  );
}

/**
 * The Games menu for every theme: invite the conversation to one of the
 * conversation games, or head to the voice-room activities.
 */
export function GamesPicker({
  onStart,
  onActivities,
  inVoice,
  onClose,
}: {
  onStart: (kind: GameKind, solo?: boolean) => void;
  onActivities: () => void;
  inVoice: boolean;
  onClose: () => void;
}) {
  return (
    <div className="games-picker" role="dialog" aria-label="Games">
      <header>
        <strong>Games</strong>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <p>Invite everyone in this conversation to play:</p>
      <div className="games-picker-list">
        {GAME_KINDS.map((kind) => (
          <div key={kind} className="games-row">
            <button type="button" onClick={() => onStart(kind)}>
              <span aria-hidden="true">{GAME_INFO[kind].emoji}</span>
              <span>
                <strong>{GAME_INFO[kind].name}</strong>
                <small>{GAME_INFO[kind].blurb}</small>
              </span>
            </button>
            {SOLO_GAMES.includes(kind) && (
              <button type="button" className="games-solo" onClick={() => onStart(kind, true)}>
                Play alone
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="games-picker-more" onClick={onActivities}>
        {inVoice
          ? "Voice activities: Whiteboard, Draw & Guess, DeepPixel…"
          : "Join a voice room for Whiteboard, Draw & Guess and more"}
      </button>
    </div>
  );
}
