"use client";

/**
 * What this tab is watching, for the room's viewer counts.
 *
 * A screen share arrives paused until the viewer says "Go Ahead" (the stage
 * offers it once; see voice-stage.tsx), and the watch party counts while a
 * player is actually showing it (the stage's or the living room's).
 */

/** Screen-share tiles (by key) offered to this tab, and those still waiting for "Go Ahead". */
export const offeredScreens = new Set<string>();
export const awaitingScreens = new Set<string>();
/** Rooms whose watch party this tab chose to watch (by tile key). */
export const tunedWatch = new Set<string>();

const listeners = new Set<() => void>();
let version = 0;
let partyPlayers = 0;

export function tuneInChanged(): void {
  version++;
  for (const listener of listeners) listener();
}

export function subscribeTuneIn(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function tuneInVersion(): number {
  return version;
}

/** A player started showing the watch party; call the returned function when it stops. */
export function partyPlayerOn(): () => void {
  partyPlayers++;
  tuneInChanged();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    partyPlayers--;
    tuneInChanged();
  };
}

export function watchingParty(): boolean {
  return partyPlayers > 0;
}

/** Whether a remote screen share is still waiting for this viewer's "Go Ahead". */
export function awaitingScreen(connectionId: string, streamId: string): boolean {
  return awaitingScreens.has(`${connectionId}:${streamId}`);
}
