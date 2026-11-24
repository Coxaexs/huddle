"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  Box,
  ExternalLink,
  Ruler,
  Target,
  MapPin,
  Eye,
  EyeOff,
  Trash2,
  Shield,
} from "lucide-react";
import {
  type Battlemap,
  type BattlemapSceneSummary,
  type FogMode,
  type HpVisibility,
  type MapArea,
  type MapFog,
  type MapPing,
  type MapStroke,
  type MapToken,
  type GridType,
  CONDITIONS,
  HEX_ROW_HEIGHT,
  areaSvgGeometry,
  hpTierFor,
  measureFeet,
  snapPoint,
  tickConditionDurations,
} from "@/lib/battlemap";
import { addInitiative, currentEntry, stepTurn, type Initiative, type TableCharacter } from "@/lib/lounge-shared";
import { apiFetch } from "../lib/client";
import { useDismiss } from "../hooks/use-dismiss";
import { freeSpot } from "@/lib/battlemap-spot";
import {
  MONSTER_PALETTE,
  tokenImageUrl,
  type BattlemapPaletteEntry,
} from "@/lib/battlemap-tokens";
import { useI18n } from "../lib/i18n-context";

interface ConcentrationCheckPrompt {
  tokenId: string;
  label: string;
  damage: number;
  dc: number;
}

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
  sharedInitiative?: Initiative | null;
  onSetInitiative?: (init: Initiative | null) => void;
  onRollCommand?: (command: string) => void;
  onOpenTabletop?: () => void;
  onOpenCompanion?: () => void;
  myCharacter?: TableCharacter | null;
  scenes?: BattlemapSceneSummary[];
  lastPing?: MapPing | null;
  selectedTokenId?: string | null;
  onSelectToken?: (id: string | null) => void;
  onSwitchScene?: (id: string) => void;
  onPrepScene?: () => void;
  onDeleteScene?: (id: string) => void;
  onSetHpVisibility?: (v: HpVisibility) => void;
  onApplyDamage?: (
    tokenId: string,
    delta: number,
  ) => Promise<{ token: MapToken; concentrationCheck: ConcentrationCheckPrompt | null } | null>;
}

const pawnIdForToken = (tokenId: string) => `bm-${tokenId.replace(/-/g, "").slice(0, 16)}`;

const PAINT_COLORS = ["#ef6b58", "#f3bd5d", "#49c99a", "#68a8ff", "#e57bd8", "#ffffff"];
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;

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
  sharedInitiative,
  onSetInitiative,
  onRollCommand,
  onOpenTabletop,
  onOpenCompanion,
  myCharacter,
  scenes,
  lastPing,
  selectedTokenId,
  onSelectToken,
  onSwitchScene,
  onPrepScene,
  onDeleteScene,
  onSetHpVisibility,
  onApplyDamage,
}: BattlemapBoardProps) {
  const { t } = useI18n();
  const rawMaskId = useId();
  const fogMaskId = `bm-fog-${rawMaskId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [mode, setMode] = useState<"move" | "paint" | "fog" | "ruler" | "area" | "ping">("move");
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
  const [paletteLeft, setPaletteLeft] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [brokenImgs, setBrokenImgs] = useState<Set<string>>(() => new Set());
  const paletteWrapRef = useRef<HTMLDivElement | null>(null);
  useDismiss(paletteOpen, () => setPaletteOpen(false), paletteWrapRef);
  /** Fog rectangle being drawn (GM): start point in grid units. */
  const [fogMode, setFogMode] = useState<FogMode>("cover");
  const fogStartRef = useRef<{ x: number; y: number } | null>(null);
  const fogDraggedRef = useRef(false);
  const fogDraftRef = useRef<MapFog | null>(null);
  const [fogDraft, setFogDraft] = useState<MapFog | null>(null);
  /** Distance ruler measurement state. */
  const rulerStartRef = useRef<{ x: number; y: number } | null>(null);
  const [rulerPts, setRulerPts] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  /** AoE spell template tool state. */
  const [aoeShape, setAoeShape] = useState<MapArea["shape"]>("sphere");
  const [aoeSizeFt, setAoeSizeFt] = useState<number>(20);
  const areaDraftRef = useRef<MapArea | null>(null);
  const [areaDraft, setAreaDraft] = useState<MapArea | null>(null);
  /** Map ping & GM camera pull state. */
  const [activePing, setActivePing] = useState<MapPing | null>(null);
  const [pullViewNext, setPullViewNext] = useState(false);
  const lastHandledPingIdRef = useRef<string | null>(null);
  /** Concentration check & condition expiry banners. */
  const [concentrationPrompt, setConcentrationPrompt] = useState<ConcentrationCheckPrompt | null>(null);
  const [expiredNotice, setExpiredNotice] = useState<string | null>(null);
  /** Expand battlemap to full stage height. */
  const [expanded, setExpanded] = useState(false);
  /** Grid snapping mode: square, hex, or free/none. */
  const [snapMode, setSnapMode] = useState<GridType>("square");
  /** Encounter / initiative tracker panel visibility. */
  const [initiativeOpen, setInitiativeOpen] = useState(false);
  /** Active combatant turn ID in encounter (local fallback when not wired to sharedInitiative). */
  const [localTurnId, setLocalTurnId] = useState<string | null>(null);
  /** Current encounter round number (local fallback). */
  const [localRound, setLocalRound] = useState(1);
  /** Token currently picking conditions. */
  const [conditionPickerTokenId, setConditionPickerTokenId] = useState<string | null>(null);

  const sharedTurnEntry = sharedInitiative ? currentEntry(sharedInitiative) : null;
  const round = sharedInitiative?.round ?? localRound;
  const currentTurnId = sharedTurnEntry
    ? map.tokens.find(
        (t) =>
          sharedTurnEntry.pawnId === pawnIdForToken(t.id) ||
          sharedTurnEntry.id === `bm-${t.id.slice(0, 12)}` ||
          sharedTurnEntry.id === t.id ||
          sharedTurnEntry.name.toLowerCase() === t.label.toLowerCase(),
      )?.id ?? null
    : localTurnId;

  const prevTurnIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevTurnIdRef.current === undefined) {
      prevTurnIdRef.current = currentTurnId;
      return;
    }
    if (prevTurnIdRef.current !== currentTurnId && currentTurnId) {
      const activeTok = map.tokens.find((t) => t.id === currentTurnId);
      if (activeTok && activeTok.ownerId === userId) {
        try {
          if (typeof window !== "undefined" && "AudioContext" in window) {
            const Ctx = window.AudioContext;
            const audio = new Ctx();
            const osc = audio.createOscillator();
            const gain = audio.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(523.25, audio.currentTime);
            osc.frequency.exponentialRampToValueAtTime(659.25, audio.currentTime + 0.14);
            gain.gain.setValueAtTime(0.06, audio.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
            osc.connect(gain);
            gain.connect(audio.destination);
            osc.start();
            osc.stop(audio.currentTime + 0.36);
          }
        } catch {
          // Ignore browser autoplay or test environment audio restrictions.
        }
      }
    }
    prevTurnIdRef.current = currentTurnId;
  }, [currentTurnId, map.tokens, userId]);

  useEffect(() => {
    if (mode !== "ruler") {
      setRulerPts(null);
      rulerStartRef.current = null;
    }
  }, [mode]);

  useEffect(() => {
    if (!lastPing) return;
    setActivePing(lastPing);
  }, [lastPing]);

  useEffect(() => {
    if (!activePing) return;
    const timer = window.setTimeout(() => {
      setActivePing((cur) => (cur?.id === activePing.id ? null : cur));
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [activePing]);

  function toggleCondition(token: MapToken, conditionId: string) {
    const current = token.conditions || [];
    const next = current.includes(conditionId)
      ? current.filter((c) => c !== conditionId)
      : [...current, conditionId];
    const nextDurations = token.conditionDurations ? { ...token.conditionDurations } : undefined;
    if (nextDurations && !next.includes(conditionId)) {
      delete nextDurations[conditionId];
    }
    const cleanDurations =
      nextDurations && Object.keys(nextDurations).length > 0 ? nextDurations : undefined;
    const updated = { ...token, conditions: next, conditionDurations: cleanDurations };
    onLocalToken(updated);
    void act({
      action: "update-token",
      tokenId: token.id,
      token: { conditions: next, conditionDurations: cleanDurations ?? {} },
    });
  }

  function setConditionDuration(token: MapToken, conditionId: string, rounds: number | null) {
    const nextConditions = (token.conditions || []).includes(conditionId)
      ? token.conditions || []
      : [...(token.conditions || []), conditionId];
    const nextDurations = { ...(token.conditionDurations || {}) };
    if (rounds === null) delete nextDurations[conditionId];
    else nextDurations[conditionId] = rounds;
    const cleanDurations = Object.keys(nextDurations).length > 0 ? nextDurations : undefined;
    const updated = { ...token, conditions: nextConditions, conditionDurations: cleanDurations };
    onLocalToken(updated);
    void act({
      action: "update-token",
      tokenId: token.id,
      token: { conditions: nextConditions, conditionDurations: cleanDurations ?? {} },
    });
  }

  function updateTokenHp(token: MapToken, delta: number) {
    if (onApplyDamage) {
      void onApplyDamage(token.id, delta).then((res) => {
        if (res?.concentrationCheck) setConcentrationPrompt(res.concentrationCheck);
      });
      return;
    }
    const curHp = token.hp ?? (token.maxHp ?? 10);
    const maxHp = token.maxHp ?? 10;
    const nextHp = Math.max(0, curHp + delta);
    const updated = { ...token, hp: nextHp, maxHp };
    onLocalToken(updated);
    if (delta < 0 && (token.conditions || []).includes("concentrating")) {
      const dmg = Math.abs(delta);
      setConcentrationPrompt({
        tokenId: token.id,
        label: token.label,
        damage: dmg,
        dc: Math.max(10, Math.floor(dmg / 2)),
      });
    }
    void act({
      action: "update-token",
      tokenId: token.id,
      token: { hp: nextHp, maxHp },
    });
  }

  function applyTurnConditionTick(activeTokenId: string | null) {
    if (!activeTokenId) return;
    const { tokens: ticked, expired } = tickConditionDurations(map.tokens, activeTokenId);
    for (const nextTok of ticked) {
      const prevTok = map.tokens.find((t) => t.id === nextTok.id);
      if (
        prevTok &&
        (JSON.stringify(prevTok.conditions || []) !== JSON.stringify(nextTok.conditions || []) ||
          JSON.stringify(prevTok.conditionDurations || {}) !== JSON.stringify(nextTok.conditionDurations || {}))
      ) {
        onLocalToken(nextTok);
        void act({
          action: "update-token",
          tokenId: nextTok.id,
          token: {
            conditions: nextTok.conditions || [],
            conditionDurations: nextTok.conditionDurations ?? {},
          },
        });
      }
    }
    if (expired.length > 0) {
      setExpiredNotice(
        expired
          .map((e) => t("battlemap.condExpiredNotice", { label: e.label, condition: e.conditionId }))
          .join(" · "),
      );
    }
  }

  function setTokenInitiative(token: MapToken, val: number | null) {
    const updated = { ...token, initiative: val };
    onLocalToken(updated);
    void act({
      action: "update-token",
      tokenId: token.id,
      token: { initiative: val },
    });
    if (onSetInitiative) {
      if (val === null) {
        if (sharedInitiative) {
          const id = `bm-${token.id.slice(0, 12)}`;
          const next = sharedInitiative.entries.filter((e) => e.id !== id && e.pawnId !== pawnIdForToken(token.id));
          onSetInitiative(next.length ? { ...sharedInitiative, entries: next, turn: Math.min(sharedInitiative.turn, next.length - 1) } : null);
        }
      } else {
        onSetInitiative(
          addInitiative(sharedInitiative ?? null, {
            id: `bm-${token.id.slice(0, 12)}`,
            name: token.label,
            value: val,
            pawnId: pawnIdForToken(token.id),
          }),
        );
      }
    }
  }

  function rollTokenInitiative(token: MapToken) {
    const mod =
      token.ownerId === userId && myCharacter
        ? (myCharacter.initiativeBonus ?? Math.floor(((myCharacter.abilities?.[1] ?? 10) - 10) / 2))
        : 0;
    const roll = Math.floor(Math.random() * 20) + 1 + mod;
    setTokenInitiative(token, roll);
  }

  function rollAllInitiatives() {
    let nextShared = sharedInitiative ?? null;
    for (const t of map.tokens) {
      if (t.initiative === null || t.initiative === undefined) {
        const mod =
          t.ownerId === userId && myCharacter
            ? (myCharacter.initiativeBonus ?? Math.floor(((myCharacter.abilities?.[1] ?? 10) - 10) / 2))
            : 0;
        const val = Math.floor(Math.random() * 20) + 1 + mod;
        const updated = { ...t, initiative: val };
        onLocalToken(updated);
        void act({ action: "update-token", tokenId: t.id, token: { initiative: val } });
        if (onSetInitiative) {
          nextShared = addInitiative(nextShared, {
            id: `bm-${t.id.slice(0, 12)}`,
            name: t.label,
            value: val,
            pawnId: pawnIdForToken(t.id),
          });
        }
      }
    }
    if (onSetInitiative && nextShared) onSetInitiative(nextShared);
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
    setLocalTurnId(null);
    setLocalRound(1);
    onSetInitiative?.(null);
    void act({ action: "reset-initiative" });
    setEncounter("exploration");
  }

  function nextTurn() {
    if (onSetInitiative && sharedInitiative && sharedInitiative.entries.length > 0) {
      setEncounter("combat");
      const stepped = stepTurn(sharedInitiative, 1);
      onSetInitiative(stepped);
      const nextEntry = currentEntry(stepped);
      const nextToken = nextEntry
        ? map.tokens.find(
            (t) =>
              nextEntry.pawnId === pawnIdForToken(t.id) ||
              nextEntry.id === `bm-${t.id.slice(0, 12)}` ||
              nextEntry.id === t.id ||
              nextEntry.name.toLowerCase() === t.label.toLowerCase(),
          ) ?? null
        : null;
      applyTurnConditionTick(nextToken?.id ?? null);
      return;
    }
    const sorted = [...map.tokens]
      .filter((t) => typeof t.initiative === "number")
      .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
    if (sorted.length === 0) return;
    // The first turn starts the fight; later turns leave the music alone.
    setEncounter("combat");
    if (onSetInitiative) {
      let init: Initiative | null = null;
      for (const t of sorted) {
        init = addInitiative(init, {
          id: `bm-${t.id.slice(0, 12)}`,
          name: t.label,
          value: t.initiative ?? 0,
          pawnId: pawnIdForToken(t.id),
        });
      }
      onSetInitiative(init);
      applyTurnConditionTick(sorted[0]?.id ?? null);
      return;
    }
    if (!localTurnId) {
      setLocalTurnId(sorted[0].id);
      applyTurnConditionTick(sorted[0].id);
      return;
    }
    const idx = sorted.findIndex((t) => t.id === localTurnId);
    if (idx === -1 || idx >= sorted.length - 1) {
      setLocalTurnId(sorted[0].id);
      setLocalRound((r) => r + 1);
      applyTurnConditionTick(sorted[0].id);
    } else {
      setLocalTurnId(sorted[idx + 1].id);
      applyTurnConditionTick(sorted[idx + 1].id);
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

  useEffect(() => {
    if (!lastPing?.pullView || lastHandledPingIdRef.current === lastPing.id) return;
    lastHandledPingIdRef.current = lastPing.id;
    const box = boardRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return;
    const gx = (lastPing.x / Math.max(1, map.grid)) * box.width;
    const gy = (lastPing.y / Math.max(1, rows)) * box.height;
    setPan({
      x: box.width / 2 - gx * zoom,
      y: box.height / 2 - gy * zoom,
    });
  }, [lastPing, map.grid, rows, zoom]);

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
            id: `st-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
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
    fogDraggedRef.current = false;

    const move = (moveEvent: PointerEvent) => {
      const now = toGrid(moveEvent);
      const start = fogStartRef.current;
      if (!start) return;
      const dist = Math.hypot(now.x - start.x, now.y - start.y);
      if (dist > 0.25) fogDraggedRef.current = true;
      const x = Math.min(start.x, now.x);
      const y = Math.min(start.y, now.y);
      const w = Math.max(0.5, Math.abs(now.x - start.x));
      const h = Math.max(0.5, Math.abs(now.y - start.y));
      const next: MapFog = { id: "draft", x, y, w, h, mode: fogMode };
      fogDraftRef.current = next;
      setFogDraft(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      const draft = fogDraftRef.current;
      fogStartRef.current = null;
      fogDraftRef.current = null;
      setFogDraft(null);
      if (draft && draft.id === "draft" && fogDraggedRef.current) {
        const { id: _id, ...fog } = draft;
        void act({ action: "add-fog", fog });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  function startRuler(event: React.PointerEvent) {
    if (mode !== "ruler") return;
    event.preventDefault();
    const rawStart = toGrid(event);
    const start =
      snapMode !== "none" && !event.shiftKey
        ? snapPoint(rawStart.x, rawStart.y, snapMode, map.grid, rows)
        : rawStart;
    rulerStartRef.current = start;
    setRulerPts({ sx: start.x, sy: start.y, ex: start.x, ey: start.y });

    const move = (moveEvent: PointerEvent) => {
      const raw = toGrid(moveEvent);
      const end =
        snapMode !== "none" && !moveEvent.shiftKey
          ? snapPoint(raw.x, raw.y, snapMode, map.grid, rows)
          : raw;
      const anchor = rulerStartRef.current;
      if (!anchor) return;
      setRulerPts({ sx: anchor.x, sy: anchor.y, ex: end.x, ey: end.y });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  function startArea(event: React.PointerEvent) {
    if (mode !== "area") return;
    event.preventDefault();
    const rawStart = toGrid(event);
    const start =
      snapMode !== "none" && !event.shiftKey
        ? snapPoint(rawStart.x, rawStart.y, snapMode, map.grid, rows)
        : rawStart;
    const initArea: MapArea = {
      id: "draft",
      shape: aoeShape,
      x: start.x,
      y: start.y,
      tx: start.x,
      ty: start.y,
      sizeFt: aoeSizeFt,
      color: "#f97316",
    };
    areaDraftRef.current = initArea;
    setAreaDraft(initArea);

    const move = (moveEvent: PointerEvent) => {
      const raw = toGrid(moveEvent);
      const now =
        snapMode !== "none" && !moveEvent.shiftKey
          ? snapPoint(raw.x, raw.y, snapMode, map.grid, rows)
          : raw;
      const cur = areaDraftRef.current;
      if (!cur) return;
      const next: MapArea = { ...cur, tx: now.x, ty: now.y };
      areaDraftRef.current = next;
      setAreaDraft(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      const draft = areaDraftRef.current;
      areaDraftRef.current = null;
      setAreaDraft(null);
      if (draft) {
        const { id: _id, ...area } = draft;
        void act({ action: "add-area", area });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  function sendPing(point: { x: number; y: number }, forcePull = false) {
    const pull = Boolean(gm && (forcePull || pullViewNext));
    if (pullViewNext) setPullViewNext(false);
    setActivePing({
      id: `local-${Date.now()}`,
      x: point.x,
      y: point.y,
      color: "#38bdf8",
      byName: "Ping",
      pullView: pull || undefined,
      at: Date.now(),
    });
    void act({
      action: "ping",
      x: point.x,
      y: point.y,
      color: "#38bdf8",
      pullView: pull,
    });
  }

  function onBoardPointerDown(event: React.PointerEvent) {
    if (event.button === 1) {
      startPan(event);
      return;
    }
    if (event.altKey || mode === "ping") {
      event.preventDefault();
      sendPing(toGrid(event), event.shiftKey);
      return;
    }
    if (mode === "paint") {
      startPaint(event);
    } else if (mode === "fog") {
      startFog(event);
    } else if (mode === "ruler") {
      startRuler(event);
    } else if (mode === "area") {
      startArea(event);
    } else {
      onSelectToken?.(null);
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

  /** GM: drop a monster or fixture from the palette near the board center, on a free square. */
  function addMonster(monster: BattlemapPaletteEntry) {
    setPaletteOpen(false);
    setPaletteQuery("");
    const spot = freeSpot(map.tokens, Math.round(map.grid / 2), Math.round(rows / 2), monster.size, map.grid, rows);
    void act({
      action: "add-token",
      token: {
        label: monster.label,
        color: monster.color,
        avatarUrl: monster.avatarUrl,
        size: monster.size,
        ...(typeof monster.hp === "number" ? { hp: monster.hp, maxHp: monster.hp } : {}),
        x: spot.x,
        y: spot.y,
      },
    });
  }

  function addCustomMobByName(rawName: string) {
    const clean = rawName.trim().slice(0, 40);
    if (!clean) return;
    addMonster({
      label: clean,
      color: "#a855f7",
      size: 1,
      avatarUrl: tokenImageUrl(clean),
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

  const hpVis: HpVisibility = map.hpVisibility ?? "exact";
  const nextHpVis: HpVisibility = hpVis === "exact" ? "tier" : hpVis === "tier" ? "hidden" : "exact";
  const activeSceneId = scenes?.find((s) => s.active)?.id || map.id;
  const hasCoverFog = map.fog.some((f) => f.mode !== "reveal");
  const sortedInitiativeTokens = [...map.tokens]
    .filter((t) => (gm || !t.hidden) && typeof t.initiative === "number")
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
  const curInitIdx = currentTurnId ? sortedInitiativeTokens.findIndex((t) => t.id === currentTurnId) : -1;
  const currentInitToken = curInitIdx >= 0 ? sortedInitiativeTokens[curInitIdx] : null;
  const onDeckToken =
    sortedInitiativeTokens.length >= 2 && curInitIdx >= 0
      ? sortedInitiativeTokens[(curInitIdx + 1) % sortedInitiativeTokens.length]
      : null;

  return (
    <div className={`battlemap ${expanded ? "expanded" : ""}`}>
      <div className="battlemap-bar">
        <div className="flex items-center gap-2 min-w-0">
          <strong className="flex items-center gap-1.5"><Map size={16} /> {map.name}</strong>
          {gm && ((scenes && scenes.length > 0) || onPrepScene) && (
            <div className="bm-scene-bar">
              {scenes && scenes.length > 0 && onSwitchScene && (
                <select
                  aria-label={t("battlemap.sceneSelectAria")}
                  value={activeSceneId}
                  onChange={(e) => onSwitchScene(e.target.value)}
                >
                  {scenes.map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.name} ({scene.tokenCount})
                    </option>
                  ))}
                </select>
              )}
              {onPrepScene && (
                <button
                  type="button"
                  title={t("battlemap.prepSceneTitle")}
                  onClick={onPrepScene}
                >
                  {t("battlemap.prepSceneBtn")}
                </button>
              )}
              {onDeleteScene && scenes && scenes.length > 1 && (
                <button
                  type="button"
                  title={t("battlemap.deleteSceneTitle")}
                  onClick={() => onDeleteScene(activeSceneId)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="battlemap-tools">
          <button
            type="button"
            className={mode === "move" ? "on" : ""}
            onClick={() => setMode("move")}
            title={t("battlemap.moveTokens")}
          >
            <Hand size={14} />
          </button>
          <button
            type="button"
            className={mode === "paint" ? "on" : ""}
            onClick={() => setMode("paint")}
            title={t("battlemap.paint")}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className={mode === "ruler" ? "on" : ""}
            onClick={() => setMode(mode === "ruler" ? "move" : "ruler")}
            title={t("battlemap.rulerTitle")}
          >
            <Ruler size={14} />
          </button>
          <button
            type="button"
            className={mode === "area" ? "on" : ""}
            onClick={() => setMode(mode === "area" ? "move" : "area")}
            title={t("battlemap.aoeTitle")}
          >
            <Target size={14} />
          </button>
          <button
            type="button"
            className={mode === "ping" ? "on" : ""}
            onClick={() => setMode(mode === "ping" ? "move" : "ping")}
            title={t("battlemap.pingTitle")}
          >
            <MapPin size={14} />
          </button>
          {gm && (
            <>
              <button
                type="button"
                className={mode === "fog" ? "on" : ""}
                onClick={() => setMode("fog")}
                title={t("battlemap.fogOfWar")}
              >
                <CloudFog size={14} />
              </button>
              <button
                type="button"
                className={hpVis !== "exact" ? "on" : ""}
                onClick={() =>
                  onSetHpVisibility
                    ? onSetHpVisibility(nextHpVis)
                    : void act({ action: "set-hp-visibility", hpVisibility: nextHpVis })
                }
                title={t(
                  hpVis === "exact"
                    ? "battlemap.hpVisExact"
                    : hpVis === "tier"
                      ? "battlemap.hpVisTier"
                      : "battlemap.hpVisHidden",
                )}
              >
                {hpVis === "hidden" ? <EyeOff size={14} /> : hpVis === "tier" ? <Shield size={14} /> : <Eye size={14} />}
              </button>
            </>
          )}
          <span className="battlemap-zoom">
            <button type="button" title={t("battlemap.zoomOut")} onClick={() => zoomBy(1 / 1.25)}>
              <ZoomOut size={14} />
            </button>
            <button type="button" title={t("battlemap.resetView")} onClick={resetView}>
              <RotateCcw size={14} />
            </button>
            <span className="battlemap-zoom-badge" title={t("battlemap.zoomLevel")}>
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" title={t("battlemap.zoomIn")} onClick={() => zoomBy(1.25)}>
              <ZoomIn size={14} />
            </button>
          </span>
          <button
            type="button"
            className={expanded ? "on" : ""}
            title={expanded ? t("battlemap.normalView") : t("battlemap.expandView")}
            onClick={() => setExpanded((exp) => !exp)}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            type="button"
            className={snapMode !== "none" ? "on" : ""}
            title={t("battlemap.gridSnapTitle", { mode: snapMode.toUpperCase() })}
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
            title={t("battlemap.trackerTitle")}
            onClick={() => setInitiativeOpen((open) => !open)}
          >
            <Swords size={14} />
          </button>
          {onOpenTabletop && (
            <button type="button" title={t("battlemap.openTabletopTitle")} onClick={onOpenTabletop}>
              <Box size={14} />
            </button>
          )}
          {onOpenCompanion && (
            <button type="button" title={t("battlemap.openCompanionTitle")} onClick={onOpenCompanion}>
              <ExternalLink size={14} />
            </button>
          )}
          {onRollCommand && (
            <button type="button" title={t("battlemap.rollD20Title")} onClick={() => onRollCommand("/roll 1d20")}>
              <Dice5 size={14} />
            </button>
          )}
          {mode === "paint" && (
            <>
              {PAINT_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`paint-swatch ${color === option ? "on" : ""}`}
                  style={{ background: option }}
                  aria-label={t("battlemap.paintColorAria", { color: option })}
                  onClick={() => setColor(option)}
                />
              ))}
              <input
                type="range"
                min={1}
                max={12}
                value={width}
                aria-label={t("battlemap.brushSizeAria")}
                onChange={(event) => setWidth(Number(event.target.value))}
              />
            </>
          )}
          {!map.tokens.some((token) => token.ownerId === userId) && (
            <button type="button" title={t("battlemap.putCharTitle")} onClick={onAddMyToken}>
              <UserRound size={14} />
            </button>
          )}
          {gm && (
            <>
              <div className="battlemap-palette-wrap" ref={paletteWrapRef}>
                <button
                  type="button"
                  className={paletteOpen ? "on" : ""}
                  title={t("battlemap.addMonsterTitle")}
                  onClick={() => {
                    // Open towards whichever side has room, so it is never cut off.
                    const box = paletteWrapRef.current?.getBoundingClientRect();
                    setPaletteLeft(Boolean(box && box.right < 300));
                    setPaletteOpen((open) => !open);
                  }}
                >
                  <Plus size={14} />
                </button>
                {paletteOpen && (() => {
                  const q = paletteQuery.trim().toLowerCase();
                  const filtered = q
                    ? MONSTER_PALETTE.filter((m) => m.label.toLowerCase().includes(q))
                    : MONSTER_PALETTE;
                  return (
                    <div
                      className={`battlemap-palette ${paletteLeft ? "battlemap-palette-left" : ""}`}
                      style={{ width: 320, maxHeight: 360 }}
                    >
                      <div className="battlemap-palette-title">{t("battlemap.addToTable")}</div>
                      <input
                        type="text"
                        value={paletteQuery}
                        onChange={(e) => setPaletteQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && paletteQuery.trim()) {
                            e.preventDefault();
                            if (filtered.length === 1) addMonster(filtered[0]);
                            else addCustomMobByName(paletteQuery);
                          }
                        }}
                        placeholder={t("battlemap.filterMobPlaceholder")}
                        style={{
                          width: "100%",
                          marginBottom: 8,
                          padding: "5px 8px",
                          fontSize: 12,
                          borderRadius: 6,
                          border: "1px solid var(--line)",
                          background: "var(--bg)",
                          color: "var(--ink)",
                        }}
                      />
                      {q && !filtered.some((m) => m.label.toLowerCase() === q) && (
                        <button
                          type="button"
                          className="battlemap-palette-item"
                          style={{
                            width: "100%",
                            height: "auto",
                            minHeight: 34,
                            justifyContent: "flex-start",
                            padding: "5px 8px",
                            gap: 8,
                            fontSize: 12,
                            marginBottom: 6,
                          }}
                          onClick={() => addCustomMobByName(paletteQuery)}
                        >
                          <span
                            className="battlemap-palette-token"
                            style={{ width: 26, height: 26, background: "#a855f7" }}
                          >
                            {paletteQuery.trim().slice(0, 2).toUpperCase()}
                          </span>
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              textAlign: "left",
                              color: "var(--ink)",
                            }}
                          >
                            {t("battlemap.spawnMob", { name: paletteQuery.trim() })}
                          </span>
                        </button>
                      )}
                      <div className="battlemap-palette-grid">
                        {filtered.map((monster) => (
                          <button
                            key={monster.label}
                            type="button"
                            className="battlemap-palette-item"
                            style={{
                              width: "100%",
                              height: "auto",
                              minHeight: 34,
                              justifyContent: "flex-start",
                              padding: "5px 8px",
                              gap: 8,
                              fontSize: 12,
                            }}
                            onClick={() => addMonster(monster)}
                          >
                            <span
                              className="battlemap-palette-token"
                              style={{ width: 26, height: 26, background: monster.color, overflow: "hidden" }}
                            >
                              {!brokenImgs.has(monster.avatarUrl) ? (
                                <img
                                  src={monster.avatarUrl}
                                  alt=""
                                  width={26}
                                  height={26}
                                  loading="lazy"
                                  decoding="async"
                                  {...({ fetchpriority: "low" } as Record<string, string>)}
                                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                                  onError={() =>
                                    setBrokenImgs((prev) => new Set(prev).add(monster.avatarUrl))
                                  }
                                />
                              ) : (
                                monster.label.slice(0, 2).toUpperCase()
                              )}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                textAlign: "left",
                                color: "var(--ink)",
                              }}
                            >
                              {monster.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <button
                type="button"
                title={t("battlemap.clearPaint")}
                onClick={() => void act({ action: "clear", what: "strokes" })}
              >
                <Eraser size={14} />
              </button>
              <button
                type="button"
                className="danger"
                title={t("battlemap.closeForAll")}
                onClick={() => void act({ action: "close" })}
              >
                <X size={14} />
              </button>
            </>
          )}
          {!gm && (
            <button type="button" title={t("battlemap.hideForMe")} onClick={onClose}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {gm && mode === "fog" && (
        <div className="bm-subbar">
          <button
            type="button"
            className={fogMode === "cover" ? "on" : ""}
            onClick={() => setFogMode("cover")}
          >
            {t("battlemap.fogCover")}
          </button>
          <button
            type="button"
            className={fogMode === "reveal" ? "on" : ""}
            onClick={() => setFogMode("reveal")}
          >
            {t("battlemap.fogReveal")}
          </button>
          <button type="button" onClick={() => void act({ action: "cover-all-fog" })}>
            {t("battlemap.fogCoverAll")}
          </button>
          <button type="button" onClick={() => void act({ action: "clear-fog" })}>
            {t("battlemap.fogClearAll")}
          </button>
        </div>
      )}

      {mode === "area" && (
        <div className="bm-subbar">
          {(["sphere", "cone", "cube", "line"] as const).map((shape) => (
            <button
              key={shape}
              type="button"
              className={aoeShape === shape ? "on" : ""}
              onClick={() => setAoeShape(shape)}
            >
              {t(
                shape === "sphere"
                  ? "battlemap.aoeSphere"
                  : shape === "cone"
                    ? "battlemap.aoeCone"
                    : shape === "cube"
                      ? "battlemap.aoeCube"
                      : "battlemap.aoeLine",
              )}
            </button>
          ))}
          <span style={{ opacity: 0.4 }}>|</span>
          {[10, 15, 20, 30, 60].map((ft) => (
            <button
              key={ft}
              type="button"
              className={aoeSizeFt === ft ? "on" : ""}
              onClick={() => setAoeSizeFt(ft)}
            >
              {t("battlemap.aoeSizeFt", { ft })}
            </button>
          ))}
          <button type="button" onClick={() => void act({ action: "clear-areas" })}>
            {t("battlemap.aoeClear")}
          </button>
        </div>
      )}

      {gm && mode === "ping" && (
        <div className="bm-subbar">
          <button
            type="button"
            className={pullViewNext ? "on" : ""}
            title={t("battlemap.pullViewTitle")}
            onClick={() => setPullViewNext((v) => !v)}
          >
            {t("battlemap.pullView")}
          </button>
        </div>
      )}

      {concentrationPrompt && (
        <div className="bm-banner" role="status">
          <span>
            {t("battlemap.concCheckBanner", {
              label: concentrationPrompt.label,
              damage: concentrationPrompt.damage,
              dc: concentrationPrompt.dc,
            })}
          </span>
          <div className="flex items-center gap-2">
            {onRollCommand && (
              <button
                type="button"
                className="px-2 py-0.5 rounded bg-amber-500 text-black font-bold text-[11px]"
                onClick={() => {
                  onRollCommand("/roll 1d20");
                  setConcentrationPrompt(null);
                }}
              >
                {t("battlemap.rollConSave")}
              </button>
            )}
            <button type="button" onClick={() => setConcentrationPrompt(null)}>
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {expiredNotice && (
        <div className="bm-banner" role="status">
          <span>{expiredNotice}</span>
          <button type="button" onClick={() => setExpiredNotice(null)}>
            <X size={13} />
          </button>
        </div>
      )}

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
            {hasCoverFog && (
              <mask id={fogMaskId}>
                <rect x={0} y={0} width={map.grid} height={rows} fill="black" />
                {map.fog.map((fog) => (
                  <rect
                    key={fog.id}
                    x={fog.x}
                    y={fog.y}
                    width={fog.w}
                    height={fog.h}
                    fill={fog.mode === "reveal" ? "black" : "white"}
                  />
                ))}
              </mask>
            )}
          </defs>
          {snapMode === "square" && <rect width={map.grid} height={rows} fill="url(#bm-grid)" />}
          {snapMode === "hex" && <rect width={map.grid} height={rows} fill="url(#bm-hex-grid)" />}
          {/* Persistent + draft AoE spell templates */}
          {[...(map.areas || []), ...(areaDraft ? [areaDraft] : [])].map((area) => {
            const geom = areaSvgGeometry(area);
            const col = area.color || "#f97316";
            const canDelete = area.id !== "draft" && (gm || area.ownerId === userId) && mode === "area";
            return geom.kind === "circle" ? (
              <circle
                key={area.id}
                cx={geom.cx}
                cy={geom.cy}
                r={geom.r}
                fill={col}
                fillOpacity={0.2}
                stroke={col}
                strokeWidth={0.08}
                strokeDasharray="0.22 0.14"
                style={{ pointerEvents: canDelete ? "all" : "none", cursor: canDelete ? "pointer" : undefined }}
                onClick={() => {
                  if (canDelete) void act({ action: "remove-area", areaId: area.id });
                }}
              />
            ) : (
              <polygon
                key={area.id}
                points={geom.points}
                fill={col}
                fillOpacity={0.2}
                stroke={col}
                strokeWidth={0.08}
                strokeDasharray="0.22 0.14"
                style={{ pointerEvents: canDelete ? "all" : "none", cursor: canDelete ? "pointer" : undefined }}
                onClick={() => {
                  if (canDelete) void act({ action: "remove-area", areaId: area.id });
                }}
              />
            );
          })}
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
          {/* Fog of war via SVG <mask>: supports cover rects + reveal cutouts */}
          {hasCoverFog && (
            <rect
              x={0}
              y={0}
              width={map.grid}
              height={rows}
              fill={gm ? "rgba(15, 23, 42, 0.55)" : "rgba(7, 9, 13, 0.96)"}
              mask={`url(#${fogMaskId})`}
            />
          )}
          {gm &&
            map.fog.map((fog) => (
              <g key={fog.id}>
                {mode === "fog" && (
                  <rect
                    x={fog.x}
                    y={fog.y}
                    width={fog.w}
                    height={fog.h}
                    fill="none"
                    stroke={fog.mode === "reveal" ? "#34d399" : "#94a3b8"}
                    strokeWidth={0.05}
                    strokeDasharray="0.18 0.12"
                  />
                )}
                <rect
                  x={fog.x}
                  y={fog.y}
                  width={fog.w}
                  height={fog.h}
                  className="battlemap-fog-hit"
                  style={{ pointerEvents: mode === "fog" ? "all" : undefined }}
                  onClick={() => {
                    if (!fogDraggedRef.current) {
                      void act({ action: "remove-fog", fogId: fog.id });
                    }
                  }}
                />
              </g>
            ))}
          {fogDraft && fogDraft.id === "draft" && (
            <rect
              x={fogDraft.x}
              y={fogDraft.y}
              width={fogDraft.w}
              height={fogDraft.h}
              fill={fogDraft.mode === "reveal" ? "rgba(52, 211, 153, 0.25)" : undefined}
              className={fogDraft.mode === "reveal" ? "" : "battlemap-fog draft"}
            />
          )}
          {rulerPts && (
            <line
              x1={rulerPts.sx}
              y1={rulerPts.sy}
              x2={rulerPts.ex}
              y2={rulerPts.ey}
              stroke="#38bdf8"
              strokeWidth={0.1}
              strokeDasharray="0.22 0.14"
            />
          )}
        </svg>
        {rulerPts && (rulerPts.sx !== rulerPts.ex || rulerPts.sy !== rulerPts.ey) && (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 bg-neutral-950/90 text-sky-300 border border-sky-400/50 rounded px-1.5 py-0.5 text-[11px] font-bold pointer-events-none z-20 whitespace-nowrap"
            style={{
              left: `${(((rulerPts.sx + rulerPts.ex) / 2) / map.grid) * 100}%`,
              top: `${(((rulerPts.sy + rulerPts.ey) / 2) / rows) * 100}%`,
            }}
          >
            {measureFeet(rulerPts.sx, rulerPts.sy, rulerPts.ex, rulerPts.ey)} ft
          </div>
        )}
        {activePing && (
          <div
            className="bm-ping-ring"
            style={{
              left: `${(activePing.x / map.grid) * 100}%`,
              top: `${(activePing.y / rows) * 100}%`,
              borderColor: activePing.color,
            }}
            title={t("battlemap.pingedBy", { name: activePing.byName })}
          />
        )}

        {map.tokens
          .filter((token) => gm || !token.hidden)
          .map((token) => {
          const mine = canMove(token);
          const renaming = renamingId === token.id;
          const isActiveTurn = currentTurnId === token.id;
          const isSelected = selectedTokenId === token.id;
          const canSeeExactHp = gm || token.ownerId === userId || hpVis === "exact";
          const hpTier =
            !canSeeExactHp && hpVis === "tier"
              ? token.hpTier ??
                (typeof token.hp === "number" && typeof token.maxHp === "number"
                  ? hpTierFor(token.hp, token.maxHp)
                  : null)
              : null;
          return (
            <div
              key={token.id}
              data-token-id={token.id}
              className={`battlemap-token ${mine ? "movable" : ""} ${
                token.hidden ? "bm-token-hidden" : ""
              } ${dragging === token.id ? "dragging" : ""} ${
                resizing === token.id ? "resizing" : ""
              }`}
              style={{
                left: `${(token.x / map.grid) * 100}%`,
                top: `${(token.y / rows) * 100}%`,
                width: `${((token.size ?? 1) / map.grid) * 100}%`,
                borderColor: token.color,
                boxShadow: isActiveTurn
                  ? "0 0 0 3px #f59e0b, 0 0 16px rgba(245, 158, 11, 0.85)"
                  : isSelected
                    ? "0 0 0 2px #38bdf8, 0 0 10px rgba(56, 189, 248, 0.65)"
                    : undefined,
              }}
              title={token.label}
              onPointerDown={(event) => {
                onSelectToken?.(token.id);
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
                    const dur = token.conditionDurations?.[cid];
                    return (
                      <span
                        key={cid}
                        className="px-1 py-0.2 text-[8px] font-black rounded shadow text-white leading-tight uppercase cursor-pointer hover:opacity-80"
                        style={{ backgroundColor: info.color }}
                        title={t("battlemap.condRemoveTitle", { label: info.label, desc: info.description })}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCondition(token, cid);
                        }}
                      >
                        {info.badge}
                        {dur ? ` ${t("battlemap.roundsShort", { count: dur })}` : ""}
                      </span>
                    );
                  })}
                </div>
              )}

              {gm && token.hidden && (
                <span className="absolute -top-2 -right-2 px-1 py-0.2 text-[8px] font-black rounded bg-neutral-950/90 text-amber-300 border border-amber-400/50 z-10 pointer-events-none">
                  {t("battlemap.gmHiddenBadge")}
                </span>
              )}

              {token.avatarUrl && !brokenImgs.has(token.avatarUrl) ? (
                <img
                  src={token.avatarUrl}
                  alt={token.label}
                  onError={() =>
                    setBrokenImgs((prev) => new Set(prev).add(token.avatarUrl!))
                  }
                />
              ) : (
                <span style={{ background: token.color }}>
                  {token.label.slice(0, 2).toUpperCase()}
                </span>
              )}
              <b>{token.label}</b>

              {/* HP badge below label */}
              {canSeeExactHp && typeof token.hp === "number" && (
                <div className="absolute -bottom-4.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-emerald-400 whitespace-nowrap bg-black/85 px-1 rounded shadow pointer-events-none">
                  {token.hp}
                  {typeof token.maxHp === "number" ? `/${token.maxHp}` : ""}
                </div>
              )}
              {!canSeeExactHp && hpTier && (
                <div
                  className="bm-hp-tier absolute -bottom-4.5 left-1/2 -translate-x-1/2 pointer-events-none"
                  style={{ color: hpTier.color, borderColor: hpTier.color }}
                >
                  {hpTier.label}
                </div>
              )}

              {/* Status conditions toggle button on token */}
              {canRename(token) && (
                <button
                  type="button"
                  className="battlemap-rename-btn !right-auto !left-[-10px] !bg-neutral-800 hover:!bg-neutral-700"
                  title={t("battlemap.conditions")}
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
                  className="absolute left-1/2 top-full mt-4 -translate-x-1/2 bg-neutral-900 border border-white/20 rounded-lg p-2 shadow-2xl z-40 w-56 text-left text-white pointer-events-auto cursor-default"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/10 text-[11px] font-semibold">
                    <span>{t("battlemap.conditions")}</span>
                    <div className="flex items-center gap-1.5">
                      {gm && (
                        <button
                          type="button"
                          className="text-white/70 hover:text-amber-300"
                          title={t("battlemap.toggleHidden")}
                          onClick={() => {
                            const nextHidden = !token.hidden;
                            const updated = { ...token, hidden: nextHidden || undefined };
                            onLocalToken(updated);
                            void act({
                              action: "update-token",
                              tokenId: token.id,
                              token: { hidden: nextHidden },
                            });
                          }}
                        >
                          {token.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-white/60 hover:text-white"
                        onClick={() => setConditionPickerTokenId(null)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                    {CONDITIONS.map((c) => {
                      const active = (token.conditions || []).includes(c.id);
                      const dur = token.conditionDurations?.[c.id];
                      return (
                        <div key={c.id} className="flex items-center gap-1">
                          <button
                            type="button"
                            className={`flex-1 flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] transition-colors ${
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
                          {active && (
                            <div className="flex items-center gap-0.5">
                              {([1, 3, 10] as const).map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  className={`px-1 py-0.5 rounded text-[9px] ${
                                    dur === r ? "bg-amber-500 text-black font-bold" : "bg-white/10 text-white/70 hover:bg-white/20"
                                  }`}
                                  onClick={() => setConditionDuration(token, c.id, dur === r ? null : r)}
                                >
                                  {r}
                                </button>
                              ))}
                              <button
                                type="button"
                                className={`px-1 py-0.5 rounded text-[9px] ${
                                  !dur ? "bg-amber-500 text-black font-bold" : "bg-white/10 text-white/70 hover:bg-white/20"
                                }`}
                                onClick={() => setConditionDuration(token, c.id, null)}
                              >
                                {t("battlemap.roundsInfinite")}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {canRename(token) && !renaming && (
                <button
                  type="button"
                  className="battlemap-rename-btn"
                  title={t("battlemap.renameToken")}
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
                  title={t("battlemap.resizeToken")}
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
              <span className="font-semibold text-sm">{t("battlemap.trackerHeading")}</span>
            </div>
            <button
              type="button"
              className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-white"
              onClick={() => setInitiativeOpen(false)}
              title={t("battlemap.closeTracker")}
            >
              <X size={14} />
            </button>
          </div>

          {/* Turn & Round controls */}
          <div className="p-2.5 border-b border-white/10 bg-white/5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-amber-400">{t("battlemap.round", { round })}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                  map.encounter === "combat"
                    ? "bg-red-500/20 text-red-300 border-red-500/30"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                }`}
              >
                {map.encounter === "combat" ? t("battlemap.combat") : t("battlemap.exploration")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={nextTurn}
                className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold rounded flex items-center gap-1 transition-colors"
                title={t("battlemap.nextTurnTitle")}
              >
                <span>{t("battlemap.nextTurn")}</span>
                <ChevronRight size={13} />
              </button>
              {gm && (
                <button
                  type="button"
                  onClick={resetEncounter}
                  className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-white"
                  title={t("battlemap.resetEncounter")}
                >
                  <RotateCcw size={13} />
                </button>
              )}
            </div>
          </div>

          {currentInitToken && onDeckToken && (
            <div className="px-3 py-1 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-200 truncate">
              {t("battlemap.nowOnDeck", { now: currentInitToken.label, next: onDeckToken.label })}
            </div>
          )}

          {/* Quick actions for GM */}
          {gm && (
            <div className="px-3 py-1.5 bg-black/20 border-b border-white/5 flex items-center justify-between text-[11px] text-white/60">
              <span>{t("battlemap.quickActions")}</span>
              <button
                type="button"
                onClick={() => setEncounter(map.encounter === "combat" ? "exploration" : "combat")}
                className="hover:text-amber-300 flex items-center gap-1"
                title={t("battlemap.musicSwitchTitle")}
              >
                <Music size={12} />
                <span>{map.encounter === "combat" ? t("battlemap.endCombat") : t("battlemap.startCombat")}</span>
              </button>
              <button
                type="button"
                onClick={rollAllInitiatives}
                className="hover:text-amber-300 flex items-center gap-1"
              >
                <Dice5 size={12} />
                <span>{t("battlemap.rollAllD20")}</span>
              </button>
            </div>
          )}

          {/* Combatant list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {map.tokens.filter((t) => gm || !t.hidden).length === 0 ? (
              <div className="text-center py-8 text-white/40 text-xs">
                {t("battlemap.noTokens")}
              </div>
            ) : (
              [...map.tokens]
                .filter((t) => gm || !t.hidden)
                .sort((a, b) => {
                  const initA = a.initiative ?? -999;
                  const initB = b.initiative ?? -999;
                  return initB - initA;
                })
                .map((tok) => {
                  const isActive = currentTurnId === tok.id;
                  const curHp = tok.hp ?? (tok.maxHp ?? 10);
                  const maxHp = tok.maxHp ?? 10;
                  const canSeeExact = gm || tok.ownerId === userId || hpVis === "exact";
                  const tokTier =
                    !canSeeExact && hpVis === "tier"
                      ? tok.hpTier ??
                        (typeof tok.hp === "number" && typeof tok.maxHp === "number"
                          ? hpTierFor(tok.hp, tok.maxHp)
                          : null)
                      : null;
                  return (
                    <div
                      key={tok.id}
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
                            style={{ backgroundColor: tok.color }}
                          />
                          <span className="font-semibold text-xs truncate" title={tok.label}>
                            {tok.label}
                          </span>
                          {gm && tok.hidden && (
                            <span className="text-[8px] px-1 rounded bg-white/15 text-amber-300 font-bold">
                              {t("battlemap.gmHiddenBadge")}
                            </span>
                          )}
                          {isActive && (
                            <span className="text-[9px] bg-amber-400 text-black font-extrabold px-1 rounded uppercase">
                              {t("battlemap.turn")}
                            </span>
                          )}
                        </div>

                        {/* Initiative score / roll */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {gm && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextHidden = !tok.hidden;
                                onLocalToken({ ...tok, hidden: nextHidden || undefined });
                                void act({
                                  action: "update-token",
                                  tokenId: tok.id,
                                  token: { hidden: nextHidden },
                                });
                              }}
                              className="p-1 text-white/50 hover:text-amber-300"
                              title={t("battlemap.toggleHidden")}
                            >
                              {tok.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          )}
                          {typeof tok.initiative === "number" ? (
                            <button
                              type="button"
                              onClick={() => rollTokenInitiative(tok)}
                              className="px-1.5 py-0.5 bg-black/40 hover:bg-black/60 rounded text-xs font-bold text-amber-300 border border-amber-500/30"
                              title={t("battlemap.rerollInit")}
                            >
                              ⚡ {tok.initiative}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => rollTokenInitiative(tok)}
                              className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded text-[10px] text-white/70 flex items-center gap-1"
                              title={t("battlemap.rollInit")}
                            >
                              <Dice5 size={11} />
                              <span>{t("battlemap.roll")}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* HP Tracker */}
                      <div className="flex items-center justify-between text-[11px] text-white/70 bg-black/25 px-1.5 py-0.5 rounded mb-1.5">
                        <span className="flex items-center gap-1">
                          <Heart size={10} className="text-rose-400" />
                          {canSeeExact ? (
                            <span>{t("battlemap.hpLine", { cur: curHp, max: maxHp })}</span>
                          ) : tokTier ? (
                            <span style={{ color: tokTier.color, fontWeight: 700 }}>{tokTier.label}</span>
                          ) : (
                            <span>{t("battlemap.hpHiddenLabel")}</span>
                          )}
                        </span>
                        {(gm || tok.ownerId === userId) && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => updateTokenHp(tok, -1)}
                              className="w-4 h-4 rounded bg-white/10 hover:bg-rose-500/30 hover:text-rose-300 flex items-center justify-center font-bold text-xs"
                              title={t("battlemap.minusHp")}
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => updateTokenHp(tok, 1)}
                              className="w-4 h-4 rounded bg-white/10 hover:bg-emerald-500/30 hover:text-emerald-300 flex items-center justify-center font-bold text-xs"
                              title={t("battlemap.plusHp")}
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Conditions row */}
                      <div className="flex items-center gap-1 flex-wrap">
                        {(tok.conditions || []).map((cid) => {
                          const info = CONDITIONS.find((c) => c.id === cid);
                          if (!info) return null;
                          const dur = tok.conditionDurations?.[cid];
                          return (
                            <span
                              key={cid}
                              className="px-1 py-0.2 text-[8px] font-bold rounded shadow text-white leading-tight uppercase cursor-pointer hover:opacity-80"
                              style={{ backgroundColor: info.color }}
                              title={t("battlemap.condShortRemove", { label: info.label })}
                              onClick={() => toggleCondition(tok, cid)}
                            >
                              {info.badge}
                              {dur ? ` ${t("battlemap.roundsShort", { count: dur })}` : ""} ×
                            </span>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() =>
                            setConditionPickerTokenId(
                              conditionPickerTokenId === tok.id ? null : tok.id,
                            )
                          }
                          className="text-[10px] text-white/40 hover:text-white/80 px-1 py-0.2 rounded hover:bg-white/10"
                          title={t("battlemap.addConditionTitle")}
                        >
                          {t("battlemap.addCondBtn")}
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
