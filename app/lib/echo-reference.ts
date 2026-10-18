/**
 * What this page is playing out loud right now: every remote stream, at the
 * level and pan it is heard at. The screen-share echo canceller
 * (`screen-echo.ts`) mixes the same thing as its reference, so it knows what
 * to take back out of a capture of the whole system's audio.
 */

export interface EchoSource {
  key: string;
  stream: MediaStream;
  /** 0 while muted, deafened or not playing. */
  gain: number;
  /** -1..1, as a stereo panner would place it. */
  pan: number;
}

let current: EchoSource[] = [];
const listeners = new Set<(sources: EchoSource[]) => void>();

export function setEchoSources(sources: EchoSource[]) {
  current = sources;
  for (const listener of listeners) listener(current);
}

/** Calls back now and on every change; returns the unsubscribe. */
export function watchEchoSources(listener: (sources: EchoSource[]) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
