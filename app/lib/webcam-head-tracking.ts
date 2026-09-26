/**
 * Head orientation from the webcam, for everyone without AirPods.
 *
 * MediaPipe's face landmarker runs on this device and reports the face's rotation
 * as a transformation matrix; only the three angles leave this module, and no
 * frame is ever sent anywhere. It feeds the same recentred poses as HeadTracker.
 */
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { NEUTRAL_POSE, POSE_TIMEOUT_MS, relativePose, type HeadPose, type HeadTrackingStatus } from "./head-tracking";

const VISION_VERSION = "1.0.1";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** ~20 checks a second is plenty for a head; the audio graph glides between them. */
const FRAME_MS = 50;
/** Webcam angles jitter by a degree or two; this much smoothing hides it with ~100 ms lag. */
const SMOOTHING = 0.45;

/** True wherever a page can ask for a camera. */
export function webcamHeadTrackingPossible(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

/**
 * Reads yaw, pitch and roll from MediaPipe's column-major 4×4 face matrix.
 * The camera looks back at the listener, so turning to their left swings the
 * face's forward axis towards the image's right (+X): left stays positive, as
 * with AirPods.
 */
export function poseFromFaceMatrix(data: ArrayLike<number>): HeadPose | null {
  if (!data || data.length < 16) return null;
  const at = (row: number, col: number) => data[col * 4 + row];
  const [fx, fy, fz] = [at(0, 2), at(1, 2), at(2, 2)];
  const [ux, uy] = [at(0, 1), at(1, 1)];
  const pose = {
    yaw: Math.atan2(fx, fz),
    pitch: Math.atan2(fy, Math.hypot(fx, fz)),
    roll: Math.atan2(ux, uy),
  };
  return Number.isFinite(pose.yaw) && Number.isFinite(pose.pitch) && Number.isFinite(pose.roll) ? pose : null;
}

let landmarker: Promise<FaceLandmarker | null> | null = null;

/** Loads once per page; a failed load may be retried by a later start. */
function loadLandmarker(): Promise<FaceLandmarker | null> {
  landmarker ??= (async () => {
    try {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks(WASM_URL);
      const options = {
        runningMode: "VIDEO" as const,
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false,
      };
      try {
        return await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" }, ...options });
      } catch {
        return await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" }, ...options });
      }
    } catch {
      landmarker = null;
      return null;
    }
  })();
  return landmarker;
}

/** Same contract as HeadTracker: recentred poses by callback, status on change. */
export class WebcamHeadTracker {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private loop: ReturnType<typeof setTimeout> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private reference: HeadPose | null = null;
  private latest: HeadPose = NEUTRAL_POSE;
  private smoothed: HeadPose | null = null;
  private live = false;
  private lastFrame = -1;
  private starting: Promise<HeadTrackingStatus> | null = null;
  private stopped = false;

  constructor(
    private readonly onPose: (pose: HeadPose) => void,
    private readonly onStatus?: (status: HeadTrackingStatus, live: boolean) => void,
  ) {}

  start(): Promise<HeadTrackingStatus> {
    if (this.stopped) return Promise.resolve("unsupported");
    this.starting ??= this.begin();
    return this.starting;
  }

  private async begin(): Promise<HeadTrackingStatus> {
    if (!webcamHeadTrackingPossible()) return this.fail("unsupported");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 }, facingMode: "user" },
        audio: false,
      });
    } catch (error) {
      const name = (error as { name?: string })?.name;
      return this.fail(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
    }
    if (this.stopped) { this.teardown(); return "unsupported"; }
    const model = await loadLandmarker();
    if (!model || this.stopped) return this.fail("unsupported");
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = this.stream;
    this.video = video;
    try { await video.play(); } catch { return this.fail("unsupported"); }
    if (this.stopped) { this.teardown(); return "unsupported"; }
    this.onStatus?.("available", false);
    this.tick(model);
    return "available";
  }

  private fail(status: HeadTrackingStatus): HeadTrackingStatus {
    this.teardown();
    if (!this.stopped) this.onStatus?.(status, false);
    return status;
  }

  // setTimeout rather than requestAnimationFrame, so tracking survives a hidden tab.
  private tick(model: FaceLandmarker) {
    if (this.stopped || !this.video) return;
    const video = this.video;
    if (video.readyState >= 2 && video.currentTime !== this.lastFrame) {
      this.lastFrame = video.currentTime;
      try {
        const result = model.detectForVideo(video, performance.now());
        const matrix = result.facialTransformationMatrixes?.[0]?.data;
        const measured = matrix ? poseFromFaceMatrix(matrix) : null;
        if (measured) this.accept(measured);
      } catch { /* One bad frame; the watchdog handles a lasting loss. */ }
    }
    this.loop = setTimeout(() => this.tick(model), FRAME_MS);
  }

  private accept(measured: HeadPose) {
    const previous = this.smoothed;
    this.smoothed = previous ? {
      yaw: previous.yaw + (measured.yaw - previous.yaw) * SMOOTHING,
      pitch: previous.pitch + (measured.pitch - previous.pitch) * SMOOTHING,
      roll: previous.roll + (measured.roll - previous.roll) * SMOOTHING,
    } : measured;
    // The first face seen defines "straight ahead" until the listener recentres.
    this.reference ??= this.smoothed;
    this.latest = this.smoothed;
    if (!this.live) { this.live = true; this.onStatus?.("available", true); }
    this.watchdog();
    this.onPose(relativePose(this.smoothed, this.reference));
  }

  private watchdog() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      // Face out of frame: return the table to its screen-locked seats.
      this.live = false;
      this.smoothed = null;
      this.onStatus?.("available", false);
      this.onPose(NEUTRAL_POSE);
    }, POSE_TIMEOUT_MS);
  }

  recenter() {
    this.reference = this.latest;
    this.onPose(NEUTRAL_POSE);
  }

  private teardown() {
    if (this.loop) { clearTimeout(this.loop); this.loop = null; }
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; this.video = null; }
    this.live = false;
  }

  stop() {
    this.stopped = true;
    this.starting = null;
    this.teardown();
    this.onPose(NEUTRAL_POSE);
  }
}
