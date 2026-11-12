"use client";

import { toggleFullscreen as toggleElementFullscreen } from "../lib/fullscreen";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  BOT_ACTIVITY_NAMES,
  DEEPPIXEL_URL,
  DEEPPIXEL_FROM_GAME,
  DEEPPIXEL_TO_GAME,
  DEFAULT_TIERS,
  isBotActivity,
  RICHUP_URL,
  richupRoomUrl,
  type ActivityStroke,
  type InitiativeEntry,
  type RoomActivity,
  type RoomActivityKind,
  type TierRow,
} from "@/lib/activities";
import {
  Dices,
  PartyPopper,
  Timer,
  Plus,
  Trash2,
  Play,
  SkipForward,
  RotateCcw,
  PenTool,
  Trophy,
  Palette,
  ExternalLink,
  ChevronDown,
  Eraser,
  Undo2,
  Gamepad2,
  Maximize2,
  Landmark,
  Hand,
  Smartphone,
  Bot,
  Drum,
  BookOpen,
} from "lucide-react";
import { starterBeatboxState } from "@/lib/beatbox";
import { starterAmbientState } from "@/lib/study-hall";
import { apiFetch } from "../lib/client";
import { deferred } from "./chat/shell/deferred";

const GestureSynth = deferred(() => import("./gesture-synth").then((m) => m.GestureSynth));
const BeatboxActivity = deferred(() => import("./beatbox-activity").then((m) => m.BeatboxActivity));
const StudyHallActivity = deferred(() => import("./study-hall-activity").then((m) => m.StudyHallActivity));

interface RoomActivitiesProps {
  channelId: string;
  channelName: string;
  userId: string;
  userName: string;
  activity: RoomActivity | null;
  onActivity: (activity: RoomActivity | null) => void;
  open: boolean;
  onOpen: (open: boolean) => void;
  /** The room's server added the Music Bot, which runs Watch and Reels Together. */
  musicBot?: boolean;
  /** The hub's clock, shared by everyone in the room (Study Hall keeps time by it). */
  serverNow?: () => number;
}

const ACTIVITY_CHOICES: Array<{
  kind: RoomActivityKind;
  icon: React.ReactNode;
  name: string;
  description: string;
}> = [
  {
    kind: "watch",
    icon: <Play size={20} />,
    name: "Watch Together",
    description: "Search YouTube or paste a link; everyone sees the same moment",
  },
  {
    kind: "reels",
    icon: <Smartphone size={20} />,
    name: "Reels Together",
    description: "Swipe Shorts as a group; the feed learns what you all like",
  },
  {
    kind: "whiteboard",
    icon: <PenTool size={20} />,
    name: "Whiteboard",
    description: "Sketch, plan, and doodle together",
  },
  {
    kind: "tierlist",
    icon: <Trophy size={20} />,
    name: "Tier List",
    description: "Rank anything as a group",
  },
  {
    kind: "drawguess",
    icon: <Palette size={20} />,
    name: "Draw & Guess",
    description: "Take turns drawing a secret prompt",
  },
  {
    kind: "timer",
    icon: <Timer size={20} />,
    name: "Synced Timer",
    description: "One countdown everyone sees",
  },
  {
    kind: "initiative",
    icon: <Dices size={20} />,
    name: "Initiative Tracker",
    description: "Roll, sort, and take turns in combat",
  },
  {
    kind: "deeppixel",
    icon: <Gamepad2 size={20} />,
    name: "DeepPixel",
    description: "Multiplayer property board game with bots",
  },
  {
    kind: "richup",
    icon: <Landmark size={20} />,
    name: "Richup",
    description: "Play Richup.io together in one shared room",
  },
  {
    kind: "synth",
    icon: <Hand size={20} />,
    name: "Gesture Synth",
    description: "Jam together: hand signs on camera play chords",
  },
  {
    kind: "beatbox",
    icon: <Drum size={20} />,
    name: "Hoffle Beatbox",
    description: "Build a beat together: drum machine and acid bassline",
  },
  {
    kind: "studyhall",
    icon: <BookOpen size={20} />,
    name: "Study Hall",
    description: "Rain, vinyl and lofi keys everyone hears in sync",
  },
];

const DRAW_COLORS = [
  "#f5f3ee",
  "#1e1f29",
  "#9b87f5",
  "#ef6b8f",
  "#f49a63",
  "#f1cf65",
  "#65d6a6",
  "#74a7f7",
];

function asStrokes(value: unknown): ActivityStroke[] {
  return Array.isArray(value) ? (value as ActivityStroke[]) : [];
}

function strokePoints(stroke: ActivityStroke): string {
  return stroke.points
    .reduce<string[]>((pairs, value, index) => {
      if (index % 2 === 0) pairs.push(`${value},${stroke.points[index + 1]}`);
      return pairs;
    }, [])
    .join(" ");
}

/**
 * Draws strokes in order. Each run of eraser strokes becomes a mask over
 * everything drawn before it, so erasing works on any background and ink
 * drawn afterwards still shows.
 */
function renderStrokes(strokes: ActivityStroke[], maskPrefix: string): ReactNode {
  const masks: ReactNode[] = [];
  let content: ReactNode[] = [];
  let index = 0;
  while (index < strokes.length) {
    const stroke = strokes[index];
    if (!stroke.erase) {
      content.push(
        <polyline
          key={stroke.id}
          points={strokePoints(stroke)}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />,
      );
      index += 1;
      continue;
    }
    const erasers: ActivityStroke[] = [];
    while (index < strokes.length && strokes[index].erase) {
      erasers.push(strokes[index]);
      index += 1;
    }
    const id = `${maskPrefix}-${masks.length}`;
    masks.push(
      <mask key={id} id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={1000} height={650}>
        <rect width="1000" height="650" fill="white" />
        {erasers.map((eraser) => (
          <polyline
            key={eraser.id}
            points={strokePoints(eraser)}
            fill="none"
            stroke="black"
            strokeWidth={eraser.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </mask>,
    );
    content = [
      <g key={id} mask={`url(#${id})`}>
        {content}
      </g>,
    ];
  }
  return (
    <>
      <defs>{masks}</defs>
      {content}
    </>
  );
}

/** Hoffle's theme tokens, handed to the bot's Watch/Reels pages so they look like the rest of the app. */
const THEME_TOKENS = [
  "--paper", "--panel", "--chat-bg", "--rail-bg", "--ink", "--muted", "--faint", "--line",
  "--lavender", "--lavender-soft", "--accent-strong", "--on-accent", "--coral", "--mint",
  "--ui-corners", "--font-ui",
];

function isLightColor(value: string) {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  let rgb: number[] | null = null;
  if (hex) {
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  } else {
    const match = value.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
    if (match) rgb = match.slice(1, 4).map(Number);
  }
  if (!rgb) return false;
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.55;
}

function themeMessage(from: Element) {
  const style = getComputedStyle(from);
  const vars: Record<string, string> = {};
  for (const name of THEME_TOKENS) vars[name] = style.getPropertyValue(name).trim();
  return { type: "hoffle-theme", vars, scheme: isLightColor(vars["--paper"] || "") ? "light" : "dark" };
}

/** A one-time link into this voice room's Watch or Reels room, for the member asking. */
async function togetherUrl(channelId: string, mode: "watch" | "reels") {
  const data = await apiFetch<{ url: string }>("/api/integrations/musicwatch", {
    method: "POST",
    body: JSON.stringify({ channelId, mode }),
  });
  return data.url;
}

/**
 * Watch Together / Reels Together, served by the Music + Watch bot. Each
 * member gets their own ticket, so the bot knows who they are (name, picture,
 * host or moderator) without asking; the page asks for Hoffle's theme when it
 * loads and for a new ticket if its session runs out.
 */
function TogetherFrame({ channelId, mode }: { channelId: string; mode: "watch" | "reels" }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const renewals = useRef<number[]>([]);

  useEffect(() => {
    let live = true;
    setUrl(null);
    setError("");
    togetherUrl(channelId, mode)
      .then((next) => {
        if (live) setUrl(next);
      })
      .catch((requestError) => {
        if (live) {
          setError(
            requestError instanceof Error ? requestError.message : `${BOT_ACTIVITY_NAMES[mode]} is unavailable.`,
          );
        }
      });
    return () => {
      live = false;
    };
  }, [channelId, mode, attempt]);

  useEffect(() => {
    if (!url) return;
    const origin = new URL(url, window.location.href).origin;
    const send = () => {
      const frame = frameRef.current;
      if (frame?.contentWindow) frame.contentWindow.postMessage(themeMessage(frame), origin);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return;
      const type = (event.data as { type?: string } | null)?.type;
      if (type === "hoffle-together:ready") send();
      if (type === "hoffle-together:expired") {
        // A fresh ticket, but not in a loop if the bot keeps refusing.
        const now = Date.now();
        renewals.current = renewals.current.filter((at) => now - at < 60_000);
        if (renewals.current.length < 3) {
          renewals.current.push(now);
          setAttempt((count) => count + 1);
        }
      }
    };
    window.addEventListener("message", onMessage);
    // Theme switches change the root's attributes, classes or inline tokens.
    const observer = new MutationObserver(send);
    observer.observe(document.documentElement, { attributes: true });
    return () => {
      window.removeEventListener("message", onMessage);
      observer.disconnect();
    };
  }, [url]);

  if (error) {
    return (
      <div className="together-embed together-problem">
        <Bot size={28} />
        <p>{error}</p>
        <button type="button" onClick={() => setAttempt((count) => count + 1)}>
          <RotateCcw size={14} /> Try again
        </button>
      </div>
    );
  }
  return (
    <div className={`watch-embed together-embed kind-${mode}`}>
      {url ? (
        <iframe
          ref={frameRef}
          key={url}
          src={url}
          title={BOT_ACTIVITY_NAMES[mode]}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          // The bot's page: it may run and play video, not navigate this window.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        />
      ) : (
        <div className="together-loading" role="status">
          <span className="together-spinner" aria-hidden="true" />
          Opening {BOT_ACTIVITY_NAMES[mode]}…
        </div>
      )}
    </div>
  );
}

/**
 * Everyone in the room opens the same game code; the first to arrive creates it.
 * `pid` is the Hoffle user id, so a reload or a second device takes back the same seat.
 */
function deepPixelUrl(gameId: string, name: string, userId: string) {
  const url = new URL(DEEPPIXEL_URL);
  url.searchParams.set("gameId", gameId);
  url.searchParams.set("name", name.slice(0, 20));
  url.searchParams.set("pid", userId);
  url.searchParams.set("create", "1");
  url.searchParams.set("embed", "1");
  return url.toString();
}

function activityTitle(kind: RoomActivityKind, state?: Record<string, unknown>) {
  if (kind === "app") return String(state?.title || "Activity");
  return ACTIVITY_CHOICES.find((choice) => choice.kind === kind)?.name || "Activity";
}

interface OfferedActivity {
  applicationId: string;
  name: string;
  title: string;
  description: string;
  icon: string;
  botName: string;
}

/** A page a bot offers. Each member gets their own one-time link when it opens. */
function AppFrame({ channelId, state }: { channelId: string; state: Record<string, unknown> }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const title = String(state.title || "Activity");
  useEffect(() => {
    let live = true;
    apiFetch<{ url: string }>("/api/bot-activities", {
      method: "POST",
      body: JSON.stringify({ channelId, applicationId: state.applicationId, name: state.name }),
    })
      .then((data) => {
        if (live) setUrl(data.url);
      })
      .catch((problem) => {
        if (live) setError(problem instanceof Error ? problem.message : "This activity is unavailable.");
      });
    return () => {
      live = false;
    };
  }, [channelId, state.applicationId, state.name]);
  if (error) {
    return (
      <div className="together-embed together-problem">
        <Bot size={28} />
        <p>{error}</p>
      </div>
    );
  }
  return (
    <div className="watch-embed together-embed">
      {url ? (
        <iframe
          key={url}
          src={url}
          title={title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          // A bot's page: it may run, not navigate this window.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        />
      ) : (
        <div className="together-loading" role="status">
          <span className="together-spinner" aria-hidden="true" />
          Opening {title}…
        </div>
      )}
    </div>
  );
}

async function postActivity(
  body: Record<string, unknown>,
): Promise<RoomActivity | null> {
  const data = await apiFetch<{ activity: RoomActivity | null }>("/api/activities", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.activity;
}

function ActivityCanvas({
  strokes,
  editable,
  onStroke,
  onClear,
  onUndo,
  canUndo,
}: {
  strokes: ActivityStroke[];
  editable: boolean;
  onStroke: (stroke: ActivityStroke) => void;
  onClear: () => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const surfaceRef = useRef<SVGSVGElement>(null);
  const activeRef = useRef<number[]>([]);
  const [preview, setPreview] = useState<number[]>([]);
  const [color, setColor] = useState("#9b87f5");
  const [width, setWidth] = useState(4);
  const [erasing, setErasing] = useState(false);
  const maskPrefix = `erase-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // The eraser is chunkier than the pen at the same slider position.
  const strokeWidth = erasing ? Math.min(60, width * 4) : width;

  // Ctrl/Cmd+Z undoes your last stroke, unless you're typing somewhere.
  const undoRef = useRef(onUndo);
  undoRef.current = onUndo;
  useEffect(() => {
    if (!editable || !canUndo) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey) return;
      if (event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      undoRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, canUndo]);

  function point(event: PointerEvent<SVGSVGElement>) {
    const svg = surfaceRef.current;
    if (!svg) return [0, 0];
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const p = pt.matrixTransform(ctm.inverse());
      return [
        Math.max(0, Math.min(1000, Math.round(p.x * 10) / 10)),
        Math.max(0, Math.min(650, Math.round(p.y * 10) / 10)),
      ];
    }
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return [0, 0];
    return [
      Math.max(0, Math.min(1000, ((event.clientX - rect.left) / rect.width) * 1000)),
      Math.max(0, Math.min(650, ((event.clientY - rect.top) / rect.height) * 650)),
    ];
  }

  function start(event: PointerEvent<SVGSVGElement>) {
    if (!editable) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = point(event);
    setPreview(activeRef.current);
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    if (!editable || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    activeRef.current = [...activeRef.current, ...point(event)].slice(-800);
    setPreview(activeRef.current);
  }

  function finish(event: PointerEvent<SVGSVGElement>) {
    if (!editable || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    let points = activeRef.current;
    activeRef.current = [];
    setPreview([]);
    if (points.length === 2) {
      points = [points[0], points[1], points[0] + 0.1, points[1] + 0.1];
    }
    if (points.length >= 4) {
      onStroke({
        id: crypto.randomUUID(),
        color,
        width: strokeWidth,
        points,
        ...(erasing ? { erase: true } : {}),
      });
    }
  }

  // While erasing, the in-progress stroke erases live.
  const shown =
    erasing && preview.length >= 4
      ? [...strokes, { id: "preview", color, width: strokeWidth, points: preview, erase: true }]
      : strokes;

  return (
    <div className="activity-canvas-shell">
      <div className="activity-draw-tools">
        <button
          type="button"
          className={`activity-eraser ${erasing ? "active" : ""}`}
          title="Eraser"
          aria-label="Eraser"
          aria-pressed={erasing}
          onClick={() => setErasing((on) => !on)}
        >
          <Eraser size={14} />
        </button>
        {DRAW_COLORS.map((option) => (
          <button
            type="button"
            key={option}
            className={!erasing && color === option ? "active" : ""}
            style={{ background: option }}
            title={`Draw with ${option}`}
            onClick={() => {
              setColor(option);
              setErasing(false);
            }}
          />
        ))}
        <input
          type="range"
          min={1}
          max={14}
          value={width}
          onChange={(event) => setWidth(Number(event.target.value))}
          aria-label="Brush size"
        />
        <button
          type="button"
          className="activity-tool-text activity-undo"
          disabled={!editable || !canUndo}
          onClick={onUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          className="activity-tool-text"
          disabled={!editable}
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <svg
        ref={surfaceRef}
        className={`activity-canvas ${editable ? "editable" : ""} ${erasing ? "erasing" : ""}`}
        viewBox="0 0 1000 650"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <defs>
          <pattern id="activityDots" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="2" fill="currentColor" opacity=".13" />
          </pattern>
        </defs>
        <rect width="1000" height="650" fill="url(#activityDots)" />
        {renderStrokes(shown, maskPrefix)}
        {erasing ? null : preview.length >= 4 ? (
          <polyline
            points={strokePoints({ id: "preview", color, width, points: preview })}
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : preview.length === 2 ? (
          <circle
            cx={preview[0]}
            cy={preview[1]}
            r={Math.max(1, width / 2)}
            fill={color}
          />
        ) : null}
      </svg>
    </div>
  );
}

function TierList({
  activity,
  update,
}: {
  activity: RoomActivity;
  update: (state: Record<string, unknown>) => void;
}) {
  const [newItem, setNewItem] = useState("");
  const title = String(activity.state.title || "Our tier list");
  const tiers = Array.isArray(activity.state.tiers)
    ? (activity.state.tiers as TierRow[])
    : DEFAULT_TIERS;
  const pool = Array.isArray(activity.state.pool)
    ? (activity.state.pool as string[])
    : [];

  function save(nextTiers: TierRow[], nextPool: string[]) {
    update({ title, tiers: nextTiers, pool: nextPool });
  }

  function addItem() {
    const item = newItem.trim();
    if (!item) return;
    save(tiers, [...pool, item]);
    setNewItem("");
  }

  function move(item: string, from: string, to: string) {
    const nextTiers = tiers.map((tier) => ({
      ...tier,
      items: tier.items.filter((entry) => !(tier.id === from && entry === item)),
    }));
    let nextPool = pool.filter((entry) => !(from === "pool" && entry === item));
    if (to === "pool") nextPool = [...nextPool, item];
    else {
      const target = nextTiers.find((tier) => tier.id === to);
      if (target) target.items = [...target.items, item];
    }
    save(nextTiers, nextPool);
  }

  const item = (name: string, from: string) => (
    <div className="tier-item" key={`${from}:${name}`}>
      <span>{name}</span>
      <select
        aria-label={`Move ${name}`}
        value={from}
        onChange={(event) => move(name, from, event.target.value)}
      >
        <option value="pool">Unranked</option>
        {tiers.map((tier) => (
          <option key={tier.id} value={tier.id}>
            {tier.label} tier
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="tier-board">
      <div className="tier-add">
        <input
          value={newItem}
          onChange={(event) => setNewItem(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addItem();
          }}
          placeholder="Add something to rank…"
          maxLength={80}
        />
        <button type="button" onClick={addItem}>
          Add
        </button>
      </div>
      <div className="tier-rows">
        {tiers.map((tier) => (
          <div className="tier-row" key={tier.id}>
            <strong style={{ background: tier.color }}>{tier.label}</strong>
            <div>{tier.items.map((name) => item(name, tier.id))}</div>
          </div>
        ))}
        <div className="tier-row tier-pool">
          <strong>?</strong>
          <div>
            {pool.length ? pool.map((name) => item(name, "pool")) : <small>Add items above</small>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SyncedTimer({
  activity,
  update,
}: {
  activity: RoomActivity;
  update: (state: Record<string, unknown>) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const state = activity.state;
  const running = Boolean(state.running);
  const endsAt = state.endsAt ? Number(state.endsAt) : null;
  const durationMs = Number(state.durationMs) || 5 * 60_000;
  const storedRemaining = Number(state.remainingMs) || durationMs;
  const remaining = running && endsAt ? Math.max(0, endsAt - now) : storedRemaining;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const finished = running && remaining <= 0;

  function startPause() {
    if (running) {
      update({
        ...state,
        running: false,
        endsAt: null,
        remainingMs: remaining,
      });
    } else {
      const nextRemaining = remaining > 0 ? remaining : durationMs;
      update({
        ...state,
        running: true,
        remainingMs: nextRemaining,
        endsAt: Date.now() + nextRemaining,
      });
    }
  }

  function setMinutes(value: number) {
    const next = Math.max(1, Math.min(180, value)) * 60_000;
    update({
      ...state,
      durationMs: next,
      remainingMs: next,
      running: false,
      endsAt: null,
    });
  }

  return (
    <div className={`synced-timer ${finished ? "finished" : ""}`}>
      <span className="timer-sparkle">
        {finished ? <PartyPopper size={18} /> : <Timer size={18} />}
      </span>
      <strong>
        {minutes}:{String(seconds).padStart(2, "0")}
      </strong>
      <small>{finished ? "Time’s up!" : String(state.label || "Room timer")}</small>
      <div>
        <button type="button" onClick={startPause}>
          {running ? "Pause" : remaining <= 0 ? "Restart" : "Start"}
        </button>
        <button
          type="button"
          onClick={() =>
            update({
              ...state,
              running: false,
              endsAt: null,
              remainingMs: durationMs,
            })
          }
        >
          Reset
        </button>
        <select
          aria-label="Timer length"
          value={Math.round(durationMs / 60_000)}
          disabled={running}
          onChange={(event) => setMinutes(Number(event.target.value))}
        >
          {[1, 3, 5, 10, 15, 25, 30, 45, 60].map((value) => (
            <option key={value} value={value}>
              {value} min
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function InitiativeTracker({
  activity,
  update,
}: {
  activity: RoomActivity;
  update: (state: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [score, setScore] = useState("");
  const [kind, setKind] = useState<"pc" | "npc">("pc");
  const entries = (Array.isArray(activity.state.entries)
    ? (activity.state.entries as InitiativeEntry[])
    : []
  ).slice();
  const round = Math.max(1, Number(activity.state.round) || 1);
  const turnIndex = Math.min(
    entries.length - 1,
    Math.max(0, Number(activity.state.turnIndex) || 0),
  );
  // Sort by score desc; ties broken by insertion order (stable sort).
  entries.sort((a, b) => b.score - a.score);
  const currentId = entries[turnIndex]?.id || null;

  function commit(next: InitiativeEntry[], nextRound = round, nextTurn = turnIndex) {
    update({ entries: next, round: nextRound, turnIndex: nextTurn });
  }

  function addEntry() {
    const trimmed = name.trim();
    const parsed = parseInt(score, 10);
    if (!trimmed) return;
    const entry: InitiativeEntry = {
      id: crypto.randomUUID(),
      name: trimmed,
      score: Number.isFinite(parsed) ? parsed : 0,
      kind,
    };
    commit([...entries, entry].sort((a, b) => b.score - a.score));
    setName("");
    setScore("");
  }

  function removeEntry(id: string) {
    const next = entries.filter((entry) => entry.id !== id);
    commit(next, round, Math.min(turnIndex, Math.max(0, next.length - 1)));
  }

  function nextTurn() {
    if (!entries.length) return;
    const last = entries.length - 1;
    if (turnIndex >= last) commit(entries, round + 1, 0);
    else commit(entries, round, turnIndex + 1);
  }

  function resetCombat() {
    commit([], 1, 0);
  }

  return (
    <div className="initiative-tracker">
      <div className="initiative-header">
        <span className="initiative-round">Round {round}</span>
        {currentId && (
          <span className="initiative-current">
            Now: {entries[turnIndex]?.name}
          </span>
        )}
      </div>

      <ol className="initiative-list">
        {entries.map((entry, index) => (
          <li
            key={entry.id}
            className={`${entry.id === currentId ? "active" : ""} ${entry.kind}`}
          >
            <span className="initiative-pos">{index + 1}</span>
            <span className="initiative-score">{entry.score}</span>
            <span className="initiative-name">{entry.name}</span>
            <span className="initiative-kind">
              {entry.kind === "pc" ? "PC" : "NPC"}
            </span>
            <button
              type="button"
              className="initiative-remove"
              aria-label={`Remove ${entry.name}`}
              onClick={() => removeEntry(entry.id)}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
        {!entries.length && (
          <li className="initiative-empty">
            Add combatants below — highest roll goes first.
          </li>
        )}
      </ol>

      <div className="initiative-add">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addEntry();
          }}
          placeholder="Name…"
          maxLength={60}
          aria-label="Combatant name"
        />
        <input
          value={score}
          onChange={(event) => setScore(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addEntry();
          }}
          placeholder="Init."
          inputMode="numeric"
          maxLength={6}
          aria-label="Initiative score"
        />
        <select
          aria-label="Combatant type"
          value={kind}
          onChange={(event) => setKind(event.target.value as "pc" | "npc")}
        >
          <option value="pc">PC</option>
          <option value="npc">NPC</option>
        </select>
        <button type="button" onClick={addEntry} aria-label="Add combatant">
          <Plus size={16} />
        </button>
      </div>

      <div className="initiative-actions">
        <button type="button" disabled={!entries.length} onClick={nextTurn}>
          <SkipForward size={15} /> Next turn
        </button>
        <button type="button" disabled={!entries.length} onClick={resetCombat}>
          <RotateCcw size={15} /> New combat
        </button>
      </div>
    </div>
  );
}

export function RoomActivities({
  channelId,
  channelName,
  userId,
  userName,
  activity,
  onActivity,
  open,
  onOpen,
  musicBot = true,
  serverNow,
}: RoomActivitiesProps) {
  const [busy, setBusy] = useState(false);
  const gameFrameRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [guess, setGuess] = useState("");
  const [richupDraft, setRichupDraft] = useState("");

  useEffect(() => {
    if (activity) onOpen(true);
  }, [activity?.kind]);

  // The living room's board hall plays DeepPixel from its own menu: relay between it and the game's iframe.
  const isDeepPixel = activity?.kind === "deeppixel";
  useEffect(() => {
    if (!isDeepPixel) return;
    const frame = () => gameFrameRef.current?.querySelector("iframe")?.contentWindow ?? null;
    const target = new URL(DEEPPIXEL_URL).origin;
    const fromGame = (event: MessageEvent) => {
      if (event.origin !== target || event.source !== frame()) return;
      const data = event.data as { source?: string } | null;
      if (data?.source !== "deeppixel") return;
      window.dispatchEvent(new CustomEvent(DEEPPIXEL_FROM_GAME, { detail: data }));
    };
    const toGame = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      frame()?.postMessage({ ...detail, source: "hoffle" }, target);
    };
    window.addEventListener("message", fromGame);
    window.addEventListener(DEEPPIXEL_TO_GAME, toGame);
    return () => {
      window.removeEventListener("message", fromGame);
      window.removeEventListener(DEEPPIXEL_TO_GAME, toGame);
    };
  }, [isDeepPixel]);

  /** Canvas callbacks shared by the whiteboard and Draw & Guess. */
  function drawProps(current: RoomActivity) {
    const strokes = asStrokes(current.state.strokes);
    let lastMine = -1;
    for (let index = strokes.length - 1; index >= 0; index -= 1) {
      if (strokes[index].by === userId) {
        lastMine = index;
        break;
      }
    }
    const replaceStrokes = (next: ActivityStroke[]) =>
      onActivity({
        ...current,
        state: { ...current.state, strokes: next },
        updatedAt: new Date().toISOString(),
      });
    return {
      strokes,
      canUndo: lastMine >= 0,
      onStroke: (stroke: ActivityStroke) => {
        const mine = { ...stroke, by: userId };
        replaceStrokes([...strokes, mine].slice(-400));
        void action({ action: "stroke", stroke: mine });
      },
      onUndo: () => {
        if (lastMine < 0) return;
        const target = strokes[lastMine];
        replaceStrokes(strokes.filter((_, index) => index !== lastMine));
        void action({ action: "undo", strokeId: target.id });
      },
      onClear: () => void action({ action: "clear" }),
    };
  }

  async function action(body: Record<string, unknown>) {
    try {
      setBusy(true);
      setError("");
      const next = await postActivity({ channelId, ...body });
      onActivity(next);
      return next;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "That activity failed.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  // Bots in this server can offer their own activities.
  const [offered, setOffered] = useState<OfferedActivity[]>([]);
  useEffect(() => {
    // No room (you just left): nothing to ask about.
    if (!open || activity || !channelId) return;
    let live = true;
    apiFetch<{ activities: OfferedActivity[] }>(`/api/bot-activities?${new URLSearchParams({ channelId })}`)
      .then((data) => {
        if (live) setOffered(data.activities);
      })
      .catch(() => {
        if (live) setOffered([]);
      });
    return () => {
      live = false;
    };
  }, [open, activity, channelId]);

  async function openActivity(kind: RoomActivityKind) {
    if (isBotActivity(kind)) {
      // Each member gets their own link when the frame opens (TogetherFrame).
      await action({ action: "open", kind, state: { title: BOT_ACTIVITY_NAMES[kind] } });
      return;
    }
    const state =
      kind === "whiteboard"
        ? { strokes: [] }
        : kind === "tierlist"
          ? { title: `${channelName} tier list`, tiers: DEFAULT_TIERS, pool: [] }
          : kind === "timer"
            ? {
                label: `${channelName} timer`,
                durationMs: 5 * 60_000,
                remainingMs: 5 * 60_000,
                endsAt: null,
                running: false,
              }
            : kind === "initiative"
              ? { round: 1, turnIndex: 0, entries: [] }
              : kind === "synth"
                ? { key: "A", mode: "major" }
                : kind === "beatbox"
                  ? { ...starterBeatboxState() }
                  : kind === "studyhall"
                    ? { ...starterAmbientState((serverNow ?? Date.now)()) }
                    : {};
    // deeppixel: the server picks the shared game code
    await action({ action: "open", kind, state });
  }

  function optimistic(nextState: Record<string, unknown>) {
    if (!activity) return;
    const next = {
      ...activity,
      state: nextState,
      updatedAt: new Date().toISOString(),
    };
    onActivity(next);
    void action({ action: "update", state: nextState });
  }

  // Embedded games stay mounted while collapsed so players don't drop out,
  // and so do the synth, the beatbox and the bot's watch parties, so collapsing
  // the panel doesn't cut your chord or beat off or drop you out of the film.
  const isGame = activity?.kind === "deeppixel" || activity?.kind === "richup";
  const botActivity = activity && isBotActivity(activity.kind) ? activity.kind : null;
  const appActivity = activity?.kind === "app" ? activity : null;
  const isMusic = activity?.kind === "synth" || activity?.kind === "beatbox" || activity?.kind === "studyhall";
  if (!open && !isGame && !botActivity && !appActivity && !isMusic) return null;

  async function popOut(mode: "watch" | "reels") {
    // Opened before the request so the browser treats it as the click's window.
    const win = window.open("", "_blank");
    try {
      const url = await togetherUrl(channelId, mode);
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else {
        window.open(url, "_blank", "noopener");
      }
    } catch (requestError) {
      win?.close();
      setError(requestError instanceof Error ? requestError.message : "That didn’t open.");
    }
  }

  const deepPixelSrc =
    activity?.kind === "deeppixel"
      ? deepPixelUrl(String(activity.state.gameId || ""), userName, userId)
      : "";
  const richupRoom = activity?.kind === "richup" ? String(activity.state.roomUrl || "") : "";
  const gameSrc =
    activity?.kind === "richup" ? richupRoom || RICHUP_URL : deepPixelSrc;

  function shareRichupRoom() {
    const roomUrl = richupRoomUrl(richupDraft);
    if (!roomUrl) {
      setError("Paste a Richup room link, like richup.io/room/qv62k");
      return;
    }
    setRichupDraft("");
    optimistic({ roomUrl });
  }

  return (
    <section
      className={`room-activity ${activity ? `kind-${activity.kind}` : ""}`}
      style={open ? undefined : { display: "none" }}
    >
      <header className="room-activity-head">
        <div>
          <span>
            {activity
              ? ACTIVITY_CHOICES.find((item) => item.kind === activity.kind)?.icon
              : <Gamepad2 size={18} />}
          </span>
          <div>
            <strong>{activity ? activityTitle(activity.kind, activity.state) : "Room Activities"}</strong>
            <small>
              {activity
                ? `Shared live in ${channelName}`
                : "Pick something to do together"}
            </small>
          </div>
        </div>
        <div>
          {isGame && (
            <button
              type="button"
              onClick={() => void toggleElementFullscreen(gameFrameRef.current)}
              aria-label="Play full screen"
              title="Full screen"
            >
              <Maximize2 size={15} />
            </button>
          )}
          {isGame && (
            <a href={gameSrc} target="_blank" rel="noreferrer">
              Pop out <ExternalLink size={12} />
            </a>
          )}
          {botActivity && (
            <button type="button" onClick={() => void popOut(botActivity)} title="Open in its own tab">
              Pop out <ExternalLink size={12} />
            </button>
          )}
          {activity && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => void action({ action: "close" })}
            >
              End
            </button>
          )}
          <button type="button" onClick={() => onOpen(false)} aria-label="Collapse activity">
            <ChevronDown size={16} />
          </button>
        </div>
      </header>

      {!activity ? (
        <div className="activity-picker">
          {ACTIVITY_CHOICES.map((choice) => {
            const needsBot = isBotActivity(choice.kind) && !musicBot;
            return (
              <button
                type="button"
                key={choice.kind}
                disabled={busy || needsBot}
                className={isBotActivity(choice.kind) ? "bot-activity" : undefined}
                title={needsBot ? "Add the Music Bot in Server Settings → Integrations" : undefined}
                onClick={() => void openActivity(choice.kind)}
              >
                <span>{choice.icon}</span>
                <strong>{choice.name}</strong>
                <small>
                  {needsBot ? "Needs the Music Bot: add it in Server Settings → Integrations" : choice.description}
                </small>
                {isBotActivity(choice.kind) && (
                  <em className="activity-bot-tag">
                    <Bot size={11} /> Music Bot
                  </em>
                )}
              </button>
            );
          })}
          {offered.map((choice) => (
            <button
              type="button"
              key={`${choice.applicationId}:${choice.name}`}
              disabled={busy}
              className="bot-activity"
              onClick={() => void action({ action: "open", kind: "app", state: { applicationId: choice.applicationId, name: choice.name } })}
            >
              <span>{choice.icon}</span>
              <strong>{choice.title}</strong>
              <small>{choice.description}</small>
              <em className="activity-bot-tag">
                <Bot size={11} /> {choice.botName}
              </em>
            </button>
          ))}
        </div>
      ) : appActivity ? (
        <AppFrame key={`${channelId}:${String(appActivity.state.applicationId)}:${String(appActivity.state.name)}`} channelId={channelId} state={appActivity.state} />
      ) : botActivity ? (
        <TogetherFrame key={`${channelId}:${botActivity}`} channelId={channelId} mode={botActivity} />
      ) : isGame ? (
        <div className="watch-embed deeppixel-embed" ref={gameFrameRef}>
          {activity.kind === "richup" && (
            <form
              className="richup-room-bar"
              onSubmit={(event) => {
                event.preventDefault();
                shareRichupRoom();
              }}
            >
              <span>
                {richupRoom
                  ? `Room ${richupRoom.split("/").pop()} is shared with everyone here`
                  : "Create a room below, then paste its invite link so everyone joins it"}
              </span>
              <input
                value={richupDraft}
                onChange={(event) => setRichupDraft(event.target.value)}
                placeholder={richupRoom ? "Switch to another room link…" : "richup.io/room/…"}
                maxLength={120}
              />
              <button type="submit" disabled={!richupDraft.trim()}>
                {richupRoom ? "Switch" : "Share"}
              </button>
            </form>
          )}
          <iframe
            key={gameSrc}
            src={gameSrc}
            title={activityTitle(activity.kind, activity.state)}
            allow="autoplay; fullscreen; clipboard-write; screen-wake-lock"
            allowFullScreen
          />
        </div>
      ) : activity.kind === "whiteboard" ? (
        <ActivityCanvas editable {...drawProps(activity)} />
      ) : activity.kind === "tierlist" ? (
        <TierList activity={activity} update={optimistic} />
      ) : activity.kind === "timer" ? (
        <SyncedTimer activity={activity} update={optimistic} />
      ) : activity.kind === "initiative" ? (
        <InitiativeTracker activity={activity} update={optimistic} />
      ) : activity.kind === "synth" ? (
        <GestureSynth
          activity={activity}
          update={optimistic}
          joined={Boolean(channelId) && activity.channelId === channelId}
        />
      ) : activity.kind === "beatbox" ? (
        <BeatboxActivity activity={activity} update={optimistic} />
      ) : activity.kind === "studyhall" ? (
        <StudyHallActivity activity={activity} update={optimistic} serverNow={serverNow} />
      ) : (
        <div className="draw-guess">
          <div className="draw-guess-status">
            <span>Round {Number(activity.state.round) || 1}</span>
            <strong>
              {activity.state.winner
                ? `${activity.state.winner} got it — ${activity.state.reveal}!`
                : activity.state.drawerId === userId
                  ? `Draw: ${String(activity.state.word || "loading…")}`
                  : `${String(activity.state.drawerName || "Someone")} is drawing · ${String(activity.state.masked || "")}`}
            </strong>
            <button
              type="button"
              disabled={busy}
              onClick={() => void action({ action: "next" })}
            >
              I’ll draw next
            </button>
          </div>
          <div className="draw-guess-body">
            <ActivityCanvas
              editable={activity.state.drawerId === userId}
              {...drawProps(activity)}
            />
            <aside>
              <div className="guess-feed">
                {(Array.isArray(activity.state.guesses)
                  ? (activity.state.guesses as Array<{
                      id: string;
                      name: string;
                      text: string;
                      correct: boolean;
                    }>)
                  : []
                ).map((entry) => (
                  <p className={entry.correct ? "correct" : ""} key={entry.id}>
                    <strong>{entry.name}</strong> {entry.text}
                  </p>
                ))}
              </div>
              {activity.state.drawerId !== userId && !activity.state.winner && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = guess.trim();
                    if (!value) return;
                    setGuess("");
                    void action({ action: "guess", guess: value });
                  }}
                >
                  <input
                    value={guess}
                    onChange={(event) => setGuess(event.target.value)}
                    placeholder="Your guess…"
                    maxLength={60}
                  />
                  <button type="submit">Guess</button>
                </form>
              )}
            </aside>
          </div>
        </div>
      )}

      {error && <button className="activity-error" onClick={() => setError("")}>{error} ×</button>}
      {/* Only once something is running: the picker alone is not live. */}
      {activity && <span className="activity-live-pill">● LIVE</span>}
      {activity && <span className="activity-by">Started by {activity.createdByName || userName}</span>}
    </section>
  );
}
