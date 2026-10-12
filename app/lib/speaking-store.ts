"use client";

import { useSyncExternalStore } from "react";

/**
 * Who is talking right now, kept outside React state. The voice hook polls
 * levels five times a second; holding the result in state re-rendered the whole
 * chat shell on every change. Only the components that show a speaking ring
 * subscribe (see `useSpeaking`).
 */
export interface SpeakingStore {
  get: () => Set<string>;
  set: (next: Set<string>) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createSpeakingStore(): SpeakingStore {
  let current = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next) => {
      if (next.size === current.size && [...next].every((id) => current.has(id))) return;
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The ids currently speaking ("self" for you); re-renders only when that changes. */
export function useSpeaking(store: SpeakingStore): Set<string> {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
