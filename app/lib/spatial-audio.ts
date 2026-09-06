import { registerMedia, unregisterMedia, savedDevice } from "./devices";

export interface TableSeat { pan: number; x: number; y: number; z: number }

/** Index/count exclude the listener and host. Listener is at (0,0,0), facing -Z. */
export function tableSeat(index: number, count: number, isHost = false): TableSeat {
  if (isHost || count <= 1) return { pan: 0, x: 0, y: 0, z: -1.5 };
  // Pairs stay on their original side as the roster grows; an odd seat is central.
  const center = count % 2;
  if (center && index === count - 1) return { pan: 0, x: 0, y: 0, z: -1.5 };
  const pairedIndex = Math.max(0, Math.min(count - 1, index));
  const pair = Math.floor(pairedIndex / 2) + 1;
  const angle = (pairedIndex % 2 === 0 ? -1 : 1) * pair / Math.floor(count / 2) * Math.PI / 3;
  return { pan: 0.65 * Math.sin(angle), x: 1.5 * Math.sin(angle), y: 0, z: -1.5 * Math.cos(angle) };
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
    seats.set(id, { pan: pan * spread, x: 1.5 * Math.sin(angle), y: 0, z: -1.5 * Math.cos(angle) });
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
}
type Entry = {
  input: PlaybackInput;
  element: HTMLAudioElement;
  source?: MediaStreamAudioSourceNode;
  panner?: StereoPannerNode;
  gain?: GainNode;
};
type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

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

  constructor() {
    window.addEventListener("pointerdown", this.resume);
    window.addEventListener("keydown", this.resume);
    window.addEventListener("huddle-speaker-change", this.changeSink);
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
      if ((enabled || input.important) && input.pan !== null && this.context && !entry.source) {
        let source: MediaStreamAudioSourceNode | undefined;
        let panner: StereoPannerNode | undefined;
        let gain: GainNode | undefined;
        try {
          source = this.context.createMediaStreamSource(input.stream);
          panner = this.context.createStereoPanner();
          gain = this.context.createGain();
          gain.gain.value = 0;
          source.connect(panner).connect(gain).connect(this.context.destination);
          Object.assign(entry, { source, panner, gain });
        } catch {
          source?.disconnect(); panner?.disconnect(); gain?.disconnect();
        }
      }
    }
    this.refresh();
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
        // Important stereo microphones are downmixed so both ears receive the same voice.
        panner.channelCount = input.important ? 1 : 2;
        panner.channelCountMode = input.important ? "explicit" : "clamped-max";
        holdParameter(panner.pan, now);
        panner.pan.setTargetAtTime(input.important ? 0 : input.pan ?? 0, now, 0.06);
      }
    }
  }

  private remove(entry: Entry) {
    entry.source?.disconnect(); entry.panner?.disconnect(); entry.gain?.disconnect();
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
