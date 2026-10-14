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
  CloudFog,
  UserRound,
  Maximize2,
  Minimize2,
  Grid,
  Hexagon,
  Swords,
  Heart,
  Activity,
  Dice5,
  ChevronRight,
  Check,
  Music,
} from "lucide-react";
import {
  type Battlemap,
  type MapFog,
  type MapStroke,
  type MapToken,
  type GridType,
  CONDITIONS,
  HEX_ROW_HEIGHT,
  snapPoint,
} from "@/lib/battlemap";
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
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;

/** Preset monsters/fixtures the GM can drop with one click. */
const MONSTER_PALETTE: Array<{
  label: string;
  color: string;
  size: number;
  emoji?: string;
}> = [
  { label: "Goblin", color: "#49a35d", size: 1 },
  { label: "Orc", color: "#2f7d45", size: 1 },
  { label: "Hobgoblin", color: "#6b8f4e", size: 1 },
  { label: "Kobold", color: "#b8a6ff", size: 0.8 },
  { label: "Skeleton", color: "#cfd6dd", size: 1 },
  { label: "Zombie", color: "#7a9a5a", size: 1 },
  { label: "Bandit", color: "#c05c3f", size: 1 },
  { label: "Wolf", color: "#8a8f98", size: 0.9 },
  { label: "Giant Spider", color: "#3a3a44", size: 1.5 },
  { label: "Ogre", color: "#7a4a2a", size: 2 },
  { label: "Troll", color: "#5a7a4a", size: 2 },
  { label: "Dragon", color: "#a43a3a", size: 4 },
  { label: "Chest", color: "#b8860b", size: 1 },
  { label: "Door", color: "#8a6a3a", size: 1 },
  { label: "Barrel", color: "#9a6a2a", size: 0.9 },
  { label: "Torch", color: "#e8a541", size: 0.7 },
];

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
  const [mode, setMode] = useState<"move" | "paint" | "fog">("move");
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
  /** Monster palette dropdown open state (GM only). */
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Fog rectangle being drawn (GM): start point in grid units. */
  const fogStartRef = useRef<{ x: number; y: number } | null>(null);
  const [fogDraft, setFogDraft] = useState<MapFog | null>(null);
  /** Expand battlemap to full stage height. */
  const [expanded, setExpanded] = useState(false);
  /** Grid snapping mode: square, hex, or free/none. */
  const [snapMode, setSnapMode] = useState<GridType>("square");
  /** Encounter / initiative tracker panel visibility. */
  const [initiativeOpen, setInitiativeOpen] = useState(false);
  /** Active combatant turn ID in encounter. */
  const [currentTurnId, setCurrentTurnId] = useState<string | null>(null);
  /** Current encounter round number. */
  const [round, setRound] = useState(1);
  /** Token currently picking conditions. */
  const [conditionPickerTokenId, setConditionPickerTokenId] = useState<string | null>(null);

  function toggleCondition(token: MapToken, conditionId: string) {
    const current = token.conditions || [];
    const next = current.includes(conditionId)
      ? current.filter((c) => c !== conditionId)
      : [...current, conditionId];
    const updated = { ...token, conditions: next };
    onLocalToken(updated);
    void act({
      action: "update-token",
      tokenId: token.id,
      token: { conditions: next },
    });
  }

  function updateTokenHp(token: MapToken, delta: number) {
    const curHp = token.hp ?? (token.maxHp ?? 10);
    const maxHp = token.maxHp ?? 10;
    const nextHp = Math.max(0, curHp + delta);
    const updated = { ...token, hp: nextHp, maxHp };
    onLocalToken(updated);
    void act({
      action: "update-token",
      tokenId: token.id,
      token: { hp: nextHp, maxHp },
    });
  }

  function setTokenInitiative(token: MapToken, val: number | null) {
    const updated = { ...token, initiative: val };
    onLocalToken(updated);
    void act({
      action: "update-token",
      tokenId: token.id,
      token: { initiative: val },
    });
  }

  function rollTokenInitiative(token: MapToken) {
    const roll = Math.floor(Math.random() * 20) + 1;
    setTokenInitiative(token, roll);
  }

  function rollAllInitiatives() {
    for (const t of map.tokens) {
      if (t.initiative === null || t.initiative === undefined) {
        rollTokenInitiative(t);
      }
    }
  }

  /**
   * GM: combat or exploration. The server tells the room and, when the server
   * has combat/exploration music set (Server Settings → Integrations), swaps
   * the call's music to it.
   */
  function setEncounter(state: "combat" | "exploration") {
    if (!gm || (map.encounter ?? "exploration") === state) return;
    void act({ action: "encounter", state });
  }

  function resetEncounter() {
    setCurrentTurnId(null);
    setRound(1);
    void act({ action: "reset-initiative" });
    setEncounter("exploration");
  }

  function nextTurn() {
    const sorted = [...map.tokens]
      .filter((t) => typeof t.initiative === "number")
      .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
    if (sorted.length === 0) return;
    // The first turn starts the fight; later turns leave the music alone.
    setEncounter("combat");
    if (!currentTurnId) {
      setCurrentTurnId(sorted[0].id);
      return;
    }
    const idx = sorted.findIndex((t) => t.id === currentTurnId);
    if (idx === -1 || idx >= sorted.length - 1) {
      setCurrentTurnId(sorted[0].id);
      setRound((r) => r + 1);
    } else {
      setCurrentTurnId(sorted[idx + 1].id);
    }
  }

  /** Detected natural aspect ratio of the background image (width / height). */
  const [imageAspect, setImageAspect] = useState<number | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });
  const resizeRef = useRef({ startX: 0, startY: 0, startSize: 1 });

  // Measure background image aspect ratio if provided
  useEffect(() => {
    if (!map.imageUrl) {
      setImageAspect(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.src = map.imageUrl;
    const handleLoad = () => {
      if (!cancelled && img.naturalWidth && img.naturalHeight) {
        setImageAspect(img.naturalWidth / img.naturalHeight);
      }
    };
    if (img.complete && img.naturalWidth && img.naturalHeight) {
      handleLoad();
    } else {
      img.onload = handleLoad;
    }
    return () => {
      cancelled = true;
    };
  }, [map.imageUrl]);

  const rows =
    map.rows ||
    (imageAspect
      ? Math.max(1, Math.round(map.grid / imageAspect))
      : Math.round(map.grid * 0.6) || map.grid);

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
      if (!box) return;
      const bx = event.clientX - box.left;
      const by = event.clientY - box.top;
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
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

  // Dragging a token: follow the pointer locally, save throttled along the way
  // (so a dropped connection or closed tab mid-drag doesn't lose the whole
  // drag), and an authoritative final save on release. The token is captured
  // once so the listeners don't churn on every local update.
  useEffect(() => {
    if (!dragging) return;
    const token = map.tokens.find((entry) => entry.id === dragging);
    if (!token) return;

    let lastX = token.x;
    let lastY = token.y;
    let lastSave = 0;
    const SAVE_INTERVAL = 300;

    const save = (x: number, y: number) => {
      void apiFetch("/api/battlemap", {
        method: "POST",
        body: JSON.stringify({
          channelId,
          action: "move-token",
          tokenId: token.id,
          x,
          y,
        }),
      }).catch(() => undefined);
    };

    const move = (event: PointerEvent) => {
      const raw = toGrid(event);
      const point =
        snapMode !== "none" && !event.shiftKey
          ? snapPoint(raw.x, raw.y, snapMode, map.grid, rows)
          : raw;
      lastX = point.x;
      lastY = point.y;
      onLocalToken({ ...token, x: point.x, y: point.y });
      const now = Date.now();
      if (now - lastSave >= SAVE_INTERVAL) {
        lastSave = now;
        save(lastX, lastY);
      }
    };
    const up = (event: PointerEvent) => {
      const raw = toGrid(event);
      const point =
        snapMode !== "none" && !event.shiftKey
          ? snapPoint(raw.x, raw.y, snapMode, map.grid, rows)
          : raw;
      setDragging(null);
      save(point.x, point.y);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, channelId, snapMode, rows]);

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
    let lastSave = 0;
    const SAVE_INTERVAL = 300;

    const save = (size: number) => {
      void apiFetch("/api/battlemap", {
        method: "POST",
        body: JSON.stringify({
          channelId,
          action: "resize-token",
          tokenId: token.id,
          size,
        }),
      }).catch(() => undefined);
    };

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
      const now = Date.now();
      if (now - lastSave >= SAVE_INTERVAL) {
        lastSave = now;
        save(next);
      }
    };
    const up = () => {
      setResizing(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      save(currentSize);
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
    if (mode !== "move" && event.button !== 1) return;
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

  function startFog(event: React.PointerEvent) {
  if (mode !== "fog") return;
  event.preventDefault();
  const point = toGrid(event);
  fogStartRef.current = point;

  const move = (moveEvent: PointerEvent) => {
    const now = toGrid(moveEvent);
    const start = fogStartRef.current;
    if (!start) return;
    const x = Math.min(start.x, now.x);
    const y = Math.min(start.y, now.y);
    const w = Math.max(0.5, Math.abs(now.x - start.x));
    const h = Math.max(0.5, Math.abs(now.y - start.y));
    setFogDraft({ id: "draft", x, y, w, h });
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    const draft = fogDraft;
    fogStartRef.current = null;
    setFogDraft(null);
    if (draft && draft.id === "draft") {
      const { id: _id, ...fog } = draft;
      void act({ action: "add-fog", fog });
    }
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}

function onBoardPointerDown(event: React.PointerEvent) {
  if (event.button === 1) {
    startPan(event);
    return;
  }
  if (mode === "paint") {
    startPaint(event);
  } else if (mode === "fog") {
    startFog(event);
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

  /** GM: drop a monster from the palette at the board center. */
  function addMonster(monster: (typeof MONSTER_PALETTE)[number]) {
    setPaletteOpen(false);
    void act({
      action: "add-token",
      token: {
        label: monster.label,
        color: monster.color,
        size: monster.size,
        x: Math.round(map.grid / 2),
        y: Math.round(rows / 2),
      },
    });
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
    <div className={`battlemap ${expanded ? "expanded" : ""}`}>
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
          {gm && (
            <button
              type="button"
              className={mode === "fog" ? "on" : ""}
              onClick={() => setMode("fog")}
              title="Fog of war (drag to hide an area)"
            >
              <CloudFog size={14} />
            </button>
          )}
          <span className="battlemap-zoom">
            <button type="button" title="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
              <ZoomOut size={14} />
            </button>
            <button type="button" title="Fit to screen / Reset view" onClick={resetView}>
              <RotateCcw size={14} />
            </button>
            <span className="battlemap-zoom-badge" title="Zoom level">
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" title="Zoom in" onClick={() => zoomBy(1.25)}>
              <ZoomIn size={14} />
            </button>
          </span>
          <button
            type="button"
            className={expanded ? "on" : ""}
            title={expanded ? "Normal map view" : "Expand map size"}
            onClick={() => setExpanded((exp) => !exp)}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            type="button"
            className={snapMode !== "none" ? "on" : ""}
            title={`Grid snap: ${snapMode.toUpperCase()} (Click to toggle: Square -> Hex -> None)`}
            onClick={() =>
              setSnapMode((prev) =>
                prev === "square" ? "hex" : prev === "hex" ? "none" : "square",
              )
            }
          >
            {snapMode === "hex" ? <Hexagon size={14} /> : <Grid size={14} />}
          </button>
          <button
            type="button"
            className={initiativeOpen ? "on" : ""}
            title="Initiative & Encounter Tracker"
            onClick={() => setInitiativeOpen((open) => !open)}
          >
            <Swords size={14} />
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
              <UserRound size={14} />
            </button>
          )}
          {gm && (
            <>
              <div className="battlemap-palette-wrap">
                <button
                  type="button"
                  className={paletteOpen ? "on" : ""}
                  title="Add a monster or fixture"
                  onClick={() => setPaletteOpen((open) => !open)}
                >
                  <Plus size={14} />
                </button>
                {paletteOpen && (
                  <div className="battlemap-palette">
                    <div className="battlemap-palette-title">Add to table</div>
                    <div className="battlemap-palette-grid">
                      {MONSTER_PALETTE.map((monster) => (
                        <button
                          key={monster.label}
                          type="button"
                          className="battlemap-palette-item"
                          onClick={() => addMonster(monster)}
                        >
                          <span
                            className="battlemap-palette-token"
                            style={{ background: monster.color }}
                          >
                            {monster.label.slice(0, 2).toUpperCase()}
                          </span>
                          <span>{monster.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
        className={`battlemap-board ${mode === "paint" ? "painting" : ""} ${mode === "fog" ? "fogging" : ""} ${panning ? "panning" : ""}`}
        ref={boardRef}
        onPointerDown={onBoardPointerDown}
        style={{
          aspectRatio: `${map.grid} / ${rows}`,
          maxWidth: `calc((${expanded ? "85vh" : "60vh"} - 50px) * ${map.grid / rows})`,
        }}
      >
          <div
            className="battlemap-viewport"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
          {map.imageUrl && (
            <img
              className="battlemap-image"
              src={map.imageUrl}
              alt=""
              onLoad={(e) => {
                if (e.currentTarget.naturalWidth && e.currentTarget.naturalHeight) {
                  setImageAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight);
                }
              }}
            />
          )}

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
            <pattern id="bm-hex-grid" width="1" height={HEX_ROW_HEIGHT * 2} patternUnits="userSpaceOnUse">
              <path
                d="M 0 0.433 L 0.5 0.144 L 1 0.433 L 1 1.011 L 0.5 1.299 L 0 1.011 Z M 0 1.299 L 0.5 1.011 L 1 1.299 L 1 1.877 L 0.5 2.165 L 0 1.877 Z"
                fill="none"
                stroke="rgba(255,255,255,.18)"
                strokeWidth="0.02"
              />
            </pattern>
          </defs>
          {snapMode === "square" && <rect width={map.grid} height={rows} fill="url(#bm-grid)" />}
          {snapMode === "hex" && <rect width={map.grid} height={rows} fill="url(#bm-hex-grid)" />}
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
          {/* Fog of war: opaque rectangles over the map. */}
          {map.fog.map((fog) => (
            <g key={fog.id}>
              <rect
                x={fog.x}
                y={fog.y}
                width={fog.w}
                height={fog.h}
                className="battlemap-fog"
              />
              {gm && (
                <rect
                  x={fog.x}
                  y={fog.y}
                  width={fog.w}
                  height={fog.h}
                  className="battlemap-fog-hit"
                  onClick={() => void act({ action: "remove-fog", fogId: fog.id })}
                />
              )}
            </g>
          ))}
          {fogDraft && fogDraft.id === "draft" && (
            <rect
              x={fogDraft.x}
              y={fogDraft.y}
              width={fogDraft.w}
              height={fogDraft.h}
              className="battlemap-fog draft"
            />
          )}
        </svg>

        {map.tokens.map((token) => {
          const mine = canMove(token);
          const renaming = renamingId === token.id;
          const isActiveTurn = currentTurnId === token.id;
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
                boxShadow: isActiveTurn
                  ? "0 0 0 3px #f59e0b, 0 0 16px rgba(245, 158, 11, 0.85)"
                  : undefined,
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
              {/* Condition badges above token */}
              {token.conditions && token.conditions.length > 0 && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 pointer-events-auto z-10 whitespace-nowrap">
                  {token.conditions.map((cid) => {
                    const info = CONDITIONS.find((c) => c.id === cid);
                    if (!info) return null;
                    return (
                      <span
                        key={cid}
                        className="px-1 py-0.2 text-[8px] font-black rounded shadow text-white leading-tight uppercase cursor-pointer hover:opacity-80"
                        style={{ backgroundColor: info.color }}
                        title={`${info.label}: ${info.description} (click to remove)`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCondition(token, cid);
                        }}
                      >
                        {info.badge}
                      </span>
                    );
                  })}
                </div>
              )}

              {token.avatarUrl ? (
                <img src={token.avatarUrl} alt={token.label} />
              ) : (
                <span style={{ background: token.color }}>
                  {token.label.slice(0, 2).toUpperCase()}
                </span>
              )}
              <b>{token.label}</b>

              {/* HP badge below label */}
              {typeof token.hp === "number" && (
                <div className="absolute -bottom-4.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-emerald-400 whitespace-nowrap bg-black/85 px-1 rounded shadow pointer-events-none">
                  {token.hp}
                  {typeof token.maxHp === "number" ? `/${token.maxHp}` : ""}
                </div>
              )}

              {/* Status conditions toggle button on token */}
              {canRename(token) && (
                <button
                  type="button"
                  className="battlemap-rename-btn !right-auto !left-[-10px] !bg-neutral-800 hover:!bg-neutral-700"
                  title="Conditions"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConditionPickerTokenId(
                      conditionPickerTokenId === token.id ? null : token.id,
                    );
                  }}
                >
                  <Activity size={10} />
                </button>
              )}

              {/* Floating condition picker */}
              {conditionPickerTokenId === token.id && (
                <div
                  className="absolute left-1/2 top-full mt-4 -translate-x-1/2 bg-neutral-900 border border-white/20 rounded-lg p-2 shadow-2xl z-40 w-48 text-left text-white pointer-events-auto cursor-default"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/10 text-[11px] font-semibold">
                    <span>Conditions</span>
                    <button
                      type="button"
                      className="text-white/60 hover:text-white"
                      onClick={() => setConditionPickerTokenId(null)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="max-h-44 overflow-y-auto flex flex-col gap-0.5">
                    {CONDITIONS.map((c) => {
                      const active = (token.conditions || []).includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] transition-colors ${
                            active
                              ? "bg-white/20 text-white font-medium"
                              : "hover:bg-white/10 text-white/80"
                          }`}
                          onClick={() => toggleCondition(token, c.id)}
                          title={c.description}
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: c.color }}
                          />
                          <span className="flex-1 truncate">{c.label}</span>
                          {active && <Check size={11} className="text-emerald-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  <Pencil size={13} />
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

      {/* Encounter / Initiative Tracker Sidebar */}
      {initiativeOpen && (
        <aside
          className="absolute right-0 top-[41px] bottom-0 w-72 bg-neutral-900/95 border-l border-white/10 text-white flex flex-col z-30 shadow-2xl backdrop-blur-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Swords size={15} className="text-amber-400" />
              <span className="font-semibold text-sm">Initiative Tracker</span>
            </div>
            <button
              type="button"
              className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-white"
              onClick={() => setInitiativeOpen(false)}
              title="Close tracker"
            >
              <X size={14} />
            </button>
          </div>

          {/* Turn & Round controls */}
          <div className="p-2.5 border-b border-white/10 bg-white/5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-amber-400">Round {round}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                  map.encounter === "combat"
                    ? "bg-red-500/20 text-red-300 border-red-500/30"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                }`}
              >
                {map.encounter === "combat" ? "Combat" : "Exploration"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={nextTurn}
                className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold rounded flex items-center gap-1 transition-colors"
                title="Advance to next turn"
              >
                <span>Next Turn</span>
                <ChevronRight size={13} />
              </button>
              {gm && (
                <button
                  type="button"
                  onClick={resetEncounter}
                  className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-white"
                  title="Reset encounter"
                >
                  <RotateCcw size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Quick actions for GM */}
          {gm && (
            <div className="px-3 py-1.5 bg-black/20 border-b border-white/5 flex items-center justify-between text-[11px] text-white/60">
              <span>Quick actions:</span>
              <button
                type="button"
                onClick={() => setEncounter(map.encounter === "combat" ? "exploration" : "combat")}
                className="hover:text-amber-300 flex items-center gap-1"
                title="Switches the call's music when the server has combat and exploration music set (Server Settings → Integrations)"
              >
                <Music size={12} />
                <span>{map.encounter === "combat" ? "End combat" : "Start combat"}</span>
              </button>
              <button
                type="button"
                onClick={rollAllInitiatives}
                className="hover:text-amber-300 flex items-center gap-1"
              >
                <Dice5 size={12} />
                <span>Roll All d20</span>
              </button>
            </div>
          )}

          {/* Combatant list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {map.tokens.length === 0 ? (
              <div className="text-center py-8 text-white/40 text-xs">
                No tokens on the map.
              </div>
            ) : (
              [...map.tokens]
                .sort((a, b) => {
                  const initA = a.initiative ?? -999;
                  const initB = b.initiative ?? -999;
                  return initB - initA;
                })
                .map((t) => {
                  const isActive = currentTurnId === t.id;
                  const curHp = t.hp ?? (t.maxHp ?? 10);
                  const maxHp = t.maxHp ?? 10;
                  return (
                    <div
                      key={t.id}
                      className={`p-2 rounded-lg border transition-all ${
                        isActive
                          ? "bg-amber-500/15 border-amber-500/60 ring-1 ring-amber-500/30"
                          : "bg-white/5 border-white/5 hover:border-white/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: t.color }}
                          />
                          <span className="font-semibold text-xs truncate" title={t.label}>
                            {t.label}
                          </span>
                          {isActive && (
                            <span className="text-[9px] bg-amber-400 text-black font-extrabold px-1 rounded uppercase">
                              Turn
                            </span>
                          )}
                        </div>

                        {/* Initiative score / roll */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {typeof t.initiative === "number" ? (
                            <button
                              type="button"
                              onClick={() => rollTokenInitiative(t)}
                              className="px-1.5 py-0.5 bg-black/40 hover:bg-black/60 rounded text-xs font-bold text-amber-300 border border-amber-500/30"
                              title="Click to re-roll initiative"
                            >
                              ⚡ {t.initiative}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => rollTokenInitiative(t)}
                              className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded text-[10px] text-white/70 flex items-center gap-1"
                              title="Roll 1d20 initiative"
                            >
                              <Dice5 size={11} />
                              <span>Roll</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* HP Tracker */}
                      <div className="flex items-center justify-between text-[11px] text-white/70 bg-black/25 px-1.5 py-0.5 rounded mb-1.5">
                        <span className="flex items-center gap-1">
                          <Heart size={10} className="text-rose-400" />
                          <span>
                            HP: {curHp} / {maxHp}
                          </span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateTokenHp(t, -1)}
                            className="w-4 h-4 rounded bg-white/10 hover:bg-rose-500/30 hover:text-rose-300 flex items-center justify-center font-bold text-xs"
                            title="-1 HP"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() => updateTokenHp(t, 1)}
                            className="w-4 h-4 rounded bg-white/10 hover:bg-emerald-500/30 hover:text-emerald-300 flex items-center justify-center font-bold text-xs"
                            title="+1 HP"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Conditions row */}
                      <div className="flex items-center gap-1 flex-wrap">
                        {(t.conditions || []).map((cid) => {
                          const info = CONDITIONS.find((c) => c.id === cid);
                          if (!info) return null;
                          return (
                            <span
                              key={cid}
                              className="px-1 py-0.2 text-[8px] font-bold rounded shadow text-white leading-tight uppercase cursor-pointer hover:opacity-80"
                              style={{ backgroundColor: info.color }}
                              title={`${info.label} (click to remove)`}
                              onClick={() => toggleCondition(t, cid)}
                            >
                              {info.badge} ×
                            </span>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() =>
                            setConditionPickerTokenId(
                              conditionPickerTokenId === t.id ? null : t.id,
                            )
                          }
                          className="text-[10px] text-white/40 hover:text-white/80 px-1 py-0.2 rounded hover:bg-white/10"
                          title="Add condition"
                        >
                          + Cond
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
