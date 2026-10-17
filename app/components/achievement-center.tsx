"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAchievement, type AchievementDef } from "@/lib/achievement-defs";
import { apiFetch } from "../lib/client";
import {
  ACHIEVEMENTS_UNLOCKED_EVENT,
  OPEN_ACHIEVEMENTS_EVENT,
  PREVIEW_ACHIEVEMENT_EVENT,
  announceUnlocked,
  markAchievement,
  setAchievementUser,
  type AchievementsTarget,
} from "../lib/achievement-client";
import { AchievementToast } from "./achievement-toast";
import { AchievementsModal } from "./achievements-panel";

/** How often the full board is re-checked (voice time, friends, anniversaries…). */
const POLL_MS = 10 * 60 * 1000;
/** At most this many popups per batch of unlocks; the rest are "+N more". */
const BURST = 3;
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

/**
 * Owns the unlock popups and the achievements board for the signed-in
 * member. Unlocks arrive from the hub socket, API responses, or the periodic
 * re-check; all go through `announceUnlocked`.
 */
export function AchievementCenter({ userId }: { userId: string | null }) {
  const [queue, setQueue] = useState<AchievementDef[]>([]);
  /** Unlocks counted in "+N more" but not given a popup of their own. */
  const [overflow, setOverflow] = useState(0);
  /** Bumped by each preview so the same popup can be replayed back to back. */
  const [previewKey, setPreviewKey] = useState(0);
  const [board, setBoard] = useState<{ target: AchievementsTarget | null } | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    setAchievementUser(userId);
  }, [userId]);

  // Unlock events → popup queue (each id once per tab).
  useEffect(() => {
    const onUnlocked = (event: Event) => {
      const ids = (event as CustomEvent<string[]>).detail || [];
      const fresh = ids.filter((id) => !seen.current.has(id));
      if (!fresh.length) return;
      for (const id of fresh) seen.current.add(id);
      const defs = fresh.map((id) => getAchievement(id)).filter((d): d is AchievementDef => Boolean(d));
      // Rarest first, so the best news is the one that shows.
      const order = { platinum: 0, gold: 1, silver: 2, bronze: 3 } as const;
      defs.sort((a, b) => order[a.tier] - order[b.tier]);
      // A big batch (first visit after a long time) shows the best few only.
      setQueue((current) => [...current, ...defs.slice(0, BURST)]);
      if (defs.length > BURST) setOverflow((n) => n + defs.length - BURST);
    };
    const onOpen = (event: Event) => {
      const target = (event as CustomEvent<AchievementsTarget | null>).detail;
      setBoard({ target: target && target.userId !== userId ? target : null });
    };
    // A preview jumps the queue and replays even an already-seen unlock.
    const onPreview = (event: Event) => {
      const def = getAchievement((event as CustomEvent<string>).detail);
      if (!def) return;
      setOverflow(0);
      setQueue([{ ...def }]);
      setPreviewKey((n) => n + 1);
    };
    window.addEventListener(ACHIEVEMENTS_UNLOCKED_EVENT, onUnlocked);
    window.addEventListener(OPEN_ACHIEVEMENTS_EVENT, onOpen);
    window.addEventListener(PREVIEW_ACHIEVEMENT_EVENT, onPreview);
    return () => {
      window.removeEventListener(PREVIEW_ACHIEVEMENT_EVENT, onPreview);
      window.removeEventListener(ACHIEVEMENTS_UNLOCKED_EVENT, onUnlocked);
      window.removeEventListener(OPEN_ACHIEVEMENTS_EVENT, onOpen);
    };
  }, [userId]);

  // Periodic full check, so voice time, friends and account age unlock too.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const check = () => {
      if (document.visibilityState === "hidden") return;
      void apiFetch<{ newlyEarned?: string[] }>("/api/achievements")
        .then((res) => {
          if (!cancelled) announceUnlocked(res?.newlyEarned);
        })
        .catch(() => undefined);
    };
    const first = window.setTimeout(check, 6000);
    const timer = window.setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [userId]);

  // Themes tried: watch the live theme on <html>.
  useEffect(() => {
    if (!userId) return;
    const root = document.documentElement;
    let last = "";
    const report = () => {
      const id = root.dataset.customThemeId || "";
      if (!id || id === last) return;
      last = id;
      markAchievement("theme", id);
    };
    const settle = window.setTimeout(report, 3000);
    const observer = new MutationObserver(() => report());
    observer.observe(root, { attributes: true, attributeFilter: ["data-custom-theme-id"] });
    return () => {
      window.clearTimeout(settle);
      observer.disconnect();
    };
  }, [userId]);

  // ↑ ↑ ↓ ↓ ← → ← → B A
  useEffect(() => {
    if (!userId) return;
    let at = 0;
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      at = key === KONAMI[at] ? at + 1 : key === KONAMI[0] ? 1 : 0;
      if (at === KONAMI.length) {
        at = 0;
        markAchievement("secret", "konami");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userId]);

  const next = useCallback(() => {
    setQueue((current) => {
      if (current.length <= 1) setOverflow(0);
      return current.slice(1);
    });
  }, []);
  const openOwn = useCallback(() => {
    setQueue([]);
    setOverflow(0);
    setBoard({ target: null });
  }, []);
  const closeBoard = useCallback(() => setBoard(null), []);

  const current = queue[0];
  return (
    <>
      {current && (
        <AchievementToast
          key={`${current.id}:${previewKey}`}
          def={current}
          more={queue.length - 1 + overflow}
          onDone={next}
          onOpen={board ? next : openOwn}
        />
      )}
      {board && <AchievementsModal target={board.target} onClose={closeBoard} />}
    </>
  );
}
