"use client";

import { useEffect, useRef, useState } from "react";
import {
  Pencil,
  Plus,
  X,
  Hand,
  Eraser,
  Map,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
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
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

/**
 * The shared table: a grid (over an optional map image) with draggable tokens
 * and a paint layer. Coordinates are grid units, so everyone's screen agrees
 * regardless of size. Zoom and pan are local view transforms only — they never
 * touch the shared coordinates.
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
  /** Local view transform: zoom factor and pan offset in pixels. */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  /** Token currently being renamed (inline input). */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  /** Token being resized by dragging its corner handle. */
  const [resizing, setResizing] = useState<string | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });
  const resizeRef = useRef({ startX: 0, startY: 0, startSize: 1 });

  const rows = Math.round(map.grid * 0.6) || map.grid;

  /** Pointer position in grid units, accounting for the local zoom/pan. */
  function toGrid(event: { clientX: number; clientY: number }) {
    const box = boardRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    const bx = event.clientX - box.left;
    const by = event.clientY - box.top;
    const cx = (bx - pan.x) / zoom;
    const cy = (by - pan.y) / zoom;
    return {
      x: (cx / box.width) * map.grid,
      y: (cy / box.height) * rows,
    };
  }

  function canMove(token: MapToken): boolean {
    return gm || !token.ownerId || token.ownerId === userId;
  }

  function canRename(token: MapToken): boolean {
    return gm || !token.ownerId || token.ownerId === userId;
  }

  // Wheel to zoom toward the cursor. Attached non-passively so we can stop
  // the page from scrolling while zooming the map.
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = board.getBoundingClientRect();
      const bx = event.clientX - box.left;
      const by = event.clientY - box.top;
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
      // Keep the grid point under the cursor fixed while zooming.
      const cx = (bx - pan.x) / zoom;
      const cy = (by - pan.y) / zoom;
      setZoom(nextZoom);
      setPan({ x: bx - cx * nextZoom, y: by - cy * nextZoom });
    };
    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, pan]);

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

  // Panning the view: drag on empty space in move mode.
  useEffect(() => {
    if (!panning) return;
    const move = (event: PointerEvent) => {
      const dx = event.clientX - panRef.current.startX;
      const dy = event.clientY - panRef.current.startY;
      setPan({
        x: panRef.current.panX + dx,
        y: panRef.current.panY + dy,
      });
    };
    const up = () => {
      setPanning(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [panning]);

  // Resizing a token by dragging its corner handle. The size is derived from
  // how far the pointer moved away from the token's center, in grid units.
  useEffect(() => {
    if (!resizing) return;
    const token = map.tokens.find((entry) => entry.id === resizing);
    if (!token) return;
    const startSize = token.size ?? 1;
    resizeRef.current = { startX: 0, startY: 0, startSize };
    let currentSize = startSize;

    const move = (event: PointerEvent) => {
      const tokenEl = boardRef.current?.querySelector<HTMLElement>(
        `[data-token-id="${resizing}"]`,
      );
      const tokenBox = tokenEl?.getBoundingClientRect();
      if (!tokenBox) return;
      const centerX = tokenBox.left + tokenBox.width / 2;
      const centerY = tokenBox.top + tokenBox.height / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const distPx = Math.hypot(dx, dy);
      // Convert the pixel distance into grid cells using the token's own size
      // as the ruler (it is `startSize` cells wide on screen).
      const cellsPerPx = startSize / tokenBox.width;
      const next = Math.max(0.5, Math.min(4, distPx * cellsPerPx));
      currentSize = next;
      onLocalToken({ ...token, size: next });
    };
    const up = () => {
      setResizing(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      void apiFetch("/api/battlemap", {
        method: "POST",
        body: JSON.stringify({
          channelId,
          action: "resize-token",
          tokenId: token.id,
          size: currentSize,
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
  }, [resizing, channelId]);

  function startPan(event: React.PointerEvent) {
    if (mode !== "move") return;
    event.preventDefault();
    panRef.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
    setPanning(true);
  }

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

  function onBoardPointerDown(event: React.PointerEvent) {
    if (mode === "paint") {
      startPaint(event);
    } else {
      startPan(event);
    }
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

  function zoomBy(factor: number) {
    const box = boardRef.current?.getBoundingClientRect();
    const cx = box ? box.width / 2 : 0;
    const cy = box ? box.height / 2 : 0;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    const gx = (cx - pan.x) / zoom;
    const gy = (cy - pan.y) / zoom;
    setZoom(nextZoom);
    setPan({ x: cx - gx * nextZoom, y: cy - gy * nextZoom });
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function beginRename(token: MapToken) {
    setRenamingId(token.id);
    setRenameValue(token.label);
  }

  function commitRename(id: string) {
    const label = renameValue.trim();
    setRenamingId(null);
    if (!label) return;
    void act({ action: "rename-token", tokenId: id, label });
  }

  function startResize(event: React.PointerEvent, token: MapToken) {
    if (mode !== "move") return;
    event.stopPropagation();
    event.preventDefault();
    resizeRef.current.startSize = token.size ?? 1;
    setResizing(token.id);
  }

  return (
    <div className="battlemap">
      <div className="battlemap-bar">
        <strong className="flex items-center gap-1.5"><Map size={16} /> {map.name}</strong>
        <div className="battlemap-tools">
          <button
            type="button"
            className={mode === "move" ? "on" : ""}
            onClick={() => setMode("move")}
            title="Move tokens"
          >
            <Hand size={14} />
          </button>
          <button
            type="button"
            className={mode === "paint" ? "on" : ""}
            onClick={() => setMode("paint")}
            title="Paint"
          >
            <Pencil size={14} />
          </button>
          <span className="battlemap-zoom">
            <button type="button" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
              <ZoomOut size={14} />
            </button>
            <button type="button" title="Reset view" onClick={resetView}>
              <RotateCcw size={14} />
            </button>
            <button type="button" title="Zoom in" onClick={() => zoomBy(1.2)}>
              <ZoomIn size={14} />
            </button>
          </span>
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
                      label: "Goblin",
                      x: Math.round(map.grid / 2),
                      y: Math.round(rows / 2),
                    },
                  })
                }
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                title="Clear paint"
                onClick={() => void act({ action: "clear", what: "strokes" })}
              >
                <Eraser size={14} />
              </button>
              <button
                type="button"
                className="danger"
                title="Close the map for everyone"
                onClick={() => void act({ action: "close" })}
              >
                <X size={14} />
              </button>
            </>
          )}
          {!gm && (
            <button type="button" title="Hide the map for me" onClick={onClose}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div
        className={`battlemap-board ${mode === "paint" ? "painting" : ""} ${panning ? "panning" : ""}`}
        ref={boardRef}
        onPointerDown={onBoardPointerDown}
        style={{ aspectRatio: `${map.grid} / ${rows}` }}
      >
        <div
          className="battlemap-viewport"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
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
          const renaming = renamingId === token.id;
          return (
            <div
              key={token.id}
              data-token-id={token.id}
              className={`battlemap-token ${mine ? "movable" : ""} ${
                dragging === token.id ? "dragging" : ""
              } ${resizing === token.id ? "resizing" : ""}`}
              style={{
                left: `${(token.x / map.grid) * 100}%`,
                top: `${(token.y / rows) * 100}%`,
                width: `${((token.size ?? 1) / map.grid) * 100}%`,
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
                void act({ action: "remove-token", tokenId: token.id });
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
              {canRename(token) && !renaming && (
                <button
                  type="button"
                  className="battlemap-rename-btn"
                  title="Rename token"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    beginRename(token);
                  }}
                >
                  ✏️
                </button>
              )}
              {renaming && (
                <input
                  autoFocus
                  className="battlemap-rename-input"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename(token.id);
                    if (event.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => commitRename(token.id)}
                />
              )}
              {canRename(token) && (
                <button
                  type="button"
                  className="battlemap-resize-btn"
                  title="Resize token (drag)"
                  onPointerDown={(event) => startResize(event, token)}
                >
                  ⇲
                </button>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
