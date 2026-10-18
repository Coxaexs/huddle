import { basePath } from "./client";
import type { ScreenEcho } from "./screen-echo";

/**
 * The Windows desktop app's per-app screen-share audio.
 *
 * There the shell captures the shared window's app, or every app except
 * Hoffle for a whole screen (desktop/native/app-audio.cpp), instead of the
 * whole output device, so the room's own voices are never in it to begin
 * with. It arrives as raw PCM over `window.huddle.appAudio`; this turns it
 * into the share's audio track. Null anywhere else (a browser, an older app,
 * a Windows too old for per-app capture): the share then carries the
 * browser's own audio track, through cancelScreenEcho.
 */

interface AppAudioBridge {
  active(): Promise<boolean>;
  onData(callback: (chunk: Uint8Array) => void): () => void;
  stop(): void;
}

function bridge(): AppAudioBridge | null {
  if (typeof window === "undefined") return null;
  const desktop = (window as unknown as { huddle?: { appAudio?: AppAudioBridge } }).huddle;
  return desktop?.appAudio ?? null;
}

export async function desktopAppAudio(): Promise<ScreenEcho | null> {
  const appAudio = bridge();
  if (!appAudio || !(await appAudio.active().catch(() => false))) return null;
  let context: AudioContext | null = null;
  try {
    context = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
    if (context.state === "suspended") await context.resume().catch(() => undefined);
    // Versioned like the mic worklet: bump it whenever the worklet changes.
    await context.audioWorklet.addModule(`${basePath}/pcm-feed-worklet.js?v=1`);
  } catch {
    void context?.close().catch(() => undefined);
    appAudio.stop();
    return null;
  }
  const ctx = context;
  const node = new AudioWorkletNode(ctx, "pcm-feed", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  const destination = new MediaStreamAudioDestinationNode(ctx, { channelCount: 2 });
  node.connect(destination);
  const unsubscribe = appAudio.onData((chunk) => {
    // A copy: the bytes may not sit on a 4-byte boundary, and it is transferred.
    const samples = new Float32Array(chunk.slice().buffer);
    node.port.postMessage(samples, [samples.buffer]);
  });
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
      unsubscribe();
      appAudio.stop();
      node.port.postMessage("stop");
      node.disconnect();
      track.stop();
      ctx.onstatechange = null;
      void ctx.close().catch(() => undefined);
    },
  };
}
