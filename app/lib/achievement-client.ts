"use client";

import { apiFetch } from "./client";

/**
 * Small event bus for achievements, so anything (the header button, a
 * profile card, the 3D rooms) can open the board or report a milestone
 * without threading props through the shell. AchievementCenter listens.
 */

export const OPEN_ACHIEVEMENTS_EVENT = "hoffle:open-achievements";
export const ACHIEVEMENTS_UNLOCKED_EVENT = "hoffle:achievements-unlocked";
/** Replays an unlock popup (the ▶ button in the board); not a real unlock. */
export const PREVIEW_ACHIEVEMENT_EVENT = "hoffle:preview-achievement";

export function previewAchievement(id: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PREVIEW_ACHIEVEMENT_EVENT, { detail: id }));
}

/** Fired with the new id list after you change your profile showcase. */
export const SHOWCASE_CHANGED_EVENT = "hoffle:achievement-showcase";

export interface AchievementsTarget {
  userId: string;
  name: string;
}

/** Opens the achievements board: your own, or someone else's earned ones. */
export function openAchievements(target?: AchievementsTarget | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_ACHIEVEMENTS_EVENT, { detail: target ?? null }));
}

/** Queues the unlock popup for these ids (duplicates are ignored). */
export function announceUnlocked(ids: string[] | null | undefined): void {
  if (typeof window === "undefined" || !ids?.length) return;
  window.dispatchEvent(new CustomEvent(ACHIEVEMENTS_UNLOCKED_EVENT, { detail: ids }));
}

let currentUserId: string | null = null;

/** Who is signed in here, so shared events (a dice roll) count only for their owner. */
export function setAchievementUser(id: string | null): void {
  currentUserId = id;
}

export function isAchievementUser(id: string | null | undefined): boolean {
  return Boolean(id && currentUserId && id === currentUserId);
}

const MARKS_KEY = "huddle_achievement_marks_v1";
const sentThisSession = new Set<string>();

function storedMarks(): Set<string> {
  try {
    const raw = window.localStorage.getItem(MARKS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function rememberMark(key: string): void {
  try {
    const marks = [...storedMarks(), key].slice(-400);
    window.localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  } catch {
    // Without storage the server's INSERT OR IGNORE still deduplicates.
  }
}

export type MarkKind = "theme" | "venue" | "fish" | "fish_rare" | "fish_junk" | "secret" | "dice";

/**
 * Reports a milestone only this tab can see (a theme tried, a fish caught).
 * Each distinct value is sent once per browser.
 */
export function markAchievement(kind: MarkKind, value: string): void {
  if (typeof window === "undefined" || !value) return;
  const key = `${kind}:${value.toLowerCase()}`;
  if (sentThisSession.has(key)) return;
  sentThisSession.add(key);
  if (storedMarks().has(key)) return;
  void apiFetch<{ newAchievements?: string[] }>("/api/achievements/mark", {
    method: "POST",
    body: JSON.stringify({ kind, value }),
  })
    .then((res) => {
      rememberMark(key);
      announceUnlocked(res?.newAchievements);
    })
    .catch(() => {
      // Try again next session.
      sentThisSession.delete(key);
    });
}

/** Formats a stat for progress text (voice time reads in hours). */
export function formatAchievementValue(stat: string, value: number): string {
  if (stat === "voice_seconds") {
    if (value < 3600) return `${Math.floor(value / 60)}m`;
    return `${Math.floor(value / 3600)}h`;
  }
  return value.toLocaleString();
}

export const TIER_POINTS = { bronze: 10, silver: 25, gold: 50, platinum: 100 } as const;
