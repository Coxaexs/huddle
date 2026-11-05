import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TIMER_WORKER_SOURCE, createWorkerTimers, type TimerWorker } from "./worker-timers";

/** Runs the real worker source against this test's (fake) timers. */
function fakeWorker(): TimerWorker & { crash(): void } {
  const scope: { onmessage?: (event: { data: unknown }) => void; postMessage?: (data: unknown) => void } = {};
  const page = {
    onmessage: null as TimerWorker["onmessage"],
    onerror: null as TimerWorker["onerror"],
    dead: false,
    postMessage(message: unknown) {
      if (!page.dead) scope.onmessage?.({ data: message });
    },
    crash() {
      page.dead = true;
      page.onerror?.(new Event("error"));
    },
  };
  scope.postMessage = (data) => {
    if (!page.dead) page.onmessage?.({ data });
  };
  new Function("self", TIMER_WORKER_SOURCE)(scope);
  return page;
}

describe("worker timers", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires a timeout once, with its arguments", () => {
    const timers = createWorkerTimers(fakeWorker);
    const callback = vi.fn();
    timers.setTimeout(callback, 1000, "a", 2);
    vi.advanceTimersByTime(999);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledWith("a", 2);
    vi.advanceTimersByTime(5000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("repeats an interval until it is cleared", () => {
    const timers = createWorkerTimers(fakeWorker);
    const callback = vi.fn();
    const id = timers.setInterval(callback, 5000);
    vi.advanceTimersByTime(15000);
    expect(callback).toHaveBeenCalledTimes(3);
    timers.clearInterval(id);
    vi.advanceTimersByTime(15000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("never fires a timeout cleared in time", () => {
    const timers = createWorkerTimers(fakeWorker);
    const callback = vi.fn();
    const id = timers.setTimeout(callback, 1000);
    timers.clearTimeout(id);
    vi.advanceTimersByTime(2000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("uses the page's timers when no worker can start", () => {
    const timers = createWorkerTimers(() => {
      throw new Error("blocked");
    });
    const callback = vi.fn();
    timers.setTimeout(callback, 100);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("hands waiting timers to the page when the worker dies", () => {
    let worker: ReturnType<typeof fakeWorker> | null = null;
    const timers = createWorkerTimers(() => (worker = fakeWorker()));
    const ping = vi.fn();
    timers.setInterval(ping, 1000);
    vi.advanceTimersByTime(1000);
    expect(ping).toHaveBeenCalledTimes(1);
    worker!.crash();
    vi.advanceTimersByTime(3000);
    expect(ping).toHaveBeenCalledTimes(4);
  });

  it("still clears a browser timer made before the swap", () => {
    const callback = vi.fn();
    const native = setTimeout(callback, 100);
    createWorkerTimers(fakeWorker).clearTimeout(native);
    vi.advanceTimersByTime(200);
    expect(callback).not.toHaveBeenCalled();
  });
});
