/**
 * Hands from the webcam, for the Gesture Synth.
 *
 * MediaPipe's hand landmarker runs on this device, like head tracking does
 * (see webcam-head-tracking.ts): the frames stay in this tab and only the 21
 * points per hand reach the synth, which turns them into notes.
 */
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import type { HandPoint } from "@/lib/gesture-synth";
import { savedDevice } from "./devices";
import { VISION_WASM_URL } from "./webcam-head-tracking";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type HandTrackingStatus = "loading" | "live" | "denied" | "unsupported";
type Delegate = "GPU" | "CPU";

/** GPU frames slower than this mean WebGL is software-rendered; the CPU path is then far quicker (~10× in tests). */
const SLOW_GPU_MS = 120;
/** Never ask for more than this many frames a second, and leave the page some room between slow ones. */
const MAX_FPS = 30;

const landmarkers: Partial<Record<Delegate, Promise<HandLandmarker | null>>> = {};

/** Loads once per page and delegate; a failed load may be retried by a later start. */
function loadLandmarker(delegate: Delegate): Promise<HandLandmarker | null> {
  landmarkers[delegate] ??= (async () => {
    try {
      const { HandLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
      return await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch {
      delete landmarkers[delegate];
      return null;
    }
  })();
  return landmarkers[delegate]!;
}

/** Shows the camera in `video` and reports the hands in every new frame. */
export class HandTracker {
  private stream: MediaStream | null = null;
  private model: HandLandmarker | null = null;
  private delegate: Delegate = "GPU";
  private frame = 0;
  private stopped = false;
  private lastVideoTime = -1;
  private lastStamp = 0;
  private nextAt = 0;
  private gpuTimes: number[] = [];
  private failures = 0;
  private switching = false;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onHands: (hands: HandPoint[][]) => void,
  ) {}

  async start(): Promise<HandTrackingStatus> {
    if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.getUserMedia !== "function") {
      return "unsupported";
    }
    const size = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
    const deviceId = savedDevice("camera");
    try {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { ...size, ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }) },
          audio: false,
        });
      } catch (error) {
        // The saved camera may be unplugged: any camera will do.
        if (!deviceId || (error as { name?: string })?.name === "NotAllowedError") throw error;
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { ...size, facingMode: "user" }, audio: false });
      }
    } catch (error) {
      const name = (error as { name?: string })?.name;
      return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported";
    }
    if (this.stopped) return this.teardown("unsupported");
    const video = this.video;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = this.stream;
    try {
      await video.play();
    } catch {
      return this.teardown("unsupported");
    }
    this.model = await loadLandmarker("GPU");
    if (!this.model) {
      this.delegate = "CPU";
      this.model = await loadLandmarker("CPU");
    }
    if (!this.model || this.stopped) return this.teardown("unsupported");
    this.loop();
    return "live";
  }

  /** Moves to the CPU landmarker once, when the GPU one is slow or keeps failing. */
  private fallBack() {
    if (this.delegate === "CPU" || this.switching) return;
    this.switching = true;
    void loadLandmarker("CPU").then((model) => {
      this.switching = false;
      if (!model || this.stopped) return;
      this.model = model;
      this.delegate = "CPU";
      this.failures = 0;
    });
  }

  private loop() {
    const step = () => {
      if (this.stopped) return;
      this.frame = requestAnimationFrame(step);
      const video = this.video;
      const model = this.model;
      const now = performance.now();
      if (!model || now < this.nextAt || video.readyState < 2 || video.currentTime === this.lastVideoTime) return;
      this.lastVideoTime = video.currentTime;
      // detectForVideo needs strictly increasing timestamps.
      this.lastStamp = Math.max(now, this.lastStamp + 1);
      let hands: HandPoint[][] | null = null;
      try {
        hands = (model.detectForVideo(video, this.lastStamp).landmarks ?? []) as HandPoint[][];
        this.failures = 0;
      } catch {
        // A dropped frame; the next one usually works. Many in a row on the GPU: try the CPU.
        this.failures += 1;
        if (this.failures >= 10) this.fallBack();
      }
      const took = performance.now() - now;
      this.nextAt = performance.now() + Math.max(1000 / MAX_FPS - took, took * 0.6);
      if (this.delegate === "GPU" && hands) {
        // The first frame warms up shaders; judge the next few, or one that is plainly far too slow.
        this.gpuTimes.push(took);
        if (this.gpuTimes.length > 1 && took > SLOW_GPU_MS * 3) this.fallBack();
        else if (this.gpuTimes.length === 6) {
          const sorted = this.gpuTimes.slice(1).sort((a, b) => a - b);
          if (sorted[2] > SLOW_GPU_MS) this.fallBack();
        }
      }
      if (hands) this.onHands(hands);
    };
    this.frame = requestAnimationFrame(step);
  }

  private teardown(status: HandTrackingStatus): HandTrackingStatus {
    cancelAnimationFrame(this.frame);
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    if (this.video.srcObject) this.video.srcObject = null;
    return status;
  }

  stop() {
    this.stopped = true;
    this.teardown("unsupported");
  }
}
