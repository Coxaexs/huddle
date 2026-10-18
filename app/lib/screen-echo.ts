import { basePath } from "./client";
import { watchEchoSources, type EchoSource } from "./echo-reference";

/**
 * Takes the room's own voices back out of shared screen audio.
 *
 * Whole-screen shares capture all system audio, voices included. Chromium's
 * `restrictOwnAudio` leaves this page's playback out, but only by process, so
 * behind an audio router (SteelSeries Sonar, Voicemeeter) that re-plays
 * everything from its own process it misses, and the room hears itself. This
 * runs the shared audio through `public/screen-echo-worklet.js`, with what
 * the page is playing (see `echo-reference.ts`) as the reference. Where there
 * is no echo the worklet leaves the audio as it was, so it runs on every share
 * with audio rather than trying to guess which setups need it.
 */

export interface ScreenEcho {
  /** The cleaned audio, to publish in place of the captured track. */
  track: MediaStreamTrack;
  /** Stops the cleaned track and the captured one, and frees the audio graph. */
  stop(): void;
}

type Voice = { source: MediaStreamAudioSourceNode; gain: GainNode; panner: StereoPannerNode };

/** Null when Web Audio or worklets are unavailable: share the raw track then. */
export async function cancelScreenEcho(raw: MediaStreamTrack): Promise<ScreenEcho | null> {
  if (typeof AudioWorkletNode === "undefined") return null;
  let context: AudioContext | null = null;
  try {
    context = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
    if (context.state === "suspended") await context.resume().catch(() => undefined);
    // Versioned like the mic worklet: bump it whenever the worklet changes.
    await context.audioWorklet.addModule(`${basePath}/screen-echo-worklet.js?v=1`);
  } catch {
    void context?.close().catch(() => undefined);
    return null;
  }
  const ctx = context;

  const capture = ctx.createMediaStreamSource(new MediaStream([raw]));
  const node = new AudioWorkletNode(ctx, "screen-echo", {
    numberOfInputs: 2,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
  });
  const destination = new MediaStreamAudioDestinationNode(ctx, { channelCount: 2 });
  capture.connect(node, 0, 0);
  node.connect(destination);

  // The reference bus: every voice at the level and pan it is heard at.
  const bus = ctx.createGain();
  bus.channelCount = 2;
  bus.channelCountMode = "explicit";
  bus.connect(node, 0, 1);
  const voices = new Map<string, Voice & { stream: MediaStream }>();
  const drop = (key: string) => {
    const voice = voices.get(key);
    if (!voice) return;
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.panner.disconnect();
    voices.delete(key);
  };
  const sync = (sources: EchoSource[]) => {
    const keep = new Set<string>();
    const now = ctx.currentTime;
    for (const { key, stream, gain, pan } of sources) {
      if (stream.getAudioTracks().length === 0) continue;
      keep.add(key);
      let voice = voices.get(key);
      if (voice && voice.stream !== stream) {
        drop(key);
        voice = undefined;
      }
      if (!voice) {
        try {
          const source = ctx.createMediaStreamSource(stream);
          const level = ctx.createGain();
          const panner = ctx.createStereoPanner();
          source.connect(level).connect(panner).connect(bus);
          voice = { source, gain: level, panner, stream };
          voices.set(key, voice);
        } catch {
          continue;
        }
      }
      voice.gain.gain.setTargetAtTime(gain, now, 0.02);
      voice.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), now, 0.02);
    }
    for (const key of [...voices.keys()]) if (!keep.has(key)) drop(key);
  };
  const unwatch = watchEchoSources(sync);

  // Starting a capture can reset the OS audio devices under the page and
  // leave a context stalled; nudge it back rather than send silence.
  ctx.onstatechange = () => {
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  };

  const track = destination.stream.getAudioTracks()[0];
  let stopped = false;
  return {
    track,
    stop() {
      if (stopped) return;
      stopped = true;
      unwatch();
      for (const key of [...voices.keys()]) drop(key);
      node.port.postMessage({ type: "stop" });
      capture.disconnect();
      node.disconnect();
      bus.disconnect();
      track.stop();
      raw.stop();
      ctx.onstatechange = null;
      void ctx.close().catch(() => undefined);
    },
  };
}
