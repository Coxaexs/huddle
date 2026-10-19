"use client";

import { useSyncExternalStore } from "react";

/**
 * Streamer Mode: while it is on, personal details (email, invite codes) are
 * blurred and notification popups stay quiet, so none of it ends up on a
 * stream. "auto" turns it on by itself while you share your screen.
 *
 * Kept outside React state like the speaking store: the voice hook reports
 * sharing, and any component can ask whether the mode is active. The answer
 * is mirrored to `<html data-streamer="on">` so CSS can hide marked elements
 * (`[data-streamer-hide]`) without each of them subscribing.
 */

export type StreamerSetting = "off" | "on" | "auto";

const KEY = "huddle-streamer-mode";
const listeners = new Set<() => void>();
let setting: StreamerSetting | null = null;
let sharing = false;

function readSetting(): StreamerSetting {
  if (setting) return setting;
  try {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    setting = stored === "on" || stored === "auto" ? stored : "off";
  } catch {
    setting = "off";
  }
  return setting;
}

function emit() {
  if (typeof document !== "undefined") {
    if (streamerModeActive()) document.documentElement.dataset.streamer = "on";
    else delete document.documentElement.dataset.streamer;
  }
  for (const listener of listeners) listener();
}

export function streamerSetting(): StreamerSetting {
  return readSetting();
}

export function setStreamerSetting(next: StreamerSetting) {
  setting = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // This tab only.
  }
  emit();
}

/** The voice hook calls this whenever a screen share starts or stops. */
export function setStreamerSharing(next: boolean) {
  if (sharing === next) return;
  sharing = next;
  emit();
}

export function streamerModeActive(): boolean {
  const current = readSetting();
  return current === "on" || (current === "auto" && sharing);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStreamerMode(): { active: boolean; setting: StreamerSetting } {
  const active = useSyncExternalStore(subscribe, streamerModeActive, () => false);
  const current = useSyncExternalStore(subscribe, streamerSetting, () => "off" as const);
  return { active, setting: current };
}

/** Applies the stored setting to <html> on startup, before anything is shared. */
export function installStreamerMode() {
  emit();
}
