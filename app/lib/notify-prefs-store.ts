"use client";

/**
 * Quiet hours and keyword alerts on this device: a copy of the account's
 * choice (lib/notify-prefs.ts), so a desktop notification can be decided
 * without asking the server. Changes show at once and are saved a moment later.
 */

import { useSyncExternalStore } from "react";
import {
  defaultNotifyPrefs,
  inQuietHours,
  keywordHit,
  normalizeNotifyPrefs,
  type NotifyPrefs,
} from "@/lib/notify-prefs";
import { apiFetch } from "@/app/lib/client";

const KEY = "huddle-notify-prefs";
const DEFAULT = defaultNotifyPrefs();

let prefs: NotifyPrefs | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function read(): NotifyPrefs {
  if (prefs) return prefs;
  let stored: string | null = null;
  try {
    stored = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
  } catch {
    // Storage blocked: the account's copy arrives with the session.
  }
  prefs = stored ? normalizeNotifyPrefs(stored) : DEFAULT;
  return prefs;
}

function apply(next: NotifyPrefs) {
  prefs = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // This tab only.
  }
  for (const listener of listeners) listener();
}

/** The session loaded: take the account's choice. */
export function adoptNotifyPrefs(next: NotifyPrefs | undefined) {
  if (!next) return;
  const normalized = normalizeNotifyPrefs(next);
  if (JSON.stringify(normalized) !== JSON.stringify(read())) apply(normalized);
}

/** This device's time zone, which is the one quiet hours are meant in. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function setNotifyPrefs(update: (current: NotifyPrefs) => NotifyPrefs) {
  const next = normalizeNotifyPrefs(update(read()));
  apply(next);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void apiFetch("/api/settings/notify", {
      method: "POST",
      body: JSON.stringify({ notify: next }),
    }).catch(() => undefined);
  }, 600);
}

/** True while notifications should stay silent. */
export function quietNow(): boolean {
  return inQuietHours(read());
}

/** The keyword of mine this text contains, if any. */
export function myKeywordIn(text: string): string | null {
  return keywordHit(read(), text);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverDefault = () => DEFAULT;

export function useNotifyPrefs(): NotifyPrefs {
  return useSyncExternalStore(subscribe, read, serverDefault);
}
