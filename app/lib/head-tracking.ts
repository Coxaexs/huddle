/**
 * AirPods head orientation, as reported by the desktop shell.
 *
 * No browser exposes headphone motion: Apple keeps the head pose behind
 * CoreMotion's `CMHeadphoneMotionManager`, so the Tauri shell reads it natively
 * and streams it in as `huddle:head-pose`. In a plain browser tab head tracking
 * reports itself unsupported and the table stays screen-locked.
 */

export interface HeadPose {
  /** Radians, relative to where the listener recentred. Turning left is positive. */
  yaw: number;
  pitch: number;
  roll: number;
}

export type HeadTrackingStatus = "unsupported" | "denied" | "available";

export const NEUTRAL_POSE: HeadPose = { yaw: 0, pitch: 0, roll: 0 };

/** Any surface with a recentre control dispatches this; the live tracker answers it. */
export const HEAD_RECENTER_EVENT = "huddle-head-recenter";

/**
 * CoreMotion's attitude axes are gravity-referenced, not head-referenced, so each
 * axis is mapped here rather than at the call sites. Flip a sign if a real pair of
 * AirPods turns out to report an axis the other way round.
 */
const AXIS_SIGN = { yaw: 1, pitch: 1, roll: 1 };

/** Poses stop arriving when headphones are removed; fall back rather than freeze off-axis. */
export const POSE_TIMEOUT_MS = 900;

/** Wraps an angle into (-π, π] so recentring never yields a long way round. */
export function wrapAngle(radians: number): number {
  if (!Number.isFinite(radians)) return 0;
  const wrapped = (radians + Math.PI) % (2 * Math.PI);
  return (wrapped <= 0 ? wrapped + 2 * Math.PI : wrapped) - Math.PI;
}

/** The pose as the listener experiences it: measured attitude minus where they recentred. */
export function relativePose(measured: HeadPose, reference: HeadPose): HeadPose {
  return {
    yaw: wrapAngle(measured.yaw - reference.yaw),
    pitch: wrapAngle(measured.pitch - reference.pitch),
    roll: wrapAngle(measured.roll - reference.roll),
  };
}

interface TauriBridge {
  core: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
  event: {
    listen: (event: string, handler: (message: { payload: unknown }) => void) => Promise<() => void>;
  };
}

function bridge(): TauriBridge | null {
  const tauri = (globalThis as { __TAURI__?: Partial<TauriBridge> }).__TAURI__;
  return tauri?.core?.invoke && tauri.event?.listen ? (tauri as TauriBridge) : null;
}

/** True only in the desktop shell; a browser tab can never read headphone motion. */
export function headTrackingPossible(): boolean {
  return bridge() !== null;
}

function readPose(payload: unknown): HeadPose | null {
  if (!payload || typeof payload !== "object") return null;
  const { yaw, pitch, roll } = payload as Record<string, unknown>;
  if (typeof yaw !== "number" || typeof pitch !== "number" || typeof roll !== "number") return null;
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || !Number.isFinite(roll)) return null;
  return { yaw: yaw * AXIS_SIGN.yaw, pitch: pitch * AXIS_SIGN.pitch, roll: roll * AXIS_SIGN.roll };
}

/**
 * Streams recentred head poses while running. Poses arrive far faster than React
 * should re-render, so consumers receive them through a callback and are expected
 * to push them straight at the audio graph.
 */
export class HeadTracker {
  private unlisten: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private reference: HeadPose = NEUTRAL_POSE;
  private latest: HeadPose = NEUTRAL_POSE;
  private live = false;
  private starting: Promise<HeadTrackingStatus> | null = null;
  private stopped = false;

  constructor(
    private readonly onPose: (pose: HeadPose) => void,
    private readonly onStatus?: (status: HeadTrackingStatus, live: boolean) => void,
  ) {}

  /** Idempotent: repeated calls share the first attempt's result. */
  start(): Promise<HeadTrackingStatus> {
    if (this.stopped) return Promise.resolve("unsupported");
    this.starting ??= this.begin();
    return this.starting;
  }

  private async begin(): Promise<HeadTrackingStatus> {
    const tauri = bridge();
    if (!tauri) return "unsupported";
    try {
      this.unlisten = await tauri.event.listen("huddle:head-pose", ({ payload }) => this.accept(payload));
      if (this.stopped) { this.unlisten(); this.unlisten = null; return "unsupported"; }
      const status = await tauri.core.invoke("head_tracking_start") as HeadTrackingStatus;
      if (status !== "available") { this.teardown(); this.onStatus?.(status, false); return status; }
      // The first pose defines "straight ahead" until the listener recentres.
      this.reference = NEUTRAL_POSE;
      this.latest = NEUTRAL_POSE;
      this.onStatus?.("available", false);
      return "available";
    } catch {
      this.teardown();
      return "unsupported";
    }
  }

  private accept(payload: unknown) {
    const measured = readPose(payload);
    if (!measured || this.stopped) return;
    if (this.reference === NEUTRAL_POSE && !this.live) this.reference = measured;
    this.latest = measured;
    if (!this.live) { this.live = true; this.onStatus?.("available", true); }
    this.watchdog();
    this.onPose(relativePose(measured, this.reference));
  }

  private watchdog() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      // Headphones gone or asleep: return the table to its screen-locked seats.
      this.live = false;
      this.onStatus?.("available", false);
      this.onPose(NEUTRAL_POSE);
    }, POSE_TIMEOUT_MS);
  }

  /** Treats the listener's current heading as facing the middle of the table. */
  recenter() {
    this.reference = this.latest;
    this.onPose(NEUTRAL_POSE);
  }

  private teardown() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.unlisten?.();
    this.unlisten = null;
    this.live = false;
    void bridge()?.core.invoke("head_tracking_stop").catch(() => undefined);
  }

  stop() {
    this.stopped = true;
    this.starting = null;
    this.teardown();
    this.onPose(NEUTRAL_POSE);
  }
}
