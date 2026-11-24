"use client";

import { useSyncExternalStore } from "react";

/**
 * Eco Mode: turns off blur, decorative animations, glowing shadows, and
 * heavy 3D/canvas effects (Matrix Rain, Starfield, 3D WebGL dice) to save
 * battery and keep Hoffle responsive on older or low-power devices.
 * Persisted locally and mirrored to `<html data-eco="1">` for CSS.
 */

const KEY = "huddle-eco-mode";
const listeners = new Set<() => void>();
let enabled: boolean | null = null;

function readEco(): boolean {
  if (enabled !== null) return enabled;
  try {
    enabled =
      typeof window !== "undefined" &&
      window.localStorage.getItem(KEY) === "1";
  } catch {
    enabled = false;
  }
  return enabled;
}

function apply(next: boolean) {
  enabled = next;
  try {
    if (next) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // Tab-only when storage is blocked.
  }
  if (typeof document !== "undefined") {
    if (next) document.documentElement.dataset.eco = "1";
    else delete document.documentElement.dataset.eco;
  }
  for (const listener of listeners) listener();
}

export function ecoMode(): boolean {
  return readEco();
}

export function setEcoMode(next: boolean) {
  apply(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEcoMode(): boolean {
  return useSyncExternalStore(subscribe, readEco, () => false);
}

export function installEcoMode() {
  apply(readEco());
}
