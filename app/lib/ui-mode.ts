"use client";

import { useSyncExternalStore } from "react";
import { apiFetch } from "@/app/lib/client";

/**
 * Simple or full interface. Simple keeps the everyday things in view and
 * tucks the rest behind "More" (settings tabs, message menu items, header
 * icons); nothing is removed, and slash commands work the same in both.
 *
 * The account holds the choice (users.ui_mode) so it follows you to every
 * device; localStorage only remembers it for the first paint, before the
 * session has loaded. Mirrored to `<html data-ui="simple">` for CSS.
 */

export type UiMode = "simple" | "full";

const KEY = "huddle-ui-mode";
const listeners = new Set<() => void>();
let mode: UiMode | null = null;

function readMode(): UiMode {
  if (mode) return mode;
  try {
    mode = typeof window !== "undefined" && window.localStorage.getItem(KEY) === "simple" ? "simple" : "full";
  } catch {
    mode = "full";
  }
  return mode;
}

function apply(next: UiMode) {
  mode = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // This tab only.
  }
  if (typeof document !== "undefined") {
    if (next === "simple") document.documentElement.dataset.ui = "simple";
    else delete document.documentElement.dataset.ui;
  }
  for (const listener of listeners) listener();
}

export function uiMode(): UiMode {
  return readMode();
}

/** The session loaded: take the account's choice. */
export function adoptUiMode(next: UiMode | undefined) {
  if (next && next !== readMode()) apply(next);
}

/** The person picked a mode: show it now and save it to the account. */
export function setUiMode(next: UiMode) {
  apply(next);
  void apiFetch("/api/settings/ui-mode", {
    method: "POST",
    body: JSON.stringify({ mode: next }),
  }).catch(() => undefined);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUiMode(): UiMode {
  return useSyncExternalStore(subscribe, readMode, () => "full" as const);
}

/** Applies the remembered mode to <html> on startup. */
export function installUiMode() {
  apply(readMode());
}
