/**
 * Timers that keep time in a background tab.
 *
 * Browsers slow down the timers of a page whose tab is hidden (Chrome and
 * Opera down to once a minute, more with battery savers). LiveKit's call
 * heartbeat runs on timers: a ping every few seconds and a "no pong for N
 * seconds" deadline (livekit-client src/api/SignalClient.ts resetPingTimeout).
 * When the tab is throttled the deadline can go off before the pong is read,
 * LiveKit closes the connection as a "ping timeout" and reconnects, and
 * everyone hears a blip. On 2026-10-31 one browser did this every ~3 minutes
 * for hours (RR_SIGNAL_DISCONNECTED in the LiveKit log).
 *
 * A dedicated worker's timers are not throttled like that, so the waiting
 * happens there and only the callback runs on the page. LiveKit lets an app
 * swap its timers for exactly this (CriticalTimers, livekit-client
 * src/room/timers.ts). If a worker cannot start, or dies, the page's own
 * timers take over, which is what LiveKit used before.
 */

/** The worker: runs the waits and posts back the id of each timer that fires. */
export const TIMER_WORKER_SOURCE = `
const timers = new Map();
self.onmessage = (event) => {
  const { op, id, delay, repeat } = event.data || {};
  if (op === "set") {
    timers.set(id, repeat
      ? setInterval(() => self.postMessage(id), delay)
      : setTimeout(() => { timers.delete(id); self.postMessage(id); }, delay));
  } else if (op === "clear") {
    const handle = timers.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      clearInterval(handle);
      timers.delete(id);
    }
  }
};
`;

/** The part of a Worker these timers use, so tests can stand one in. */
export interface TimerWorker {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

type Callback = (...args: unknown[]) => void;
type Handle = ReturnType<typeof setTimeout>;

interface Entry {
  callback: Callback;
  args: unknown[];
  delay: number;
  repeat: boolean;
  /** Set when the page's own timer runs this one instead of the worker. */
  native?: Handle;
}

export interface CallTimers {
  setTimeout(callback: unknown, delay?: number, ...args: unknown[]): number;
  setInterval(callback: unknown, delay?: number, ...args: unknown[]): number;
  clearTimeout(id: unknown): void;
  clearInterval(id: unknown): void;
}

/**
 * Ids start far above the browser's own (which count up from 1), so a timer
 * LiveKit made before the swap is never mistaken for one of these.
 */
const FIRST_ID = 0x40000000;

export function createWorkerTimers(makeWorker: () => TimerWorker | null): CallTimers {
  let worker: TimerWorker | null | undefined;
  let nextId = FIRST_ID;
  const entries = new Map<number, Entry>();

  function runNatively(id: number, entry: Entry) {
    entry.native = entry.repeat
      ? setInterval(() => entry.callback(...entry.args), entry.delay)
      : setTimeout(() => {
        entries.delete(id);
        entry.callback(...entry.args);
      }, entry.delay);
  }

  function ensureWorker(): TimerWorker | null {
    if (worker !== undefined) return worker;
    try {
      worker = makeWorker();
    } catch {
      worker = null;
    }
    if (!worker) return null;
    worker.onmessage = (event) => {
      const id = event.data;
      if (typeof id !== "number") return;
      const entry = entries.get(id);
      if (!entry || entry.native !== undefined) return;
      if (!entry.repeat) entries.delete(id);
      entry.callback(...entry.args);
    };
    // A worker that failed to load or crashed never fires again: hand every
    // waiting timer to the page so the call's heartbeat keeps going.
    worker.onerror = () => {
      worker = null;
      for (const [id, entry] of entries) {
        if (entry.native === undefined) runNatively(id, entry);
      }
    };
    return worker;
  }

  function set(repeat: boolean, callback: unknown, delay: unknown, args: unknown[]): number {
    const id = nextId++;
    const entry: Entry = {
      callback: typeof callback === "function" ? (callback as Callback) : () => undefined,
      args,
      delay: Math.max(0, Number(delay) || 0),
      repeat,
    };
    entries.set(id, entry);
    const active = ensureWorker();
    if (active) {
      try {
        active.postMessage({ op: "set", id, delay: entry.delay, repeat });
        return id;
      } catch {
        // Fall through to the page's timer.
      }
    }
    runNatively(id, entry);
    return id;
  }

  function clear(id: unknown) {
    const entry = typeof id === "number" ? entries.get(id) : undefined;
    if (!entry) {
      // Made before the swap: it is the browser's own timer.
      clearTimeout(id as Handle);
      clearInterval(id as Handle);
      return;
    }
    entries.delete(id as number);
    if (entry.native !== undefined) {
      clearTimeout(entry.native);
      clearInterval(entry.native);
    } else {
      worker?.postMessage({ op: "clear", id });
    }
  }

  return {
    setTimeout: (callback, delay, ...args) => set(false, callback, delay, args),
    setInterval: (callback, delay, ...args) => set(true, callback, delay, args),
    clearTimeout: clear,
    clearInterval: clear,
  };
}

let installed = false;

/**
 * Points LiveKit's timers (pass its CriticalTimers) at a worker, once per
 * page. Does nothing outside a browser or where workers are unavailable.
 */
export function keepCallTimersAwake(target: Record<keyof CallTimers, unknown>): void {
  if (installed) return;
  if (typeof window === "undefined" || typeof Worker === "undefined" || typeof Blob === "undefined") return;
  installed = true;
  const timers = createWorkerTimers(() => {
    // The page's CSP allows blob: workers (lib/security-headers.ts). The URL is
    // kept: revoking it straight away can race the worker's script load.
    const url = URL.createObjectURL(new Blob([TIMER_WORKER_SOURCE], { type: "text/javascript" }));
    return new Worker(url) as unknown as TimerWorker;
  });
  target.setTimeout = timers.setTimeout;
  target.setInterval = timers.setInterval;
  target.clearTimeout = timers.clearTimeout;
  target.clearInterval = timers.clearInterval;
}
