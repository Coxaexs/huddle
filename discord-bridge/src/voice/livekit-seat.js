/**
 * A Discord person's media in Hoffle: their own LiveKit participant, under the
 * identity of their hub seat, publishing their voice as a microphone track.
 *
 * One of a room's Discord people is also the "ears": it subscribes to the
 * Hoffle people's audio so the bridge can mix it for Discord. Whispers never
 * reach it unless whispered to that seat, because LiveKit's subscription
 * permissions are what keep a whisper private.
 */
import {
  AudioFrame,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
} from "@livekit/rtc-node";
import { SAMPLE_RATE } from "./dsp.js";

/** LiveKit's source keeps at most this much queued; beyond it we skip ahead. */
const MAX_QUEUED_MS = 300;

export class LiveKitSeat {
  /**
   * @param {{ hoffleUrl: string, basePath: string, hoffleToken: string }} cfg
   * @param {{ channelId: string, connectionId: string, isOurs: (identity: string) => boolean,
   *   onAudio: (key: string, samples: Int16Array) => void, onGone: (key: string) => void,
   *   onDown: () => void }} options
   */
  constructor(cfg, options) {
    this.cfg = cfg;
    this.options = options;
    this.room = null;
    this.source = null;
    this.ears = false;
    this.readers = new Map();
    this.pending = Promise.resolve();
    this.closed = false;
    this.publishing = false;
    /** Times the queue ran too far ahead and was cleared (shown in /healthz). */
    this.resets = 0;
  }

  async connect() {
    const query = new URLSearchParams({ channelId: this.options.channelId, connectionId: this.options.connectionId });
    const response = await fetch(`${this.cfg.hoffleUrl}${this.cfg.basePath}/api/voice/token?${query}`, {
      headers: { Authorization: `Bot ${this.cfg.hoffleToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    const grant = await response.json().catch(() => ({}));
    if (!response.ok || !grant.enabled || !grant.token) {
      throw new Error(grant.error || grant.reason || `Hoffle answered ${response.status} for a voice token`);
    }
    if (this.closed) return;
    const room = new Room();
    this.room = room;
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind !== TrackKind.KIND_AUDIO || this.options.isOurs(participant.identity)) return;
      this.listen(`${participant.identity}/${publication.sid}`, track);
    });
    room.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
      this.stopListening(`${participant.identity}/${publication.sid}`);
    });
    room.on(RoomEvent.TrackPublished, (publication, participant) => {
      // New Hoffle audio while we are the ears: take it.
      if (this.ears && !this.options.isOurs(participant.identity)) publication.setSubscribed(true);
    });
    room.on(RoomEvent.Disconnected, () => {
      if (this.room !== room) return;
      for (const key of [...this.readers.keys()]) this.stopListening(key);
      if (!this.closed) this.options.onDown();
    });
    await room.connect(grant.url, grant.token, { autoSubscribe: false, dynacast: false });
    if (this.closed) {
      await room.disconnect().catch(() => undefined);
      return;
    }
    this.source = new AudioSource(SAMPLE_RATE, 1, 1000);
    const track = LocalAudioTrack.createAudioTrack("microphone", this.source);
    const options = new TrackPublishOptions();
    options.source = TrackSource.SOURCE_MICROPHONE;
    try {
      await room.localParticipant.publishTrack(track, options);
      this.publishing = true;
    } catch {
      // A seat that may not be heard (stage audience, muted by a moderator)
      // gets a listen-only token: it can still be the ears.
      this.publishing = false;
    }
    if (this.ears) this.setEars(true);
  }

  /** One frame of this person's voice (mono Int16 at 48 kHz). */
  capture(samples) {
    if (!this.source || !this.publishing || this.closed) return;
    if (this.source.queuedDuration > MAX_QUEUED_MS) {
      this.source.clearQueue();
      this.resets++;
    }
    const frame = new AudioFrame(samples, SAMPLE_RATE, 1, samples.length);
    this.pending = this.pending.then(() => this.source?.captureFrame(frame)).catch(() => undefined);
  }

  /** Start or stop hearing the Hoffle people for the mix. */
  setEars(on) {
    this.ears = on;
    if (!this.room) return;
    for (const participant of this.room.remoteParticipants.values()) {
      if (this.options.isOurs(participant.identity)) continue;
      for (const publication of participant.trackPublications.values()) {
        if (publication.kind === TrackKind.KIND_AUDIO) publication.setSubscribed(on);
      }
    }
    if (!on) for (const key of [...this.readers.keys()]) this.stopListening(key);
  }

  listen(key, track) {
    if (!this.ears || this.readers.has(key)) return;
    const reader = new AudioStream(track, { sampleRate: SAMPLE_RATE, numChannels: 1 }).getReader();
    this.readers.set(key, reader);
    void (async () => {
      try {
        while (this.readers.get(key) === reader) {
          const { value, done } = await reader.read();
          if (done) break;
          this.options.onAudio(key, value.data);
        }
      } catch {
        // The track went away.
      } finally {
        if (this.readers.get(key) === reader) this.readers.delete(key);
        this.options.onGone(key);
      }
    })();
  }

  stopListening(key) {
    const reader = this.readers.get(key);
    if (!reader) return;
    this.readers.delete(key);
    reader.cancel().catch(() => undefined);
    this.options.onGone(key);
  }

  async close() {
    this.closed = true;
    for (const key of [...this.readers.keys()]) this.stopListening(key);
    const room = this.room;
    this.room = null;
    this.source = null;
    if (room) await room.disconnect().catch(() => undefined);
  }
}
