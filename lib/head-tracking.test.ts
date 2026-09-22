import { afterEach, expect, it, vi } from "vitest";
import {
  HeadTracker, NEUTRAL_POSE, POSE_TIMEOUT_MS, headTrackingPossible, relativePose, wrapAngle,
} from "../app/lib/head-tracking";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

/** Stands in for the desktop shell's injected API. */
function shell() {
  let emit: ((message: { payload: unknown }) => void) | null = null;
  const unlisten = vi.fn();
  const invoke = vi.fn(async (command: string): Promise<unknown> => (command === "head_tracking_start" ? "available" : undefined));
  vi.stubGlobal("__TAURI__", {
    core: { invoke },
    event: { listen: vi.fn(async (_event: string, handler: (m: { payload: unknown }) => void) => { emit = handler; return unlisten; }) },
  });
  return { invoke, unlisten, pose: (payload: unknown) => emit?.({ payload }) };
}

it("wraps angles the short way round", () => {
  expect(wrapAngle(0)).toBe(0);
  expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI);
  expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
  expect(wrapAngle(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI);
  expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI);
  expect(wrapAngle(NaN)).toBe(0);
  // Turning right past the back of the head must not read as a huge left turn.
  expect(relativePose({ yaw: -3, pitch: 0, roll: 0 }, { yaw: 3, pitch: 0, roll: 0 }).yaw).toBeCloseTo(2 * Math.PI - 6);
});

it("reports unsupported outside the desktop shell", async () => {
  vi.stubGlobal("__TAURI__", undefined);
  expect(headTrackingPossible()).toBe(false);
  const tracker = new HeadTracker(vi.fn());
  await expect(tracker.start()).resolves.toBe("unsupported");
  tracker.stop();
});

it("recentres on the first pose, reports relative motion, and recentres on demand", async () => {
  const bridge = shell();
  const poses: Array<{ yaw: number }> = [];
  const statuses: Array<[string, boolean]> = [];
  const tracker = new HeadTracker((pose) => poses.push(pose), (status, live) => statuses.push([status, live]));
  expect(headTrackingPossible()).toBe(true);
  await expect(tracker.start()).resolves.toBe("available");
  // The first sample defines straight ahead, whatever way the listener happened to face.
  bridge.pose({ yaw: 2, pitch: 0.1, roll: 0 });
  expect(poses.at(-1)?.yaw).toBeCloseTo(0);
  bridge.pose({ yaw: 2.5, pitch: 0.1, roll: 0 });
  expect(poses.at(-1)?.yaw).toBeCloseTo(0.5);
  expect(statuses).toEqual([["available", false], ["available", true]]);
  tracker.recenter();
  expect(poses.at(-1)).toEqual(NEUTRAL_POSE);
  bridge.pose({ yaw: 2.9, pitch: 0.1, roll: 0 });
  expect(poses.at(-1)?.yaw).toBeCloseTo(0.4);
  tracker.stop();
  expect(bridge.unlisten).toHaveBeenCalled();
  expect(bridge.invoke).toHaveBeenCalledWith("head_tracking_stop");
});

it("ignores malformed poses and re-locks the table when the headphones go quiet", async () => {
  vi.useFakeTimers();
  const bridge = shell();
  const poses: unknown[] = [];
  const statuses: Array<[string, boolean]> = [];
  const tracker = new HeadTracker((pose) => poses.push(pose), (status, live) => statuses.push([status, live]));
  await tracker.start();
  bridge.pose({ yaw: "left" });
  bridge.pose(null);
  bridge.pose({ yaw: NaN, pitch: 0, roll: 0 });
  expect(poses).toHaveLength(0);
  bridge.pose({ yaw: 0, pitch: 0, roll: 0 });
  bridge.pose({ yaw: 0.3, pitch: 0, roll: 0 });
  expect(poses).toHaveLength(2);
  vi.advanceTimersByTime(POSE_TIMEOUT_MS + 1);
  expect(poses.at(-1)).toEqual(NEUTRAL_POSE);
  expect(statuses.at(-1)).toEqual(["available", false]);
  tracker.stop();
});

it("surfaces a denied motion permission without starting", async () => {
  const bridge = shell();
  bridge.invoke.mockResolvedValue("denied");
  const statuses: Array<[string, boolean]> = [];
  const tracker = new HeadTracker(vi.fn(), (status, live) => statuses.push([status, live]));
  await expect(tracker.start()).resolves.toBe("denied");
  expect(statuses).toEqual([["denied", false]]);
  expect(bridge.unlisten).toHaveBeenCalled();
  tracker.stop();
});
