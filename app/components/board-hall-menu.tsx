"use client";

/**
 * The board hall's game menu: play the room's DeepPixel game without leaving
 * the 3D room. Roll, end your turn, use joker cards, build, mortgage, take
 * credit, trade: every button here presses the real one in the game's page
 * (kept loaded out of sight), and every dialog the game opens (buying, cards,
 * auctions, trades, jail) shows up here as a card you answer in place.
 */
import { useState } from "react";
import { ArrowRightLeft, Banknote, ChevronDown, ChevronUp, Dices, Gamepad2, Home, Sparkles, Users, X } from "lucide-react";
import {
  boardOf, deepPixelPlayerId, spaceGlyph,
  type BoardGameState, type BridgeCommand, type BridgeControl, type BridgeDialog, type BridgeItem, type BridgeState,
} from "../lib/board-game";
import type { BridgeToast } from "../hooks/use-deeppixel-bridge";

interface Props {
  game: BoardGameState | null;
  gameId: string | null;
  bridge: BridgeState | null;
  toasts: BridgeToast[];
  send: (command: BridgeCommand) => void;
  /** My Hoffle account id. */
  userId: string | null;
  onPlay?: () => void;
  /** A tile someone clicked on the floor board, to show its card. */
  tile: number | null;
  onCloseTile: () => void;
}

const CONTROL_LOOK: Record<BridgeControl["key"], { label: string; icon: typeof Dices }> = {
  roll: { label: "Roll", icon: Dices },
  end: { label: "End turn", icon: ChevronDown },
  joker: { label: "Joker cards", icon: Sparkles },
  manage: { label: "Build & mortgage", icon: Home },
  credit: { label: "Credit", icon: Banknote },
  team: { label: "Team", icon: Users },
  trades: { label: "Trades", icon: ArrowRightLeft },
};

function Item({ item, send }: { item: BridgeItem; send: Props["send"] }) {
  switch (item.kind) {
    case "text":
      return <p className={`bh-text${item.strong ? " strong" : ""}`} style={item.color ? { color: item.color } : undefined}>{item.text}</p>;
    case "button":
      return (
        <button type="button" className={`bh-btn ${item.tone || ""}`} disabled={item.disabled} onClick={() => send({ type: "click", id: item.id })}>
          {item.label}
        </button>
      );
    case "input":
      return (
        <label className="bh-field">
          {item.label && <span>{item.label}</span>}
          <input
            key={item.id}
            type={item.inputType === "number" || item.inputType === "range" ? item.inputType : "text"}
            defaultValue={item.value}
            min={item.min || undefined}
            max={item.max || undefined}
            step={item.step || undefined}
            placeholder={item.placeholder}
            disabled={item.disabled}
            onChange={(event) => send({ type: "input", id: item.id, value: event.target.value })}
          />
        </label>
      );
    case "select":
      return (
        <label className="bh-field">
          {item.label && <span>{item.label}</span>}
          <select value={item.value} disabled={item.disabled} onChange={(event) => send({ type: "input", id: item.id, value: event.target.value })}>
            {item.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      );
    case "check":
      return (
        <label className="bh-check">
          <input type={item.radio ? "radio" : "checkbox"} checked={item.checked} disabled={item.disabled} onChange={(event) => send({ type: "input", id: item.id, value: event.target.checked })} />
          <span>{item.label}</span>
        </label>
      );
  }
}

/** Runs of buttons sit side by side; everything else stacks. */
function Items({ items, send }: { items: BridgeItem[]; send: Props["send"] }) {
  const groups: BridgeItem[][] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (item.kind === "button" && last && last[0].kind === "button") last.push(item);
    else groups.push([item]);
  }
  return (
    <>
      {groups.map((group, i) => group[0].kind === "button"
        ? <div key={i} className="bh-row">{group.map((item, j) => <Item key={j} item={item} send={send} />)}</div>
        : <Item key={i} item={group[0]} send={send} />)}
    </>
  );
}

function Dialog({ dialog, send }: { dialog: BridgeDialog; send: Props["send"] }) {
  return (
    <section className={`bh-dialog bh-dialog-${dialog.key}`} role="dialog" aria-label={dialog.title || "Game"}>
      <header>
        <strong>{dialog.title || "DeepPixel"}</strong>
        {dialog.dismissable && <button type="button" onClick={() => send({ type: "open", what: "close" })} aria-label="Close"><X size={14} /></button>}
      </header>
      <div className="bh-dialog-body"><Items items={dialog.items} send={send} /></div>
    </section>
  );
}

export function BoardHallMenu({ game, gameId, bridge, toasts, send, userId, onPlay, tile, onCloseTile }: Props) {
  const [open, setOpen] = useState<"none" | "props" | "players">("none");
  const board = boardOf(game);
  const myId = userId ? deepPixelPlayerId(userId) : null;
  const players = game?.players ?? [];
  const me = players.find((player) => player.id === myId) ?? null;
  const playing = game?.state === "playing" || (game && game.state !== "lobby" && players.length > 0);
  const turn = playing ? players[game!.currentPlayerIndex ?? 0] : null;
  const myTurn = Boolean(turn && turn.id === myId);
  const controls = new Map((bridge?.controls ?? []).map((control) => [control.key, control]));
  const press = (key: BridgeControl["key"]) => {
    const control = controls.get(key);
    if (control && !control.disabled) send({ type: "click", id: control.id });
  };
  const mine = (game?.properties ?? []).filter((property) => property.ownerId === myId);
  const dialogs = bridge?.dialogs ?? [];
  const pendingTrades = (bridge?.trades ?? []).some((item) => item.kind === "button");

  const status = !gameId ? "No game here yet."
    : !game ? "Opening the game…"
      : game.state === "lobby" ? `In the lobby · ${players.length} joined`
        : !bridge ? "Connecting you to your seat…"
          : myTurn ? (controls.get("roll") && !controls.get("roll")!.disabled ? "Your turn: roll the dice." : "Your turn.")
            : turn ? `${turn.name}'s turn.` : bridge.turnInfo;

  const tileSpace = tile !== null ? board[tile] : null;
  const tileState = tile !== null ? game?.properties?.find((property) => property.spaceIndex === tile) ?? game?.properties?.[tile] : null;
  const tileOwner = tileState?.ownerId ? players.find((player) => player.id === tileState.ownerId) : null;

  return (
    <>
      <style>{BOARD_MENU_CSS}</style>
      {toasts.length > 0 && (
        <div className="bh-toasts" aria-live="polite">
          {toasts.map((toast) => <div key={toast.id} className={`bh-toast ${toast.tone}`}>{toast.message}</div>)}
        </div>
      )}

      {(dialogs.length > 0 || tileSpace) && (
        <div className="bh-dialogs">
          {dialogs.map((dialog) => <Dialog key={`${dialog.key}-${dialog.title}`} dialog={dialog} send={send} />)}
          {tileSpace && dialogs.length === 0 && (
            <section className="bh-dialog bh-tile">
              <header>
                <strong>{spaceGlyph(tileSpace)} {tileSpace.name}</strong>
                <button type="button" onClick={onCloseTile} aria-label="Close"><X size={14} /></button>
              </header>
              <div className="bh-dialog-body">
                {tileSpace.color && <i className="bh-band" style={{ background: tileSpace.color }} />}
                {tileSpace.price ? <p className="bh-text">Price ${tileSpace.price}</p> : null}
                <p className="bh-text">
                  {tileOwner ? <>Owned by <b style={{ color: tileOwner.color }}>{tileOwner.id === myId ? "you" : tileOwner.name}</b>{tileState?.houses ? ` · ${tileState.houses >= 5 ? "hotel" : `${tileState.houses} house${tileState.houses > 1 ? "s" : ""}`}` : ""}{tileState?.mortgaged ? " · mortgaged" : ""}</>
                    : tileSpace.price ? "Nobody owns it yet." : ""}
                </p>
                {bridge && <div className="bh-row"><button type="button" className="bh-btn" onClick={() => { send({ type: "open", what: "tile", index: tile! }); onCloseTile(); }}>Details & rent</button></div>}
              </div>
            </section>
          )}
        </div>
      )}

      <div className="bh-tray" role="group" aria-label="DeepPixel">
        <div className="bh-head">
          <strong><Gamepad2 size={14} /> DeepPixel{gameId ? <small> · {gameId}</small> : null}</strong>
          {me && <b className="bh-cash">${Math.round(me.money ?? 0).toLocaleString()}</b>}
        </div>
        <p className={`bh-status${myTurn ? " mine" : ""}`}>{status}</p>

        {(!gameId || !game || game.state === "lobby" || !bridge || !me) && (
          <button type="button" className="bh-btn primary wide" onClick={onPlay} disabled={!onPlay}>
            <Gamepad2 size={15} /> {!gameId ? "Start a game" : game?.state === "lobby" ? "Open the lobby" : !me && game ? "Join the game" : "Open the game"}
          </button>
        )}

        {bridge && me && playing && (
          <>
            <div className="bh-actions">
              <button type="button" className={`bh-roll${myTurn && !controls.get("roll")?.disabled ? " ready" : ""}`} disabled={!controls.get("roll") || controls.get("roll")!.disabled} onClick={() => press("roll")}>
                <Dices size={18} /> Roll
              </button>
              <button type="button" className="bh-btn" disabled={!controls.get("end") || controls.get("end")!.disabled} onClick={() => press("end")}>End turn</button>
            </div>
            <div className="bh-chips">
              {(["joker", "manage", "credit", "team", "trades"] as const).map((key) => {
                const control = controls.get(key);
                if (!control || control.hidden) return null;
                const { label, icon: Icon } = CONTROL_LOOK[key];
                return (
                  <button key={key} type="button" className={key === "trades" && pendingTrades ? "alert" : ""} disabled={control.disabled} onClick={() => press(key)} title={control.label || label}>
                    <Icon size={13} /> {label}
                  </button>
                );
              })}
            </div>
            {pendingTrades && (
              <div className="bh-trades"><Items items={bridge.trades} send={send} /></div>
            )}
          </>
        )}

        {playing && (
          <div className="bh-sections">
            <button type="button" onClick={() => setOpen(open === "props" ? "none" : "props")} aria-expanded={open === "props"}>
              My properties ({mine.length}) {open === "props" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button type="button" onClick={() => setOpen(open === "players" ? "none" : "players")} aria-expanded={open === "players"}>
              Players ({players.filter((p) => !p.isBankrupt).length}) {open === "players" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        )}
        {playing && open === "props" && (
          <ul className="bh-list">
            {mine.length === 0 && <li className="bh-empty">Nothing yet. Land on a street and buy it.</li>}
            {mine.map((property) => {
              const space = board[property.spaceIndex];
              if (!space) return null;
              return (
                <li key={property.spaceIndex}>
                  <button type="button" onClick={() => send({ type: "open", what: "tile", index: property.spaceIndex })} disabled={!bridge}>
                    <i style={{ background: space.color || "#8b8f98" }} />
                    <span>{space.name}</span>
                    <small>{property.mortgaged ? "mortgaged" : property.houses ? (property.houses >= 5 ? "🏨" : "🏠".repeat(property.houses)) : `$${space.price ?? ""}`}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {playing && open === "players" && (
          <ul className="bh-list">
            {players.map((player) => (
              <li key={player.id} className={`${player.id === turn?.id ? "turn" : ""}${player.isBankrupt ? " out" : ""}`}>
                <button type="button" onClick={() => send({ type: "open", what: "player", id: player.id })} disabled={!bridge}>
                  <i style={{ background: player.color || "#ffd166" }} />
                  <span>{player.name}{player.id === myId ? " (you)" : ""}{player.inJail ? " ⛓" : ""}</span>
                  <small>${Math.round(player.money ?? 0).toLocaleString()} · {board[((player.position ?? 0) % board.length + board.length) % board.length]?.name}</small>
                </button>
                {bridge && me && player.id !== myId && !player.isBankrupt && (
                  <button type="button" className="bh-mini" onClick={() => send({ type: "open", what: "trade", id: player.id })} title={`Trade with ${player.name}`}><ArrowRightLeft size={12} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

const BOARD_MENU_CSS = `
.bh-tray { position: absolute; left: 10px; bottom: 84px; width: min(320px, calc(100% - 20px)); max-height: calc(100% - 160px); overflow-y: auto; display: grid; gap: 8px; padding: 10px 12px; background: var(--lr-panel); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: var(--lr-ink); border: 1px solid var(--lr-edge); border-radius: 16px; font-size: 13px; z-index: 3; }
.bh-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.bh-head strong { display: inline-flex; align-items: center; gap: 6px; }
.bh-head small { font-weight: 500; opacity: 0.6; letter-spacing: 0.06em; }
.bh-cash { color: var(--lr-accent); font-variant-numeric: tabular-nums; font-size: 15px; }
.bh-status { margin: 0; opacity: 0.85; line-height: 1.35; }
.bh-status.mine { opacity: 1; color: var(--lr-accent); font-weight: 700; }
.bh-actions { display: grid; grid-template-columns: 1.4fr 1fr; gap: 6px; }
.bh-roll { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; border-radius: 12px; font-size: 15px; font-weight: 800; color: #1b1530; background: var(--lr-accent); transition: transform 0.12s, filter 0.12s; }
.bh-roll.ready { animation: bh-pulse 1.4s ease-in-out infinite; }
.bh-roll:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.08); }
.bh-roll:disabled { opacity: 0.4; }
@keyframes bh-pulse { 50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--lr-accent) 25%, transparent); } }
.bh-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 4px 10px; border-radius: 10px; font-size: 12px; font-weight: 700; color: inherit; background: rgba(255, 220, 170, 0.1); border: 1px solid transparent; text-align: center; line-height: 1.25; }
.bh-btn:hover:not(:disabled) { background: rgba(255, 220, 170, 0.22); }
.bh-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bh-btn.primary { background: var(--lr-accent); color: #1b1530; }
.bh-btn.danger { background: rgba(239, 68, 68, 0.22); border-color: rgba(239, 68, 68, 0.35); }
.bh-btn.muted { background: rgba(255, 255, 255, 0.06); }
.bh-btn.wide { width: 100%; height: 38px; }
.bh-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.bh-chips button { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 9px; border-radius: 999px; font-size: 11px; font-weight: 700; color: inherit; background: rgba(255, 220, 170, 0.1); }
.bh-chips button:hover:not(:disabled) { background: rgba(255, 220, 170, 0.22); }
.bh-chips button:disabled { opacity: 0.4; }
.bh-chips button.alert { background: var(--lr-accent); color: #1b1530; }
.bh-trades { display: grid; gap: 4px; padding: 6px 8px; border-radius: 10px; background: rgba(0, 0, 0, 0.2); }
.bh-sections { display: flex; gap: 4px; }
.bh-sections button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 28px; border-radius: 8px; font-size: 11px; font-weight: 700; color: inherit; background: rgba(255, 255, 255, 0.05); }
.bh-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 220px; overflow-y: auto; }
.bh-list li { display: flex; align-items: center; gap: 4px; border-radius: 8px; }
.bh-list li.turn { background: rgba(255, 209, 102, 0.14); }
.bh-list li.out { opacity: 0.45; text-decoration: line-through; }
.bh-list li > button:first-child { flex: 1; min-width: 0; display: grid; grid-template-columns: 10px 1fr auto; column-gap: 8px; align-items: center; padding: 4px 6px; border-radius: 8px; color: inherit; text-align: left; }
.bh-list li > button:first-child:hover:not(:disabled) { background: rgba(255, 220, 170, 0.1); }
.bh-list i { width: 10px; height: 10px; border-radius: 3px; }
.bh-list span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.bh-list small { opacity: 0.65; font-size: 11px; white-space: nowrap; }
.bh-list .bh-empty { opacity: 0.65; padding: 4px 6px; }
.bh-mini { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px; color: inherit; background: rgba(255, 220, 170, 0.1); flex: none; }
.bh-dialogs { position: absolute; right: 10px; top: 58px; width: min(360px, calc(100% - 20px)); max-height: calc(100% - 150px); overflow-y: auto; display: grid; gap: 8px; z-index: 4; }
.bh-dialog { display: grid; gap: 8px; padding: 12px 14px; background: var(--lr-panel); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); color: var(--lr-ink); border: 1px solid var(--lr-edge); border-radius: 16px; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35); animation: bh-in 0.18s ease-out; }
@keyframes bh-in { from { opacity: 0; transform: translateY(6px) scale(0.98); } }
.bh-dialog header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.bh-dialog header strong { font-size: 14px; }
.bh-dialog header button { color: inherit; opacity: 0.7; }
.bh-dialog-body { display: grid; gap: 6px; }
.bh-text { margin: 0; line-height: 1.4; opacity: 0.9; }
.bh-text.strong { font-weight: 700; opacity: 1; }
.bh-row { display: flex; flex-wrap: wrap; gap: 6px; }
.bh-row .bh-btn { flex: 1 1 auto; }
.bh-field { display: grid; gap: 3px; font-size: 12px; }
.bh-field span { opacity: 0.75; }
.bh-field input, .bh-field select { height: 32px; padding: 0 9px; border-radius: 9px; font-size: 13px; color: inherit; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--lr-edge); }
.bh-check { display: flex; gap: 8px; align-items: center; font-size: 12px; }
.bh-check input { accent-color: var(--lr-accent); }
.bh-band { display: block; height: 8px; border-radius: 4px; }
.bh-toasts { position: absolute; top: 58px; left: 50%; transform: translateX(-50%); display: grid; gap: 6px; justify-items: center; pointer-events: none; z-index: 5; max-width: calc(100% - 40px); }
.bh-toast { padding: 7px 14px; border-radius: 12px; font-size: 13px; font-weight: 600; background: var(--lr-panel); color: var(--lr-ink); border: 1px solid var(--lr-edge); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); animation: bh-in 0.2s ease-out; }
.bh-toast.success { border-color: rgba(34, 197, 94, 0.5); }
.bh-toast.error, .bh-toast.warning { border-color: rgba(239, 68, 68, 0.5); }
@media (max-width: 640px) {
  .bh-tray { bottom: 132px; max-height: 42%; }
  .bh-dialogs { max-height: 40%; }
}
`;
