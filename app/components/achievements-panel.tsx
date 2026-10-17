"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pin, PinOff, Play, Volume2, VolumeX, X } from "lucide-react";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  SHOWCASE_LIMIT,
  TIER_LABELS,
  getAchievement,
  type AchievementCategory,
  type AchievementDef,
} from "@/lib/achievement-defs";
import { apiFetch } from "../lib/client";
import { announceUnlocked, formatAchievementValue, previewAchievement, SHOWCASE_CHANGED_EVENT, TIER_POINTS, type AchievementsTarget } from "../lib/achievement-client";
import { AchievementMedal } from "./achievement-medal";
import { achievementSoundEnabled, setAchievementSoundEnabled } from "./achievement-toast";
import { showToast } from "./toast";

interface Row {
  id: string;
  earned: boolean;
  earnedAt: string | null;
  current: number;
  threshold: number;
  progress: number;
}

interface OwnBoard {
  achievements: Row[];
  newlyEarned: string[];
  rarity: Record<string, number>;
  showcase: string[];
}

interface OtherBoard {
  earned: Array<{ id: string; earnedAt: string }>;
  rarity: Record<string, number>;
}

type Filter = "all" | "earned" | "locked";

function rarityText(share: number | undefined): string {
  if (share === undefined || share <= 0) return "Nobody has this yet";
  const pct = share * 100;
  if (pct < 1) return "Under 1% of members";
  return `${Math.round(pct)}% of members`;
}

function rarityClass(share: number | undefined): string {
  if (share === undefined || share < 0.05) return "is-mythic";
  if (share < 0.15) return "is-rare";
  return "";
}

/**
 * The achievement board. With `target` it shows someone else's earned
 * achievements; without, your own progress and profile showcase.
 */
export function AchievementsBoard({
  target = null,
  onClose,
}: {
  target?: AchievementsTarget | null;
  onClose?: () => void;
}) {
  const viewingOther = Boolean(target);
  const targetId = target?.userId ?? null;
  const [rows, setRows] = useState<Map<string, Row>>(new Map());
  const [rarity, setRarity] = useState<Record<string, number>>({});
  const [showcase, setShowcase] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<AchievementCategory | "all">("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [sound, setSound] = useState(achievementSoundEnabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        if (targetId) {
          const data = await apiFetch<OtherBoard>(`/api/achievements?user=${encodeURIComponent(targetId)}`);
          if (cancelled) return;
          const map = new Map<string, Row>();
          for (const e of data.earned || []) {
            map.set(e.id, { id: e.id, earned: true, earnedAt: e.earnedAt, current: 0, threshold: 0, progress: 1 });
          }
          setRows(map);
          setRarity(data.rarity || {});
        } else {
          const data = await apiFetch<OwnBoard>("/api/achievements");
          if (cancelled) return;
          setRows(new Map((data.achievements || []).map((r) => [r.id, r])));
          setRarity(data.rarity || {});
          setShowcase(data.showcase || []);
          announceUnlocked(data.newlyEarned);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load achievements.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  const earnedCount = useMemo(() => [...rows.values()].filter((r) => r.earned).length, [rows]);
  const points = useMemo(
    () =>
      [...rows.values()]
        .filter((r) => r.earned)
        .reduce((sum, r) => sum + (TIER_POINTS[getAchievement(r.id)?.tier || "bronze"] || 0), 0),
    [rows],
  );
  const maxPoints = useMemo(() => ACHIEVEMENTS.reduce((sum, d) => sum + TIER_POINTS[d.tier], 0), []);

  const visible = useMemo(() => {
    const list = ACHIEVEMENTS.filter((def) => {
      if (category !== "all" && def.category !== category) return false;
      const earned = rows.get(def.id)?.earned ?? false;
      if (filter === "earned" && !earned) return false;
      if (filter === "locked" && earned) return false;
      return true;
    });
    // Earned first (newest first), then the closest to unlocking.
    return list.sort((a, b) => {
      const ra = rows.get(a.id);
      const rb = rows.get(b.id);
      if (Boolean(ra?.earned) !== Boolean(rb?.earned)) return ra?.earned ? -1 : 1;
      if (ra?.earned && rb?.earned) return String(rb.earnedAt).localeCompare(String(ra.earnedAt));
      if (viewingOther) return 0;
      // Secrets sink to the bottom while locked.
      if (Boolean(a.secret) !== Boolean(b.secret)) return a.secret ? 1 : -1;
      return (rb?.progress ?? 0) - (ra?.progress ?? 0);
    });
  }, [category, filter, rows, viewingOther]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, { earned: number; total: number }>();
    for (const def of ACHIEVEMENTS) {
      const entry = counts.get(def.category) || { earned: 0, total: 0 };
      entry.total += 1;
      if (rows.get(def.id)?.earned) entry.earned += 1;
      counts.set(def.category, entry);
    }
    return counts;
  }, [rows]);

  const saveShowcase = useCallback(async (next: string[]) => {
    setSaving(true);
    const previous = showcase;
    setShowcase(next);
    try {
      const res = await apiFetch<{ showcase: string[] }>("/api/achievements", {
        method: "PUT",
        body: JSON.stringify({ showcase: next }),
      });
      setShowcase(res.showcase || []);
      window.dispatchEvent(new CustomEvent(SHOWCASE_CHANGED_EVENT, { detail: res.showcase || [] }));
      // Show-off unlocks the first time something is pinned.
      if (!previous.length && next.length) {
        void apiFetch<OwnBoard>("/api/achievements").then((data) => announceUnlocked(data.newlyEarned)).catch(() => undefined);
      }
    } catch (cause) {
      setShowcase(previous);
      showToast(cause instanceof Error ? cause.message : "Could not update your profile.", "warning");
    } finally {
      setSaving(false);
    }
  }, [showcase]);

  const togglePin = (id: string) => {
    if (saving) return;
    if (showcase.includes(id)) void saveShowcase(showcase.filter((x) => x !== id));
    else if (showcase.length < SHOWCASE_LIMIT) void saveShowcase([...showcase, id]);
    else showToast(`You can pin up to ${SHOWCASE_LIMIT}. Unpin one first.`, "warning");
  };

  const pct = ACHIEVEMENTS.length ? earnedCount / ACHIEVEMENTS.length : 0;

  return (
    <div className="ach-board">
      <header className="ach-board-head">
        <div
          className="ach-ring"
          style={{ "--ach-pct": `${Math.round(pct * 360)}deg` } as React.CSSProperties}
          aria-label={`${earnedCount} of ${ACHIEVEMENTS.length} earned`}
        >
          <span>
            <strong>{earnedCount}</strong>
            <small>/{ACHIEVEMENTS.length}</small>
          </span>
        </div>
        <div className="ach-board-title">
          <h2>{target ? `${target.name}'s achievements` : "Achievements"}</h2>
          <p>
            <span className="ach-points">{points.toLocaleString()} pts</span>
            <span className="ach-dot">·</span>
            {Math.round(pct * 100)}% complete
            {!viewingOther && maxPoints ? <span className="ach-muted"> · {maxPoints.toLocaleString()} possible</span> : null}
          </p>
        </div>
        <button
          type="button"
          className="ach-play-btn"
          onClick={() => {
            // The newest earned one, or a sample when nothing is earned yet.
            const newest = [...rows.values()]
              .filter((r) => r.earned)
              .sort((a, b) => String(b.earnedAt).localeCompare(String(a.earnedAt)))[0];
            previewAchievement(newest?.id || "first-steps");
          }}
          title="Play this theme's unlock animation"
        >
          <Play size={14} fill="currentColor" /> <span>Play animation</span>
        </button>
        {!viewingOther && (
          <button
            type="button"
            className="ach-icon-btn"
            onClick={() => {
              setAchievementSoundEnabled(!sound);
              setSound(!sound);
            }}
            title={sound ? "Unlock sounds on" : "Unlock sounds off"}
            aria-label={sound ? "Turn unlock sounds off" : "Turn unlock sounds on"}
          >
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        )}
        {onClose && (
          <button type="button" className="ach-icon-btn" onClick={onClose} aria-label="Close achievements">
            <X size={18} />
          </button>
        )}
      </header>

      {!viewingOther && (
        <section className="ach-showcase" aria-label="Shown on your profile">
          <div className="ach-showcase-label">
            <Pin size={12} /> On your profile
            <span className="ach-muted"> · pin up to {SHOWCASE_LIMIT} earned achievements</span>
          </div>
          <div className="ach-showcase-slots">
            {Array.from({ length: SHOWCASE_LIMIT }, (_, i) => {
              const def = showcase[i] ? getAchievement(showcase[i]) : undefined;
              return def ? (
                <button
                  key={def.id}
                  type="button"
                  className="ach-slot is-filled"
                  title={`${def.label}: click to unpin`}
                  onClick={() => togglePin(def.id)}
                >
                  <AchievementMedal def={def} size={38} />
                </button>
              ) : (
                <span key={`empty-${i}`} className="ach-slot" aria-hidden="true" />
              );
            })}
          </div>
        </section>
      )}

      <nav className="ach-tabs" aria-label="Categories">
        <button type="button" className={category === "all" ? "is-active" : ""} onClick={() => setCategory("all")}>
          All <span>{earnedCount}/{ACHIEVEMENTS.length}</span>
        </button>
        {ACHIEVEMENT_CATEGORIES.map((c) => {
          const n = categoryCounts.get(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={category === c.id ? "is-active" : ""}
              onClick={() => setCategory(c.id)}
            >
              {c.label} <span>{n ? `${n.earned}/${n.total}` : ""}</span>
            </button>
          );
        })}
      </nav>
      <div className="ach-filters" role="radiogroup" aria-label="Show">
        {(["all", "earned", "locked"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            className={filter === f ? "is-active" : ""}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Everything" : f === "earned" ? "Earned" : "Still to get"}
          </button>
        ))}
      </div>

      <div className="ach-grid">
        {loading && <p className="ach-muted ach-empty">Loading…</p>}
        {!loading && error && <p className="ach-error ach-empty">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <p className="ach-muted ach-empty">Nothing here yet.</p>
        )}
        {!loading && !error && visible.map((def) => (
          <AchievementCard
            key={def.id}
            def={def}
            row={rows.get(def.id)}
            rarity={rarity[def.id]}
            viewingOther={viewingOther}
            pinned={showcase.includes(def.id)}
            canPin={!viewingOther && (showcase.includes(def.id) || showcase.length < SHOWCASE_LIMIT)}
            onTogglePin={() => togglePin(def.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AchievementCard({
  def,
  row,
  rarity,
  viewingOther,
  pinned,
  canPin,
  onTogglePin,
}: {
  def: AchievementDef;
  row: Row | undefined;
  rarity: number | undefined;
  viewingOther: boolean;
  pinned: boolean;
  canPin: boolean;
  onTogglePin: () => void;
}) {
  const earned = Boolean(row?.earned);
  const hidden = !earned && def.secret;
  return (
    <article className={`ach-card ach-tier-${def.tier}${earned ? " is-earned" : " is-locked"}${hidden ? " is-secret" : ""}`}>
      <AchievementMedal def={def} earned={earned} size={46} />
      <div className="ach-card-body">
        <div className="ach-card-top">
          <h3>{hidden ? "Secret achievement" : def.label}</h3>
          <span className={`ach-tier-chip ach-tier-${def.tier}`}>{TIER_LABELS[def.tier]}</span>
        </div>
        <p className="ach-card-desc">{hidden ? def.hint || "Keep exploring…" : def.description}</p>
        {!earned && !viewingOther && !hidden && row && (
          <div className="ach-progress">
            <div className="ach-bar">
              <span style={{ width: `${Math.round(row.progress * 100)}%` }} />
            </div>
            <span className="ach-progress-text">
              {formatAchievementValue(def.condition.type, Math.min(row.current, row.threshold))} / {formatAchievementValue(def.condition.type, row.threshold)}
            </span>
          </div>
        )}
        <div className="ach-card-meta">
          {earned && row?.earnedAt && <span>Earned {new Date(row.earnedAt).toLocaleDateString()}</span>}
          {!hidden && <span className={`ach-rarity ${rarityClass(rarity)}`}>{rarityText(rarity)}</span>}
        </div>
      </div>
      {earned && (
        <button
          type="button"
          className={`ach-play${viewingOther ? " is-alone" : ""}`}
          onClick={() => previewAchievement(def.id)}
          title="Play the unlock animation"
          aria-label={`Play the unlock animation for ${def.label}`}
        >
          <Play size={13} fill="currentColor" />
        </button>
      )}
      {earned && !viewingOther && (
        <button
          type="button"
          className={`ach-pin${pinned ? " is-pinned" : ""}`}
          onClick={onTogglePin}
          disabled={!canPin}
          title={pinned ? "Remove from your profile" : canPin ? "Show on your profile" : `Profile showcase is full (${SHOWCASE_LIMIT})`}
          aria-pressed={pinned}
        >
          {pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
      )}
    </article>
  );
}

/** The board as a modal over the chat. */
export function AchievementsModal({
  target,
  onClose,
}: {
  target: AchievementsTarget | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="ach-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ach-modal" role="dialog" aria-modal="true" aria-label="Achievements">
        <AchievementsBoard target={target} onClose={onClose} />
      </div>
    </div>
  );
}
