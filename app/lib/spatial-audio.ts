import { registerMedia, unregisterMedia, savedDevice } from "./devices";
import { NEUTRAL_POSE, type HeadPose } from "./head-tracking";

export interface TableSeat { pan: number; x: number; y: number; z: number }

export interface Vector { x: number; y: number; z: number }

/** Where the seats sit relative to the listener; also how far ahead a centred voice is. */
export const TABLE_RADIUS = 1.5;

/** Automatic seats fan out this far either side; HRTF keeps ±75° clearly apart. */
const TABLE_ARC = 5 * Math.PI / 12;

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
  const angle = (pairedIndex % 2 === 0 ? -1 : 1) * pair / Math.floor(count / 2) * TABLE_ARC;
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
    // Width narrows the real seats too, so it still gathers voices under HRTF.
    const angle = Math.asin(pan / MAX_TABLE_PAN) * spread;
    seats.set(id, { pan: pan * spread, x: TABLE_RADIUS * Math.sin(angle), y: 0, z: -TABLE_RADIUS * Math.cos(angle) });
  }
  return seats;
}

/** Personal volume can boost a quiet voice up to twice its level (+6 dB). */
export const MAX_VOLUME = 2;

export interface PlaybackInput {
  key: string;
  stream: MediaStream;
  volume: number; // 0..MAX_VOLUME; above 1 needs Web Audio, since media elements stop at 1.
  muted: boolean;
  important?: boolean;
  pan: number | null; // null: music, screen share, or unknown stream
  seat?: Vector | null; // Head-tracked seating; absent falls back to stereo panning.
  /** Living room distance for loudspeakers; HRTF gets distance from the seat itself. */
  attenuation?: number;
  /** Living room gain that applies under HRTF too (the quiet nook). */
  hrtfAttenuation?: number;
  /** Living room: low-pass cutoff in Hz (distance, a turned head, a wall). */
  cutoff?: number;
  /** Living room: this voice's reverb send, instead of the table's fixed ROOM_SEND. */
  wet?: number;
}
/**
 * Stereo panning is for loudspeakers; HRTF adds height, front/back, a room and head tracking.
 * "boost" is an unpanned gain for a stream turned up past what an <audio> element can play.
 */
type Mode = "stereo" | "hrtf" | "boost";
type Entry = {
  input: PlaybackInput;
  element: HTMLAudioElement;
  mode?: Mode;
  source?: MediaStreamAudioSourceNode;
  panner?: StereoPannerNode | PannerNode;
  gain?: GainNode;
  /** Living room voices only: tone and reverb are shaped per voice. */
  shaped?: boolean;
  filter?: BiquadFilterNode;
  send?: GainNode;
};
type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

/** How much of each headphone voice reaches the shared room; enough to leave the head, not echo. */
export const ROOM_SEND = 0.1;

/** How a room rings: tail length, decay constant, how dark the tail is, first reflection. */
export interface RoomShape { seconds: number; decay: number; damp: number; predelay: number }

/**
 * The table is a small furnished room. The Living Room themes each get their own:
 * a warm wooden lounge, a stone gothic parlour that rings, a tight dead server
 * den, and a bright hard-walled flat.
 */
export const ROOM_SHAPES = {
  table: { seconds: 0.6, decay: 0.11, damp: 0.35, predelay: 0.012 },
  cozy: { seconds: 1.0, decay: 0.2, damp: 0.28, predelay: 0.018 },
  vampire: { seconds: 2.2, decay: 0.48, damp: 0.42, predelay: 0.03 },
  matrix: { seconds: 0.7, decay: 0.12, damp: 0.5, predelay: 0.008 },
  cyberpunk: { seconds: 1.2, decay: 0.24, damp: 0.6, predelay: 0.02 },
  // A library: books swallow the highs, the wood keeps a warm, medium tail.
  academia: { seconds: 1.4, decay: 0.3, damp: 0.22, predelay: 0.024 },
} satisfies Record<string, RoomShape>;
export type RoomShapeName = keyof typeof ROOM_SHAPES;

/**
 * Noise shaped into a room's tail: a short gap before the first reflection,
 * then a decaying, low-passed tail. Each ear gets its own noise so the room is wide.
 */
export function roomImpulse(context: BaseAudioContext, random = Math.random, shape: RoomShape = ROOM_SHAPES.table): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.floor(rate * shape.seconds);
  const predelay = Math.floor(rate * shape.predelay);
  const buffer = context.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let dark = 0;
    for (let i = predelay; i < length; i++) {
      const t = (i - predelay) / rate;
      // A one-pole low-pass: soft furnishings swallow the highs first.
      dark += (random() * 2 - 1 - dark) * shape.damp;
      data[i] = dark * Math.exp(-t / shape.decay);
    }
  }
  return buffer;
}

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
  private headphones = false;
  private room: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private shape: RoomShapeName = "table";

  constructor() {
    window.addEventListener("pointerdown", this.resume);
    window.addEventListener("keydown", this.resume);
    window.addEventListener("huddle-speaker-change", this.changeSink);
    // A phone suspends the context while the browser is in the background.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.resumeWhenVisible);
    }
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

  /**
   * Headphones get binaural HRTF even without head tracking; loudspeakers already
   * put the room around the listener, so they keep plain stereo panning.
   */
  setHeadphones(headphones: boolean) {
    if (this.disposed || this.headphones === headphones) return;
    const before = this.mode();
    this.headphones = headphones;
    if (this.mode() === before) return;
    for (const entry of this.entries.values()) this.chain(entry);
    this.refresh();
  }

  /** HRTF needs headphones or a head pose, and a context that can build panners; stereo always works. */
  private mode(): Mode {
    return (this.headPose || this.headphones) && typeof this.context?.createPanner === "function" ? "hrtf" : "stereo";
  }

  /** One reverb shared by every voice, built the first time a headphone voice needs it. */
  private roomInput(context: SinkContext): GainNode | null {
    if (this.room) return this.room;
    if (typeof context.createConvolver !== "function" || typeof context.createBuffer !== "function") return null;
    try {
      const reverb = context.createConvolver();
      reverb.buffer = roomImpulse(context, Math.random, ROOM_SHAPES[this.shape]);
      this.reverb = reverb;
      const send = context.createGain();
      send.gain.value = ROOM_SEND;
      send.connect(reverb).connect(context.destination);
      this.room = send;
    } catch { /* A dry mix still works. */ }
    return this.room;
  }

  /** Swaps the shared reverb for another room's, e.g. when the Living Room opens. */
  setRoomShape(name: RoomShapeName) {
    if (this.disposed || this.shape === name) return;
    this.shape = name;
    if (!this.reverb || !this.context) return;
    try { this.reverb.buffer = roomImpulse(this.context, Math.random, ROOM_SHAPES[name]); } catch { /* Keep the old room. */ }
  }

  private resume = () => {
    if (this.needsContext) void this.context?.resume().catch(() => undefined);
  };
  private resumeWhenVisible = () => {
    if (document.visibilityState === "visible") this.resume();
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
    this.needsContext = enabled || inputs.some((input) => (input.important && input.pan !== null) || input.volume > 1);
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
    const wanted = this.spatialFor(input) ? this.mode() : input.volume > 1 ? "boost" : undefined;
    if (!wanted) return;
    const shaped = wanted !== "boost" && (input.cutoff !== undefined || input.wet !== undefined);
    if (entry.mode === wanted && Boolean(entry.shaped) === shaped) return;
    if (entry.mode) this.detach(entry);
    let source: MediaStreamAudioSourceNode | undefined;
    let panner: StereoPannerNode | PannerNode | undefined;
    let gain: GainNode | undefined;
    let filter: BiquadFilterNode | undefined;
    let send: GainNode | undefined;
    try {
      // The stream's source node survives a mode change; only the panner is swapped.
      source = entry.source ?? context.createMediaStreamSource(input.stream);
      // No compressor here, deliberately. Levelling is each sender's job (the
      // mic chain's auto-gain), and a DynamicsCompressorNode always adds its
      // own make-up gain — about 10 dB at voice levels — which made a voice
      // jump in volume whenever it moved between this path and the plain
      // element: switching apps, a context the phone suspended, or being
      // marked important. Unity gain here means both paths sound the same.
      if (wanted === "hrtf") {
        const spatial = context.createPanner();
        spatial.panningModel = "HRTF";
        spatial.distanceModel = "inverse";
        spatial.refDistance = TABLE_RADIUS;
        spatial.maxDistance = 10 * TABLE_RADIUS;
        // Every seat sits at one radius, so distance only ever colours the mix.
        spatial.rolloffFactor = 0.4;
        panner = spatial;
      } else if (wanted === "stereo") {
        panner = context.createStereoPanner();
      }
      gain = context.createGain();
      gain.gain.value = 0;
      // Living room voices get a tone filter after the panner: air, a turned head, a wall.
      if (shaped && typeof context.createBiquadFilter === "function") {
        filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = 0.5;
        filter.frequency.value = input.cutoff ?? 20000;
      }
      const head = panner ? source.connect(panner) : source;
      (filter ? head.connect(filter) : head).connect(gain).connect(context.destination);
      if (wanted === "hrtf") {
        const room = this.roomInput(context);
        if (room && shaped) {
          // A per-voice send, so a far voice sits further into the room than a near one.
          send = context.createGain();
          send.gain.value = (input.wet ?? ROOM_SEND) / ROOM_SEND;
          gain.connect(send).connect(room);
        } else if (room) gain.connect(room);
      }
      Object.assign(entry, { source, panner, gain, filter, send, shaped, mode: wanted });
    } catch {
      source?.disconnect(); panner?.disconnect(); gain?.disconnect(); filter?.disconnect(); send?.disconnect();
      entry.source = undefined; entry.panner = undefined; entry.gain = undefined; entry.filter = undefined; entry.send = undefined; entry.shaped = undefined; entry.mode = undefined;
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

  private spatialFor(input: PlaybackInput): boolean {
    return (this.enabled || !!input.important) && input.pan !== null;
  }

  private refresh() {
    if (this.disposed) return;
    const live = this.sinkReady && this.context?.state === "running";
    for (const entry of this.entries.values()) {
      const { input, element, panner, gain } = entry;
      const spatial = this.spatialFor(input);
      // Web Audio carries the stream when it is spatial or boosted; otherwise the element does.
      const routed = live && !!gain && (spatial ? !!panner : input.volume > 1 && entry.mode === "boost");
      const volume = Math.max(0, Math.min(MAX_VOLUME, input.volume)) * (input.important ? IMPORTANT_VOLUME_BOOST : 1)
        * (spatial && !input.important ? Math.max(0, Math.min(1, (entry.mode === "hrtf" ? input.hrtfAttenuation : input.attenuation) ?? 1)) : 1);
      element.volume = Math.min(1, volume);
      element.muted = input.muted || routed;
      if (gain && this.context) {
        const now = this.context.currentTime;
        // Mute/bypass is immediate; volume and position changes glide.
        holdParameter(gain.gain, now);
        if (routed && !input.muted) gain.gain.setTargetAtTime(volume, now, 0.025);
        else { gain.gain.cancelScheduledValues(now); gain.gain.value = 0; }
        if (entry.filter) {
          holdParameter(entry.filter.frequency, now);
          entry.filter.frequency.setTargetAtTime(Math.max(200, Math.min(20000, input.cutoff ?? 20000)), now, 0.08);
        }
        if (entry.send) {
          holdParameter(entry.send.gain, now);
          entry.send.gain.setTargetAtTime((input.wet ?? ROOM_SEND) / ROOM_SEND, now, 0.08);
        }
        if (!panner) continue;
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
    entry.filter?.disconnect();
    entry.send?.disconnect();
    entry.panner = undefined;
    entry.gain = undefined;
    entry.filter = undefined;
    entry.send = undefined;
    entry.shaped = undefined;
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
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.resumeWhenVisible);
    }
    for (const entry of this.entries.values()) this.remove(entry);
    this.entries.clear();
    this.room?.disconnect();
    this.room = null;
    this.reverb = null;
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => undefined);
    }
  }
}
