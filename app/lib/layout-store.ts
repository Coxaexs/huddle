"use client";

import { useSyncExternalStore } from "react";
import { apiFetch } from "@/app/lib/client";
import {
  DEFAULT_LAYOUT,
  normalizeLayout,
  type LayoutPrefs,
} from "@/lib/layout-prefs";

/**
 * Where the channel list and member list sit, and the pinned widgets.
 *
 * Like the simple/full switch (ui-mode.ts): the account holds the choice so
 * it follows you to every device, localStorage remembers it for the first
 * paint, and <html data-chan / data-members> carries the sides for CSS
 * (app/layout-custom.css). The default layout sets neither attribute, so it
 * is exactly the layout that existed before this.
 */

const KEY = "huddle-layout";
const listeners = new Set<() => void>();
let layout: LayoutPrefs | null = null;
let customizing = false;
/** In Customize: the widget picked from the tray, waiting for an area tap. */
let armed: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function readLayout(): LayoutPrefs {
  if (layout) return layout;
  try {
    layout = normalizeLayout(typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null);
  } catch {
    layout = { ...DEFAULT_LAYOUT, widgets: [] };
  }
  return layout;
}

function applyToDocument(next: LayoutPrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (next.channels === "left") delete root.dataset.chan;
  else root.dataset.chan = next.channels;
  if (next.members === "right") delete root.dataset.members;
  else root.dataset.members = next.members;
}

function apply(next: LayoutPrefs) {
  layout = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // This tab only.
  }
  applyToDocument(next);
  for (const listener of listeners) listener();
}

export function layoutPrefs(): LayoutPrefs {
  return readLayout();
}

/** The session loaded: take the account's layout. */
export function adoptLayout(next: LayoutPrefs | undefined) {
  if (!next) return;
  const normalized = normalizeLayout(next);
  if (JSON.stringify(normalized) !== JSON.stringify(readLayout())) apply(normalized);
}

/**
 * The person changed the layout: show it now, save it to the account a
 * moment later (dragging widgets around makes several changes in a row).
 */
export function setLayout(update: LayoutPrefs | ((current: LayoutPrefs) => LayoutPrefs)) {
  const next = normalizeLayout(typeof update === "function" ? update(readLayout()) : update);
  apply(next);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void apiFetch("/api/settings/layout", {
      method: "POST",
      body: JSON.stringify({ layout: next }),
    }).catch(() => undefined);
  }, 600);
}

export function resetLayout() {
  setLayout({ ...DEFAULT_LAYOUT, widgets: [] });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverDefault = () => DEFAULT_LAYOUT;

export function useLayoutPrefs(): LayoutPrefs {
  return useSyncExternalStore(subscribe, readLayout, serverDefault);
}

/** Customize mode: drop zones show and the widget tray opens. */
export function setCustomizing(on: boolean) {
  if (customizing === on) return;
  customizing = on;
  armed = null;
  if (typeof document !== "undefined") {
    if (on) document.documentElement.dataset.customizing = "";
    else delete document.documentElement.dataset.customizing;
  }
  for (const listener of listeners) listener();
}

export function useCustomizing(): boolean {
  return useSyncExternalStore(subscribe, () => customizing, () => false);
}

export function armWidget(id: string | null) {
  armed = id;
  for (const listener of listeners) listener();
}

export function useArmedWidget(): string | null {
  return useSyncExternalStore(subscribe, () => armed, () => null);
}

/** Applies the remembered layout to <html> on startup. */
export function installLayout() {
  applyToDocument(readLayout());
}
