"use client";

import { useEffect, useRef, useState } from "react";
import type { Battlemap, MapStroke, MapToken } from "@/lib/battlemap";
import { apiFetch } from "../lib/client";

interface BattlemapBoardProps {
  channelId: string;
  map: Battlemap;
  /** Whether this member runs the table (open/close, tokens, clear). */
  gm: boolean;
  userId: string;
  onClose: () => void;
  /** Applies a local change immediately; the socket echo reconciles. */
  onLocalToken: (token: MapToken) => void;
  onLocalStroke: (stroke: MapStroke) => void;
  /** Drops a token for yourself onto the board. */
  onAddMyToken: () => void;
}

const PAINT_COLORS = ["#ef6b58", "#f3bd5d", "#49c99a", "#68a8ff", "#e57bd8", "#ffffff"];

/**
 * The shared table: a grid (over an optional map image) with draggable tokens
 * and a paint layer. Coordinates are grid units, so everyone's screen agrees
 * regardless of size.
 */
export function BattlemapBoard({
  channelId,
  map,
  gm,
  userId,
  onClose,
  onLocalToken,
  onLocalStroke,
  onAddMyToken,
}: BattlemapBoardProps) {
  const [mode, setMode] = useState<"move" | "paint">("move");
  const [color, setColor] = useState(PAINT_COLORS[0]);
  const [width, setWidth] = useState(3);
  const [dragging, setDragging] = useState<string | null>(null);
  /** The stroke being drawn right now, in grid units. */
  const [pending, setPending] = useState<number[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);

  const rows = Math.round(map.grid * 0.6) || map.grid;

  /** Pointer position in grid units. */
  function toGrid(event: { clientX: number; clientY: number }) {
    const box = boardRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - box.left) / box.width) * map.grid,
      y: ((event.clientY - box.top) / box.height) * rows,
    };
  }

  function canMove(token: MapToken): boolean {
    return gm || !token.ownerId || token.ownerId === userId;
  }

  // Dragging a token: follow the pointer locally, save on release.
  useEffect(() => {
    if (!dragging) return;
    const token = map.tokens.find((entry) => entry.id === dragging);
    if (!token) return;

    const move = (event: PointerEvent) => {
      const point = toGrid(event);
      onLocalToken({ ...token, x: point.x, y: point.y });
    };
    const up = (event: PointerEvent) => {
      const point = toGrid(event);
      setDragging(null);
      void apiFetch("/api/battlemap", {
        method: "POST",
        body: JSON.stringify({
          channelId,
          action: "move-token",
          tokenId: token.id,
          x: point.x,
          y: point.y,
        }),
      }).catch(() => undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, map.tokens, channelId]);

  function startPaint(event: React.PointerEvent) {
    if (mode !== "paint") return;
    event.preventDefault();
    const point = toGrid(event);
    setPending([point.x, point.y]);

    const move = (moveEvent: PointerEvent) => {
      const next = toGrid(moveEvent);
      setPending((current) => [...current, next.x, next.y]);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      setPending((current) => {
        if (current.length >= 4) {
          const stroke: MapStroke = {
            id: crypto.randomUUID(),
            color,
            width,
            points: current,
          };
          onLocalStroke(stroke);
          void apiFetch("/api/battlemap", {
            method: "POST",
            body: JSON.stringify({
              channelId,
              action: "stroke",
              stroke: { color, width, points: current },
            }),
          }).catch(() => undefined);
        }
        return [];
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  /** Turns grid points into an SVG path in the 0..grid / 0..rows space. */
  function pathOf(points: number[]): string {
    let path = "";
    for (let i = 0; i < points.length; i += 2) {
      path += `${i === 0 ? "M" : "L"}${points[i]} ${points[i + 1]} `;
    }
    return path.trim();
  }

  async function act(payload: Record<string, unknown>) {
    await apiFetch("/api/battlemap", {
      method: "POST",
      body: JSON.stringify({ channelId, ...payload }),
    }).catch(() => undefined);
  }

  return (
    <div className="battlemap">
      <div className="battlemap-bar">
        <strong>🗺 {map.name}</strong>
        <div className="battlemap-tools">
          <button
            type="button"
            className={mode === "move" ? "on" : ""}
            onClick={() => setMode("move")}
            title="Move tokens"
          >
            ✋
          </button>
          <button
            type="button"
            className={mode === "paint" ? "on" : ""}
            onClick={() => setMode("paint")}
            title="Paint"
          >
            ✏️
          </button>
          {mode === "paint" && (
            <>
              {PAINT_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`paint-swatch ${color === option ? "on" : ""}`}
                  style={{ background: option }}
                  aria-label={`Paint ${option}`}
                  onClick={() => setColor(option)}
                />
              ))}
              <input
                type="range"
                min={1}
                max={12}
                value={width}
                aria-label="Brush size"
                onChange={(event) => setWidth(Number(event.target.value))}
              />
            </>
          )}
          {!map.tokens.some((token) => token.ownerId === userId) && (
            <button type="button" title="Put my character on the map" onClick={onAddMyToken}>
              🙋
            </button>
          )}
          {gm && (
            <>
              <button
                type="button"
                title="Add a token here"
                onClick={() =>
                  void act({
                    action: "add-token",
                    token: {
                      label: window.prompt("Token name", "Goblin") || "Token",
                      x: Math.round(map.grid / 2),
                      y: Math.round(rows / 2),
                    },
                  })
                }
              >
                ➕
              </button>
              <button
                type="button"
                title="Clear paint"
                onClick={() => void act({ action: "clear", what: "strokes" })}
              >
                🧽
              </button>
              <button
                type="button"
                className="danger"
                title="Close the map for everyone"
                onClick={() => void act({ action: "close" })}
              >
                ✕
              </button>
            </>
          )}
          {!gm && (
            <button type="button" title="Hide the map for me" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
      </div>

      <div
        className={`battlemap-board ${mode === "paint" ? "painting" : ""}`}
        ref={boardRef}
        onPointerDown={startPaint}
        style={{ aspectRatio: `${map.grid} / ${rows}` }}
      >
        {map.imageUrl && <img className="battlemap-image" src={map.imageUrl} alt="" />}

        {/* Grid + paint share one coordinate space with the tokens. */}
        <svg
          className="battlemap-layer"
          viewBox={`0 0 ${map.grid} ${rows}`}
          preserveAspectRatio="none"
        >
          <defs>
            <pattern id="bm-grid" width="1" height="1" patternUnits="userSpaceOnUse">
              <path
                d="M 1 0 L 0 0 0 1"
                fill="none"
                stroke="rgba(255,255,255,.16)"
                strokeWidth="0.02"
              />
            </pattern>
          </defs>
          <rect width={map.grid} height={rows} fill="url(#bm-grid)" />
          {map.strokes.map((stroke) => (
            <path
              key={stroke.id}
              d={pathOf(stroke.points)}
              stroke={stroke.color}
              strokeWidth={stroke.width / 20}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {pending.length >= 4 && (
            <path
              d={pathOf(pending)}
              stroke={color}
              strokeWidth={width / 20}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        {map.tokens.map((token) => {
          const mine = canMove(token);
          return (
            <div
              key={token.id}
              className={`battlemap-token ${mine ? "movable" : ""} ${
                dragging === token.id ? "dragging" : ""
              }`}
              style={{
                left: `${(token.x / map.grid) * 100}%`,
                top: `${(token.y / rows) * 100}%`,
                width: `${(1 / map.grid) * 100}%`,
                borderColor: token.color,
              }}
              title={token.label}
              onPointerDown={(event) => {
                if (mode !== "move" || !mine) return;
                event.stopPropagation();
                event.preventDefault();
                setDragging(token.id);
              }}
              onContextMenu={(event) => {
                if (!gm) return;
                event.preventDefault();
                if (window.confirm(`Remove ${token.label}?`)) {
                  void act({ action: "remove-token", tokenId: token.id });
                }
              }}
            >
              {token.avatarUrl ? (
                <img src={token.avatarUrl} alt={token.label} />
              ) : (
                <span style={{ background: token.color }}>
                  {token.label.slice(0, 2).toUpperCase()}
                </span>
              )}
              <b>{token.label}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
