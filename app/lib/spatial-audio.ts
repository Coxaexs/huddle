import { registerMedia, unregisterMedia, savedDevice } from "./devices";
import { NEUTRAL_POSE, type HeadPose } from "./head-tracking";

export interface TableSeat { pan: number; x: number; y: number; z: number }

export interface Vector { x: number; y: number; z: number }

/** Where the seats sit relative to the listener; also how far ahead a centred voice is. */
export const TABLE_RADIUS = 1.5;

/**
 * The listener's facing vectors for a head pose, in the Web Audio frame: +X right,
 * +Y up, and a listener at rest facing -Z, straight at the middle of the table.
 *
 * Seats are fixed in that frame, so rotating the listener is what makes the table
 * hold still while the listener turns: look left at the voice on your left and it
 * arrives in front of you.
 */
export function listenerOrientation({ yaw, pitch, roll }: HeadPose): { forward: Vector; up: Vector } {
  const [sy, cy] = [Math.sin(yaw), Math.cos(yaw)];
  const [sp, cp] = [Math.sin(pitch), Math.cos(pitch)];
  const [sr, cr] = [Math.sin(roll), Math.cos(roll)];
  return {
    forward: { x: -sy * cp, y: sp, z: -cy * cp },
    up: { x: cr * sp * sy - sr * cy, y: cr * cp, z: sr * sy + cr * sp * cy },
  };
}

/** Index/count exclude the listener and host. Listener is at (0,0,0), facing -Z. */
export function tableSeat(index: number, count: number, isHost = false): TableSeat {
  if (isHost || count <= 1) return { pan: 0, x: 0, y: 0, z: -TABLE_RADIUS };
  // Pairs stay on their original side as the roster grows; an odd seat is central.
  const center = count % 2;
  if (center && index === count - 1) return { pan: 0, x: 0, y: 0, z: -TABLE_RADIUS };
  const pairedIndex = Math.max(0, Math.min(count - 1, index));
  const pair = Math.floor(pairedIndex / 2) + 1;
  const angle = (pairedIndex % 2 === 0 ? -1 : 1) * pair / Math.floor(count / 2) * Math.PI / 3;
  return { pan: 0.65 * Math.sin(angle), x: TABLE_RADIUS * Math.sin(angle), y: 0, z: -TABLE_RADIUS * Math.cos(angle) };
}

/** Stable join order supplied by the caller; optional host gets the central seat. */
export function tableLayout(ids: string[], hostId?: string | null): Map<string, TableSeat> {
  const others = ids.filter((id) => id !== hostId);
  const seats = new Map(others.map((id, i) => [id, tableSeat(i, others.length)]));
  if (hostId && ids.includes(hostId)) {
    // With a host, distribute non-hosts in pairs, leaving the centre for the host.
    others.forEach((id, i) => seats.set(id, tableSeat(i, others.length + others.length % 2)));
    seats.set(hostId, tableSeat(0, 0, true));
  }
  return seats;
}

export const IMPORTANT_VOLUME_BOOST = 1.08;
export const MAX_TABLE_PAN = 0.65;

/** Listener overrides apply after automatic seating; a designated DM stays centred. */
export function personalTableLayout(
  ids: string[], hostId: string, overrides: Record<string, number>, width = 1,
): Map<string, TableSeat> {
  const seats = tableLayout(ids, hostId);
  const spread = Number.isFinite(width) ? Math.max(0, Math.min(1, width)) : 1;
  for (const [id, seat] of seats) {
    const custom = overrides[id];
    const pan = id === hostId ? 0 : Number.isFinite(custom) ? Math.max(-MAX_TABLE_PAN, Math.min(MAX_TABLE_PAN, custom)) : seat.pan;
    const angle = Math.asin(pan / MAX_TABLE_PAN);
    seats.set(id, { pan: pan * spread, x: TABLE_RADIUS * Math.sin(angle), y: 0, z: -TABLE_RADIUS * Math.cos(angle) });
  }
  return seats;
}

export interface PlaybackInput {
  key: string;
  stream: MediaStream;
  volume: number;
  muted: boolean;
  important?: boolean;
  pan: number | null; // null: music, screen share, or unknown stream
  seat?: Vector | null; // Head-tracked seating; absent falls back to stereo panning.
}
/** Stereo panning is screen-locked; HRTF adds height, front/back and head tracking. */
type Mode = "stereo" | "hrtf";
type Entry = {
  input: PlaybackInput;
  element: HTMLAudioElement;
  mode?: Mode;
  source?: MediaStreamAudioSourceNode;
  panner?: StereoPannerNode | PannerNode;
  gain?: GainNode;
};
type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

/** Head motion is continuous; a short glide absorbs sensor jitter without audible lag. */
const HEAD_GLIDE = 0.03;

type MovableListener = AudioListener & {
  setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
};
type MovablePanner = PannerNode & { setPosition?: (x: number, y: number, z: number) => void };

function holdParameter(param: AudioParam, now: number) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
  else {
    const value = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(value, now);
  }
}

/** One context per call. Native elements remain available for reliable fallback. */
export class SpatialAudioPlayback {
  private context: SinkContext | null = null;
  private entries = new Map<string, Entry>();
  private enabled = false;
  private needsContext = false;
  private disposed = false;
  private sinkReady = false;
  private sinkVersion = 0;
  private headPose: HeadPose | null = null;

  constructor() {
    window.addEventListener("pointerdown", this.resume);
    window.addEventListener("keydown", this.resume);
    window.addEventListener("huddle-speaker-change", this.changeSink);
  }

  /**
   * Head tracking on: seats become world-fixed points and the listener turns
   * inside them, so a voice on your left ends up in front when you look left.
   * Pass null when the headphones stop reporting and the table re-locks to
   * the screen with the original stereo panning.
   */
  setHeadPose(pose: HeadPose | null) {
    if (this.disposed) return;
    const before = this.mode();
    this.headPose = pose;
    this.orientListener();
    if (this.mode() === before) {
      // The common case, many times a second: only the geometry moved.
      const now = this.context?.currentTime ?? 0;
      for (const entry of this.entries.values()) this.seat(entry, now);
      return;
    }
    for (const entry of this.entries.values()) this.chain(entry);
    this.refresh();
  }

  /** HRTF needs a head pose and a context that can build panners; stereo always works. */
  private mode(): Mode {
    return this.headPose && typeof this.context?.createPanner === "function" ? "hrtf" : "stereo";
  }

  private resume = () => {
    if (this.needsContext) void this.context?.resume().catch(() => undefined);
  };
  private changeSink = () => { void this.configureSink(); };
  private async configureSink() {
    const context = this.context;
    if (!context) return;
    const version = ++this.sinkVersion;
    this.sinkReady = false;
    this.refresh();
    try {
      const sink = savedDevice("speaker");
      if (context.setSinkId) await context.setSinkId(sink || "");
      else if (sink) return; // Never silently send sound to a different device.
      if (!this.disposed && version === this.sinkVersion) this.sinkReady = true;
    } catch { /* Native playback retains the chosen speaker. */ }
    this.refresh();
  }

  update(inputs: PlaybackInput[], enabled: boolean) {
    this.enabled = enabled;
    this.needsContext = enabled || inputs.some((input) => input.important && input.pan !== null);
    if (this.needsContext && !this.context) {
      try {
        this.context = new AudioContext({ latencyHint: "interactive" });
        this.context.onstatechange = () => this.refresh();
        void this.configureSink();
        this.resume();
      } catch { /* Web Audio unavailable: keep native playback. */ }
    }
    const keys = new Set(inputs.map((input) => input.key));
    for (const [key, entry] of this.entries) {
      if (!keys.has(key)) { this.remove(entry); this.entries.delete(key); }
    }
    for (const input of inputs) {
      let entry = this.entries.get(input.key);
      if (entry && entry.input.stream !== input.stream) {
        this.remove(entry);
        this.entries.delete(input.key);
        entry = undefined;
      }
      if (!entry) {
        const element = new Audio();
        element.autoplay = true;
        element.srcObject = input.stream;
        element.muted = true;
        registerMedia(element);
        entry = { input, element };
        this.entries.set(input.key, entry);
        void element.play().catch(() => undefined);
      }
      entry.input = input;
      this.chain(entry);
    }
    this.orientListener();
    this.refresh();
  }

  /** Builds the spatial path an entry currently wants, rebuilding it when the mode flips. */
  private chain(entry: Entry) {
    const { input } = entry;
    const context = this.context;
    if (!context) return;
    if (!(this.enabled || input.important) || input.pan === null) return;
    const wanted = this.mode();
    if (entry.mode === wanted) return;
    if (entry.mode) this.detach(entry);
    let source: MediaStreamAudioSourceNode | undefined;
    let panner: StereoPannerNode | PannerNode | undefined;
    let gain: GainNode | undefined;
    try {
      // The stream's source node survives a mode change; only the panner is swapped.
      source = entry.source ?? context.createMediaStreamSource(input.stream);
      if (wanted === "hrtf") {
        const spatial = context.createPanner();
        spatial.panningModel = "HRTF";
        spatial.distanceModel = "inverse";
        spatial.refDistance = TABLE_RADIUS;
        spatial.maxDistance = 10 * TABLE_RADIUS;
        // Every seat sits at one radius, so distance only ever colours the mix.
        spatial.rolloffFactor = 0.4;
        panner = spatial;
      } else {
        panner = context.createStereoPanner();
      }
      gain = context.createGain();
      gain.gain.value = 0;
      source.connect(panner).connect(gain).connect(context.destination);
      Object.assign(entry, { source, panner, gain, mode: wanted });
    } catch {
      source?.disconnect(); panner?.disconnect(); gain?.disconnect();
      entry.source = undefined; entry.panner = undefined; entry.gain = undefined; entry.mode = undefined;
    }
  }

  private orientListener() {
    const context = this.context;
    const listener = context?.listener as MovableListener | undefined;
    if (!context || !listener) return;
    const { forward, up } = listenerOrientation(this.headPose ?? NEUTRAL_POSE);
    const now = context.currentTime;
    const axes: Array<[AudioParam | undefined, number]> = [
      [listener.forwardX, forward.x], [listener.forwardY, forward.y], [listener.forwardZ, forward.z],
      [listener.upX, up.x], [listener.upY, up.y], [listener.upZ, up.z],
    ];
    if (listener.forwardX) {
      for (const [param, value] of axes) {
        if (!param) continue;
        holdParameter(param, now);
        param.setTargetAtTime(value, now, HEAD_GLIDE);
      }
    } else {
      listener.setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /**
   * Puts a head-tracked voice where the listener should hear it. An important
   * voice tracks the listener's own heading, so it stays in front of their face
   * however far they turn; everyone else holds their seat at the table.
   */
  private seat(entry: Entry, now: number) {
    if (entry.mode !== "hrtf" || !entry.panner) return;
    const { forward } = listenerOrientation(this.headPose ?? NEUTRAL_POSE);
    const at = entry.input.important
      ? { x: forward.x * TABLE_RADIUS, y: forward.y * TABLE_RADIUS, z: forward.z * TABLE_RADIUS }
      : entry.input.seat ?? { x: 0, y: 0, z: -TABLE_RADIUS };
    this.place(entry.panner as MovablePanner, at, now);
  }

  private place(panner: MovablePanner, at: Vector, now: number) {
    const axes: Array<[AudioParam | undefined, number]> = [
      [panner.positionX, at.x], [panner.positionY, at.y], [panner.positionZ, at.z],
    ];
    if (panner.positionX) {
      for (const [param, value] of axes) {
        if (!param) continue;
        holdParameter(param, now);
        param.setTargetAtTime(value, now, HEAD_GLIDE);
      }
    } else {
      panner.setPosition?.(at.x, at.y, at.z);
    }
  }

  private refresh() {
    if (this.disposed) return;
    for (const entry of this.entries.values()) {
      const { input, element, panner, gain } = entry;
      const spatial = (this.enabled || !!input.important) && input.pan !== null && !!panner && this.sinkReady && this.context?.state === "running";
      const volume = Math.max(0, Math.min(1, input.volume)) * (input.important ? IMPORTANT_VOLUME_BOOST : 1);
      element.volume = Math.min(1, volume);
      element.muted = input.muted || spatial;
      if (gain && panner && this.context) {
        const now = this.context.currentTime;
        // Mute/bypass is immediate; volume and position changes glide.
        holdParameter(gain.gain, now);
        if (spatial && !input.muted) gain.gain.setTargetAtTime(volume, now, 0.025);
        else { gain.gain.cancelScheduledValues(now); gain.gain.value = 0; }
        if (entry.mode === "hrtf") {
          this.seat(entry, now);
        } else {
          const stereo = panner as StereoPannerNode;
          // Important stereo microphones are downmixed so both ears receive the same voice.
          stereo.channelCount = input.important ? 1 : 2;
          stereo.channelCountMode = input.important ? "explicit" : "clamped-max";
          holdParameter(stereo.pan, now);
          stereo.pan.setTargetAtTime(input.important ? 0 : input.pan ?? 0, now, 0.06);
        }
      }
    }
  }

  /** Drops the spatial path but keeps the stream's source node for reuse. */
  private detach(entry: Entry) {
    entry.source?.disconnect();
    entry.panner?.disconnect();
    entry.gain?.disconnect();
    entry.panner = undefined;
    entry.gain = undefined;
    entry.mode = undefined;
  }

  private remove(entry: Entry) {
    this.detach(entry);
    entry.source = undefined;
    entry.element.pause();
    entry.element.srcObject = null;
    unregisterMedia(entry.element);
    // Remote tracks belong to useVoice; never stop them here.
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("pointerdown", this.resume);
    window.removeEventListener("keydown", this.resume);
    window.removeEventListener("huddle-speaker-change", this.changeSink);
    for (const entry of this.entries.values()) this.remove(entry);
    this.entries.clear();
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => undefined);
    }
  }
}
