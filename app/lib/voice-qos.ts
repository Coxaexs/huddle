/**
 * Adaptive quality of service for the voice mesh.
 *
 * `voiceBitrate` decides what a healthy link gets from the size of the room
 * alone. This watches each direct connection (packet loss, jitter, round trip)
 * and spends less, or spends it differently, on the ones that are struggling:
 *
 * - normal: the room's target bitrate, plain Opus (in-band FEC is always
 *   negotiated, see `tuneOpusSdp`).
 * - lossy (2–8 % loss): every packet also carries the one before it (RED), so
 *   a lost packet is rebuilt exactly. That doubles what goes on the wire, so
 *   the encoder is capped and the copy counts twice against the uplink.
 * - severe (over 8 % loss, or a round trip past 350 ms): the link is drowning,
 *   so send as little as possible — 16 kbps with DTX, or 32 kbps while this
 *   seat is the one talking.
 *
 * In a mesh every sender carries *your own* voice, one copy per listener, so
 * "the active speaker keeps 32 kbps" means: while you hold the floor. Someone
 * else talking costs your uplink nothing.
 *
 * The bitrate is a sender parameter and changes live. DTX and RED are not:
 * Chrome ignores `encoding.dtx` and `encoding.codec` for audio, and takes both
 * from the remote description. So the monitor only says what it wants
 * (`applySdp`), and the hook rewrites the far side's description on our end
 * and renegotiates (see `shapeOpusSend`).
 */

import { UPLINK_BUDGET } from "./voice-bitrate";

export const QOS_POLL_MS = 2000;
/** Weight of the newest sample; about three polls (6 s) of memory. */
export const QOS_ALPHA = 0.35;
/** `setActiveSpeaker` id for this seat. */
export const SELF_SPEAKER = "self";

const SEVERE_SPEAKING_BITRATE = 32_000;
const SEVERE_IDLE_BITRATE = 16_000;
const FLOOR_BITRATE = 16_000;
/** Speech gains nothing above this, and RED doubles whatever it is given. */
const LOSSY_MAX_BITRATE = 64_000;
/** A link has to look better for this many polls in a row before it is trusted again. */
const RECOVER_POLLS = 4;
/** Fewer packets than this in one poll (muted, DTX) say nothing about loss. */
const MIN_LOSS_SAMPLE = 10;
/** A pause between words is not the end of a turn. */
const SPEAKER_HOLD_MS = 2000;
/** Share of the browser's own estimate of the path we are willing to fill with voice. */
const ESTIMATE_SHARE = 0.8;

export type QosState = "normal" | "lossy" | "severe";

/** Smoothed health of one connection. */
export interface QosMetrics {
  /** Fraction of packets lost, 0–1. */
  loss: number;
  jitterMs: number;
  rttMs: number;
}

/** What the far side's description has to say for our encoder to do it. */
export interface QosSdpShape {
  dtx: boolean;
  redundancy: boolean;
}

export interface QosProfile extends QosSdpShape {
  state: QosState;
  /** Encoder ceiling for the voice sender, bits per second. */
  bitrate: number;
}

/** Counters read from one `getStats()` report. */
export interface QosSample {
  packetsSent: number;
  /** Lost on the way to them, as they report it; null until they have. */
  remoteLost: number | null;
  packetsReceived: number;
  packetsLost: number;
  /** Jitter in milliseconds: theirs on what we send if known, else ours on what they send. */
  jitterMs: number | null;
  rttMs: number | null;
  availableOutgoingBitrate: number | null;
}

/** The stats fields this reads; every one is optional in practice. */
interface StatEntry {
  id?: string;
  type?: string;
  kind?: string;
  mediaType?: string;
  packetsLost?: number;
  packetsSent?: number;
  packetsReceived?: number;
  jitter?: number;
  roundTripTime?: number;
  currentRoundTripTime?: number;
  availableOutgoingBitrate?: number;
  selectedCandidatePairId?: string;
  nominated?: boolean;
  state?: string;
}

type QosPeer = Pick<RTCPeerConnection, "connectionState" | "getStats" | "getSenders">;

export interface VoiceQosOptions {
  /**
   * The senders carrying the microphone to this peer. Default: every audio
   * sender. The hook leaves screen-share audio out, which has its own budget.
   */
  voiceSenders?: (peerId: string, pc: QosPeer) => RTCRtpSender[];
  /**
   * Make the encoder to `peerId` use DTX and/or RED. Resolves true once the
   * change is on its way, false to be asked again on the next poll. Without
   * it the monitor only moves bitrates.
   */
  applySdp?: (peerId: string, shape: QosSdpShape) => boolean | Promise<boolean>;
  /** Told whenever a peer's state changes (logging, a quality badge). */
  onState?: (peerId: string, state: QosState, metrics: QosMetrics) => void;
  intervalMs?: number;
  now?: () => number;
}

interface PeerEntry {
  pc: QosPeer;
  metrics: QosMetrics | null;
  state: QosState;
  /** Polls in a row that looked better than `state`. */
  better: number;
  last: QosSample | null;
  available: number | null;
  profile: QosProfile | null;
  sdpApplied: QosSdpShape;
  sdpBusy: boolean;
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const NO_SHAPE: QosSdpShape = { dtx: false, redundancy: false };
const RANK: Record<QosState, number> = { normal: 0, lossy: 1, severe: 2 };

/** One step of the moving average; the first sample is taken as it is. */
export function ewma(previous: number | null, current: number, alpha: number = QOS_ALPHA): number {
  return previous === null ? current : alpha * current + (1 - alpha) * previous;
}

/** Picks the counters this cares about out of a stats report. */
export function readSample(report: { forEach: (callback: (value: unknown) => void) => void }): QosSample {
  const entries: StatEntry[] = [];
  report.forEach((value) => {
    if (value && typeof value === "object") entries.push(value as StatEntry);
  });
  const audio = (entry: StatEntry) => (entry.kind ?? entry.mediaType) === "audio";
  const sample: QosSample = {
    packetsSent: 0,
    remoteLost: null,
    packetsReceived: 0,
    packetsLost: 0,
    jitterMs: null,
    rttMs: null,
    availableOutgoingBitrate: null,
  };
  let remoteJitter: number | null = null;
  let localJitter: number | null = null;
  let remoteRtt: number | null = null;
  let selected: string | undefined;
  for (const entry of entries) {
    if (entry.type === "transport" && entry.selectedCandidatePairId) selected = entry.selectedCandidatePairId;
  }
  for (const entry of entries) {
    if (entry.type === "outbound-rtp" && audio(entry)) {
      if (isNumber(entry.packetsSent)) sample.packetsSent += entry.packetsSent;
    } else if (entry.type === "remote-inbound-rtp" && audio(entry)) {
      if (isNumber(entry.packetsLost)) sample.remoteLost = (sample.remoteLost ?? 0) + entry.packetsLost;
      if (isNumber(entry.jitter)) remoteJitter = Math.max(remoteJitter ?? 0, entry.jitter * 1000);
      if (isNumber(entry.roundTripTime)) remoteRtt = Math.max(remoteRtt ?? 0, entry.roundTripTime * 1000);
    } else if (entry.type === "inbound-rtp" && audio(entry)) {
      if (isNumber(entry.packetsLost)) sample.packetsLost += entry.packetsLost;
      if (isNumber(entry.packetsReceived)) sample.packetsReceived += entry.packetsReceived;
      if (isNumber(entry.jitter)) localJitter = Math.max(localJitter ?? 0, entry.jitter * 1000);
    } else if (entry.type === "candidate-pair") {
      const active = selected ? entry.id === selected : entry.nominated === true && entry.state === "succeeded";
      if (!active) continue;
      if (isNumber(entry.currentRoundTripTime)) sample.rttMs = entry.currentRoundTripTime * 1000;
      if (isNumber(entry.availableOutgoingBitrate) && entry.availableOutgoingBitrate > 0) {
        sample.availableOutgoingBitrate = entry.availableOutgoingBitrate;
      }
    }
  }
  sample.jitterMs = remoteJitter ?? localJitter;
  sample.rttMs ??= remoteRtt;
  return sample;
}

/**
 * Loss between two samples, 0–1: what the far side lost of what we sent if it
 * says, otherwise what we lost of what it sent. null when too little moved to
 * tell (and after a counter reset).
 */
export function lossBetween(previous: QosSample, current: QosSample): number | null {
  const sent = current.packetsSent - previous.packetsSent;
  if (current.remoteLost !== null && previous.remoteLost !== null && sent >= MIN_LOSS_SAMPLE) {
    // The far side's count can step back when a late packet turns up.
    return Math.min(1, Math.max(0, current.remoteLost - previous.remoteLost) / sent);
  }
  const lost = Math.max(0, current.packetsLost - previous.packetsLost);
  const received = current.packetsReceived - previous.packetsReceived;
  if (received < 0 || lost + received < MIN_LOSS_SAMPLE) return null;
  return lost / (lost + received);
}

/**
 * The state the numbers ask for. Between the bands (1–2 % loss, or jitter past
 * 30 ms with little loss) a link keeps the state it has, so it does not flap.
 */
export function classifyLink(metrics: QosMetrics, previous: QosState = "normal"): QosState {
  if (metrics.loss > 0.08 || metrics.rttMs > 350) return "severe";
  if (metrics.loss >= 0.02) return "lossy";
  if (metrics.loss < 0.01 && metrics.jitterMs < 30) return "normal";
  return previous === "normal" ? "normal" : "lossy";
}

/** What one link wants before the uplink budget has its say. */
export function profileFor(
  state: QosState,
  target: number,
  options: { speaking: boolean; shapeable: boolean; available?: number | null },
): QosProfile {
  const redundancy = state === "lossy" && options.shapeable;
  let bitrate =
    state === "severe"
      ? Math.min(target, options.speaking ? SEVERE_SPEAKING_BITRATE : SEVERE_IDLE_BITRATE)
      : state === "lossy"
        ? Math.min(target, LOSSY_MAX_BITRATE)
        : target;
  if (options.available) {
    bitrate = Math.min(bitrate, (options.available * ESTIMATE_SHARE) / (redundancy ? 2 : 1));
  }
  return {
    state,
    bitrate: Math.round(Math.max(Math.min(FLOOR_BITRATE, target), bitrate)),
    dtx: state === "severe" && options.shapeable,
    redundancy,
  };
}

/**
 * Fits the profiles under the uplink budget. A copy sent with RED costs twice
 * its bitrate. Links already at the floor keep it; the rest shrink together.
 */
export function fitBudget<T extends { bitrate: number; redundancy: boolean }>(
  profiles: T[],
  budget: number = UPLINK_BUDGET,
): T[] {
  const cost = (profile: { bitrate: number; redundancy: boolean }) => profile.bitrate * (profile.redundancy ? 2 : 1);
  let fitted = profiles;
  // Each pass pins at least one more link to the floor, so this ends.
  for (let pass = 0; pass <= profiles.length; pass++) {
    const total = fitted.reduce((sum, profile) => sum + cost(profile), 0);
    if (total <= budget) break;
    const fixed = fitted.filter((profile) => profile.bitrate <= FLOOR_BITRATE);
    const flexible = total - fixed.reduce((sum, profile) => sum + cost(profile), 0);
    if (flexible <= 0) break;
    const scale = Math.max(0, budget - (total - flexible)) / flexible;
    fitted = fitted.map((profile) =>
      profile.bitrate <= FLOOR_BITRATE
        ? profile
        : { ...profile, bitrate: Math.max(FLOOR_BITRATE, Math.floor(profile.bitrate * scale)) },
    );
  }
  return fitted;
}

export class VoiceQosMonitor {
  private readonly peers = new Map<string, PeerEntry>();
  private readonly options: VoiceQosOptions;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private target = 64_000;
  private speaker: string | null = null;
  private selfSpokeAt = Number.NEGATIVE_INFINITY;
  /** Bumped by destroy(), so a poll that was mid-flight applies nothing. */
  private generation = 0;

  constructor(options: VoiceQosOptions = {}) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
  }

  /** Start watching a connection. Registering an id again replaces the old one. */
  registerPeer(peerId: string, pc: QosPeer): void {
    this.peers.set(peerId, {
      pc,
      metrics: null,
      state: "normal",
      better: 0,
      last: null,
      available: null,
      profile: null,
      sdpApplied: NO_SHAPE,
      sdpBusy: false,
    });
    this.timer ??= setInterval(() => void this.poll(), this.options.intervalMs ?? QOS_POLL_MS);
    this.arbitrate();
  }

  unregisterPeer(peerId: string): void {
    if (!this.peers.delete(peerId)) return;
    if (this.peers.size === 0) this.stop();
    else this.arbitrate();
  }

  /**
   * Who holds the floor: a peer id, SELF_SPEAKER for this seat, or null for
   * silence. Cheap to call on every level tick.
   */
  setActiveSpeaker(peerId: string | null): void {
    const wasSpeaking = this.speaking();
    this.speaker = peerId;
    if (peerId === SELF_SPEAKER) this.selfSpokeAt = this.now();
    // Starting to talk is acted on at once; stopping waits for the next poll.
    if (!wasSpeaking && this.speaking()) this.arbitrate();
  }

  /** The bitrate a healthy link gets (see `voiceBitrate`). */
  setTarget(bitrate: number): void {
    if (!isNumber(bitrate) || bitrate <= 0 || bitrate === this.target) return;
    this.target = bitrate;
    this.arbitrate();
  }

  /** The profile last decided for a peer, and the numbers behind it. */
  inspect(peerId: string): { profile: QosProfile; metrics: QosMetrics | null } | null {
    const entry = this.peers.get(peerId);
    return entry?.profile ? { profile: entry.profile, metrics: entry.metrics } : null;
  }

  /** Stops polling and forgets every peer. The monitor can be used again afterwards. */
  destroy(): void {
    this.generation += 1;
    this.peers.clear();
    this.stop();
    this.speaker = null;
    this.selfSpokeAt = Number.NEGATIVE_INFINITY;
  }

  /** One round: read every connected peer's stats, then decide. Runs on the timer. */
  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    const generation = this.generation;
    try {
      const reads = [...this.peers].map(async ([peerId, entry]) => {
        if (entry.pc.connectionState !== "connected") return;
        try {
          const sample = readSample(await entry.pc.getStats());
          // Gone, or replaced by a rebuilt connection, while the stats were read.
          if (generation === this.generation && this.peers.get(peerId) === entry) this.absorb(peerId, entry, sample);
        } catch {
          // A connection that closed mid-read; it is unregistered by its owner.
        }
      });
      await Promise.all(reads);
      if (generation === this.generation) this.arbitrate();
    } finally {
      this.polling = false;
    }
  }

  private stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private speaking(): boolean {
    return this.speaker === SELF_SPEAKER || this.now() - this.selfSpokeAt < SPEAKER_HOLD_MS;
  }

  /** Folds one sample into a peer's averages and moves its state. */
  private absorb(peerId: string, entry: PeerEntry, sample: QosSample): void {
    const previous = entry.last;
    entry.last = sample;
    entry.available = sample.availableOutgoingBitrate;
    // The first sample only sets the counters' starting point.
    if (!previous) return;
    const loss = lossBetween(previous, sample);
    const before = entry.metrics;
    entry.metrics = {
      loss: loss === null ? (before?.loss ?? 0) : ewma(before?.loss ?? null, loss),
      jitterMs: sample.jitterMs === null ? (before?.jitterMs ?? 0) : ewma(before?.jitterMs ?? null, sample.jitterMs),
      rttMs: sample.rttMs === null ? (before?.rttMs ?? 0) : ewma(before?.rttMs ?? null, sample.rttMs),
    };
    const wanted = classifyLink(entry.metrics, entry.state);
    let next = entry.state;
    if (RANK[wanted] > RANK[entry.state]) {
      // Getting worse is believed at once.
      next = wanted;
      entry.better = 0;
    } else if (RANK[wanted] < RANK[entry.state]) {
      // Getting better has to last, and a silent poll proves nothing about loss.
      if (loss !== null || entry.state !== "severe") entry.better += 1;
      if (entry.better >= RECOVER_POLLS) {
        next = wanted;
        entry.better = 0;
      }
    } else {
      entry.better = 0;
    }
    if (next !== entry.state) {
      entry.state = next;
      this.options.onState?.(peerId, next, entry.metrics);
    }
  }

  /** Decides every peer's profile under the shared budget and applies it. */
  private arbitrate(): void {
    if (this.peers.size === 0) return;
    const speaking = this.speaking();
    const shapeable = Boolean(this.options.applySdp);
    const entries = [...this.peers];
    const profiles = fitBudget(
      entries.map(([, entry]) =>
        profileFor(entry.state, this.target, { speaking, shapeable, available: entry.available }),
      ),
    );
    entries.forEach(([peerId, entry], index) => {
      const profile = profiles[index];
      entry.profile = profile;
      this.applyBitrate(peerId, entry, profile.bitrate);
      this.applyShape(peerId, entry, profile);
    });
  }

  private applyBitrate(peerId: string, entry: PeerEntry, bitrate: number): void {
    const senders = this.options.voiceSenders
      ? this.options.voiceSenders(peerId, entry.pc)
      : entry.pc.getSenders().filter((sender) => sender.track?.kind === "audio");
    for (const sender of senders) {
      try {
        const parameters = sender.getParameters();
        // No encodings until the first negotiation finishes; the next round gets it.
        if (!parameters.encodings?.length) continue;
        if (parameters.encodings.every((encoding) => encoding.maxBitrate === bitrate)) continue;
        for (const encoding of parameters.encodings) encoding.maxBitrate = bitrate;
        void sender.setParameters(parameters).catch(() => undefined);
      } catch {
        // A sender on a closed connection.
      }
    }
  }

  private applyShape(peerId: string, entry: PeerEntry, profile: QosProfile): void {
    const apply = this.options.applySdp;
    if (!apply || entry.sdpBusy) return;
    const wanted: QosSdpShape = { dtx: profile.dtx, redundancy: profile.redundancy };
    if (wanted.dtx === entry.sdpApplied.dtx && wanted.redundancy === entry.sdpApplied.redundancy) return;
    entry.sdpBusy = true;
    void Promise.resolve()
      .then(() => apply(peerId, wanted))
      .then(
        (done) => {
          if (done) entry.sdpApplied = wanted;
        },
        () => undefined,
      )
      .finally(() => {
        entry.sdpBusy = false;
      });
  }
}
