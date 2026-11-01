/**
 * Plays Hoffle sound into one Discord voice connection: the main bot's (the
 * mix of everyone without a helper) or a voice helper's (one Hoffle person).
 *
 * Frames go into its mixer as they arrive from LiveKit; every 20 ms step()
 * takes one mixed frame and sends it on as Opus. LiveKit keeps handing over
 * (silent) frames from a quiet microphone, so a burst starts only on real
 * sound and ends after a moment of quiet: whoever this connection is shows as
 * talking on Discord exactly while there is someone to hear.
 */
import { Readable } from "node:stream";
import { NoSubscriberBehavior, StreamType, createAudioPlayer, createAudioResource } from "@discordjs/voice";
import { Mixer, monoToStereo, peak } from "./dsp.js";
import { createOpus } from "./opus.js";

/** A burst to Discord ends after this much quiet. */
const QUIET_FRAMES = 15;
/** Quieter than this (about -48 dBFS) is silence, not someone talking. */
export const SPEECH_PEAK = 0.004;
/** Don't let more than this much wait to be played on Discord. */
const MAX_BURST_QUEUE = 8;

export class DiscordSpeaker {
  /**
   * @param {{ connection?: import("@discordjs/voice").VoiceConnection | null,
   *   player?: { play: (resource: unknown) => void, stop?: (force?: boolean) => void },
   *   log?: (...parts: unknown[]) => void }} [options]
   *   `player` stands in for Discord's audio player in tests.
   */
  constructor({ connection = null, player = null, log = () => undefined } = {}) {
    this.mixer = new Mixer();
    if (player) {
      this.player = player;
    } else {
      this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
      this.player.on("error", (error) => log("voice: Discord player:", error?.message || error));
    }
    connection?.subscribe(this.player);
    // The room can include music and screen-share sound, not only voices.
    this.encoder = createOpus({ music: true, bitrate: 64_000 });
    this.burst = null;
    this.quiet = 0;
    this.stopped = false;
  }

  /** Every 20 ms: one frame for Discord. */
  step() {
    if (this.stopped) return;
    const frame = this.mixer.pull();
    const loud = frame !== null && peak(frame) > SPEECH_PEAK;
    if (loud) {
      this.quiet = 0;
      if (!this.burst) {
        this.burst = new Readable({ objectMode: true, read() {} });
        this.player.play(createAudioResource(this.burst, { inputType: StreamType.Opus }));
      }
    } else if (this.burst && ++this.quiet > QUIET_FRAMES) {
      this.burst.push(null);
      this.burst = null;
      return;
    }
    // The quiet tail of a burst still plays, so words aren't clipped.
    if (this.burst && frame && this.burst.readableLength < MAX_BURST_QUEUE) {
      this.burst.push(this.encoder.encode(monoToStereo(frame)));
    }
  }

  /** Whether it is sending sound to Discord right now. */
  get talking() {
    return Boolean(this.burst);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.burst?.push(null);
    this.burst = null;
    this.player?.stop?.(true);
    this.encoder.free();
    this.mixer = new Mixer();
  }
}
