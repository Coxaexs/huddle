"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  DEFAULT_TIERS,
  type ActivityStroke,
  type RoomActivity,
  type RoomActivityKind,
  type TierRow,
} from "@/lib/activities";
import { apiFetch } from "../lib/client";

interface RoomActivitiesProps {
  channelId: string;
  channelName: string;
  userId: string;
  userName: string;
  activity: RoomActivity | null;
  onActivity: (activity: RoomActivity | null) => void;
  open: boolean;
  onOpen: (open: boolean) => void;
}

const ACTIVITY_CHOICES: Array<{
  kind: RoomActivityKind;
  icon: string;
  name: string;
  description: string;
}> = [
  {
    kind: "watch",
    icon: "🍿",
    name: "Watch Together",
    description: "The bot’s synced player, right inside this room",
  },
  {
    kind: "whiteboard",
    icon: "🖍️",
    name: "Whiteboard",
    description: "Sketch, plan, and doodle together",
  },
  {
    kind: "tierlist",
    icon: "🏆",
    name: "Tier List",
    description: "Rank anything as a group",
  },
  {
    kind: "drawguess",
    icon: "🎨",
    name: "Draw & Guess",
    description: "Take turns drawing a secret prompt",
  },
  {
    kind: "timer",
    icon: "⏱️",
    name: "Synced Timer",
    description: "One countdown everyone sees",
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

function embeddedWatchUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.searchParams.set("embed", "1");
    return url.toString();
  } catch {
    return raw;
  }
}

function activityTitle(kind: RoomActivityKind) {
  return ACTIVITY_CHOICES.find((choice) => choice.kind === kind)?.name || "Activity";
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
}: {
  strokes: ActivityStroke[];
  editable: boolean;
  onStroke: (stroke: ActivityStroke) => void;
  onClear: () => void;
}) {
  const surfaceRef = useRef<SVGSVGElement>(null);
  const activeRef = useRef<number[]>([]);
  const [preview, setPreview] = useState<number[]>([]);
  const [color, setColor] = useState("#9b87f5");
  const [width, setWidth] = useState(4);

  function point(event: PointerEvent<SVGSVGElement>) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    return [
      Math.max(0, Math.min(1000, ((event.clientX - rect.left) / rect.width) * 1000)),
      Math.max(0, Math.min(1000, ((event.clientY - rect.top) / rect.height) * 1000)),
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
    const points = activeRef.current;
    activeRef.current = [];
    setPreview([]);
    if (points.length >= 4) {
      onStroke({
        id: crypto.randomUUID(),
        color,
        width,
        points,
      });
    }
  }

  const polyline = (stroke: ActivityStroke) =>
    stroke.points
      .reduce<string[]>((pairs, value, index) => {
        if (index % 2 === 0) pairs.push(`${value},${stroke.points[index + 1]}`);
        return pairs;
      }, [])
      .join(" ");

  return (
    <div className="activity-canvas-shell">
      <div className="activity-draw-tools">
        {DRAW_COLORS.map((option) => (
          <button
            type="button"
            key={option}
            className={color === option ? "active" : ""}
            style={{ background: option }}
            title={`Draw with ${option}`}
            onClick={() => setColor(option)}
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
          className="activity-tool-text"
          disabled={!editable}
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <svg
        ref={surfaceRef}
        className={`activity-canvas ${editable ? "editable" : ""}`}
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
        {strokes.map((stroke) => (
          <polyline
            key={stroke.id}
            points={polyline(stroke)}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {preview.length >= 4 && (
          <polyline
            points={polyline({ id: "preview", color, width, points: preview })}
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
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
      <span className="timer-sparkle">{finished ? "🎉" : "⏱️"}</span>
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

export function RoomActivities({
  channelId,
  channelName,
  userId,
  userName,
  activity,
  onActivity,
  open,
  onOpen,
}: RoomActivitiesProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guess, setGuess] = useState("");

  useEffect(() => {
    if (activity) onOpen(true);
  }, [activity?.kind]);

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

  async function openActivity(kind: RoomActivityKind) {
    if (kind === "watch") {
      try {
        setBusy(true);
        setError("");
        const room = await apiFetch<{ url: string }>("/api/integrations/musicwatch", {
          method: "POST",
          body: JSON.stringify({
            mode: "watch",
            name: `${channelName} · Huddle`,
          }),
        });
        const next = await postActivity({
          channelId,
          action: "open",
          kind,
          state: { url: room.url, title: `${channelName} Watch Party` },
        });
        onActivity(next);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Watch Together is unavailable.",
        );
      } finally {
        setBusy(false);
      }
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
            : {};
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

  if (!open) return null;

  return (
    <section className={`room-activity ${activity ? `kind-${activity.kind}` : ""}`}>
      <header className="room-activity-head">
        <div>
          <span>{activity ? ACTIVITY_CHOICES.find((item) => item.kind === activity.kind)?.icon : "✨"}</span>
          <div>
            <strong>{activity ? activityTitle(activity.kind) : "Room Activities"}</strong>
            <small>
              {activity
                ? `Shared live in ${channelName}`
                : "Pick something to do together"}
            </small>
          </div>
        </div>
        <div>
          {activity?.kind === "watch" && (
            <a
              href={String(activity.state.url || "")}
              target="_blank"
              rel="noreferrer"
            >
              Pop out ↗
            </a>
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
            ˅
          </button>
        </div>
      </header>

      {!activity ? (
        <div className="activity-picker">
          {ACTIVITY_CHOICES.map((choice) => (
            <button
              type="button"
              key={choice.kind}
              disabled={busy}
              onClick={() => void openActivity(choice.kind)}
            >
              <span>{choice.icon}</span>
              <strong>{choice.name}</strong>
              <small>{choice.description}</small>
            </button>
          ))}
        </div>
      ) : activity.kind === "watch" ? (
        <div className="watch-embed">
          <iframe
            src={embeddedWatchUrl(String(activity.state.url || ""))}
            title="Watch Together"
            allow="autoplay; fullscreen; clipboard-write"
          />
        </div>
      ) : activity.kind === "whiteboard" ? (
        <ActivityCanvas
          strokes={asStrokes(activity.state.strokes)}
          editable
          onStroke={(stroke) => {
            const strokes = [...asStrokes(activity.state.strokes), stroke].slice(-400);
            onActivity({
              ...activity,
              state: { strokes },
              updatedAt: new Date().toISOString(),
            });
            void action({ action: "stroke", stroke });
          }}
          onClear={() => void action({ action: "clear" })}
        />
      ) : activity.kind === "tierlist" ? (
        <TierList activity={activity} update={optimistic} />
      ) : activity.kind === "timer" ? (
        <SyncedTimer activity={activity} update={optimistic} />
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
              strokes={asStrokes(activity.state.strokes)}
              editable={activity.state.drawerId === userId}
              onStroke={(stroke) => {
                const strokes = [...asStrokes(activity.state.strokes), stroke].slice(-400);
                onActivity({
                  ...activity,
                  state: { ...activity.state, strokes },
                  updatedAt: new Date().toISOString(),
                });
                void action({ action: "stroke", stroke });
              }}
              onClear={() => void action({ action: "clear" })}
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
      <span className="activity-live-pill">● LIVE</span>
      <span className="activity-by">Started by {activity?.createdByName || userName}</span>
    </section>
  );
}
