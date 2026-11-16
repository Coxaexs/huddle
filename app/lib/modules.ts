"use client";

import { useSyncExternalStore } from "react";
import { normalizeDisabledModules, type FeatureModuleKey } from "@/lib/features";

/**
 * Which optional modules (D&D, games, music, the 3D room, cosmetics) are
 * switched off for the person looking at the screen: their own choice in
 * Settings plus the choice of the server they are in. One store, so a button
 * deep in the tree can ask without the answer being passed down to it.
 */
let userInput: readonly string[] | undefined;
let serverInput: readonly string[] | undefined;
let userOff: FeatureModuleKey[] = [];
let serverOff: FeatureModuleKey[] = [];
let off: ReadonlySet<FeatureModuleKey> = new Set();
const NONE: ReadonlySet<FeatureModuleKey> = new Set();
const listeners = new Set<() => void>();

function rebuild() {
  const next = new Set<FeatureModuleKey>([...userOff, ...serverOff]);
  if (next.size === off.size && [...next].every((key) => off.has(key))) return;
  off = next;
  if (typeof document !== "undefined") {
    document.documentElement.dataset.cosmetics = off.has("cosmetics") ? "off" : "on";
  }
  // Called while the shell renders, so tell subscribers after it has finished.
  queueMicrotask(() => listeners.forEach((listener) => listener()));
}

/**
 * The shell calls this on every render with what the session and the open
 * server say. A list is only taken again when it is a new list, so a switch
 * flipped in Settings holds until the session catches up with it.
 */
export function syncModuleSwitches(user: readonly string[] | undefined, server: readonly string[] | undefined) {
  if (user === userInput && server === serverInput) return;
  if (user !== userInput) {
    userInput = user;
    userOff = normalizeDisabledModules(user ? [...user] : []);
  }
  if (server !== serverInput) {
    serverInput = server;
    serverOff = normalizeDisabledModules(server ? [...server] : []);
  }
  rebuild();
}

/** The person flipped a switch in Settings: apply it now, before the save lands. */
export function setUserModuleSwitches(next: readonly FeatureModuleKey[]) {
  userOff = [...next];
  rebuild();
}

/** What the person themselves has switched off (not counting the server). */
export function userModulesOff(): FeatureModuleKey[] {
  return [...userOff];
}

/** For code that is not a component. Components use useModuleOn, which re-renders. */
export function moduleOn(key: FeatureModuleKey): boolean {
  return !off.has(key);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useModulesOff(): ReadonlySet<FeatureModuleKey> {
  return useSyncExternalStore(subscribe, () => off, () => NONE);
}

export function useModuleOn(key: FeatureModuleKey): boolean {
  return !useModulesOff().has(key);
}

/** For tests. */
export function resetModuleSwitches() {
  userInput = serverInput = undefined;
  userOff = [];
  serverOff = [];
  off = new Set();
}
