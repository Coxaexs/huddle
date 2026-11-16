"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the full-screen music player is open, and on what. Kept apart from
 * the player itself so a button can open it without the player's code being
 * part of the page: the player is fetched the first time it opens
 * (music-player-layer.tsx).
 */

export type MusicPlayerTab = "lyrics" | "queue" | "search" | "playlists" | "dj";

/** Lyrics a /lyricsnow card already has, so opening it needs no new lookup. */
export interface MusicPlayerSeed {
  trackId: string;
  lines: Array<{ at: number; line: string }>;
  source?: string | null;
  sourceUrl?: string | null;
  versionLength?: number | null;
  loose?: boolean;
}

export interface MusicPlayerView {
  /** The voice room to show; the one you are in when not given. */
  channelId: string | null;
  tab: MusicPlayerTab;
  seed: MusicPlayerSeed | null;
  /** Open the lyrics tab straight on "Wrong lyrics?" (the card's button). */
  fix?: boolean;
}

let current: MusicPlayerView | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function openMusicPlayer(view: Partial<MusicPlayerView> = {}) {
  current = {
    channelId: view.channelId ?? null,
    tab: view.tab ?? "lyrics",
    seed: view.seed ?? null,
    fix: view.fix ?? false,
  };
  emit();
}

export function closeMusicPlayer() {
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMusicPlayerView(): MusicPlayerView | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
