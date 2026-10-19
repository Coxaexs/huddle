import { basePath } from "./client";
import type { ScreenEcho } from "./screen-echo";

/**
 * The desktop apps' per-app screen-share audio.
 *
 * There the shell captures the shared window's app, or every app except
 * Hoffle for a whole screen (desktop/native/app-audio.cpp on Windows,
 * app-audio-mac.m on macOS), instead of the whole output device, so the
 * room's own voices are never in it to begin with. It arrives as raw PCM over
 * `window.huddle.appAudio` (or Tauri events in Hoffle Lite); this turns it
 * into the share's audio track. Null anywhere else (a browser, an older app,
 * a system too old for per-app capture): the share then carries the
 * browser's own audio track, through cancelScreenEcho.
 *
 * The Electron app starts the capture itself, from its own source picker.
 * Shells on a system webview (the native apps, Lite) never see which source
 * was picked, so they offer `start`, which the page calls once it has the
 * share's video.
 */

interface AppAudioBridge {
  /** Whether `start` can work here (an older shell may lack the helper). */
  available?(): Promise<boolean>;
  /** Starts capturing for the share just begun; resolves false where it cannot. */
  start?(target: { windowId?: string }): Promise<boolean>;
  active(): Promise<boolean>;
  onData(callback: (chunk: Uint8Array) => void): () => void;
  stop(): void;
}

interface TauriApi {
  core?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
  event?: { listen?: (name: string, handler: (event: { payload: unknown }) => void) => Promise<() => void> };
}

function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Hoffle Lite: the same bridge over Tauri commands and events. */
function tauriBridge(tauri: TauriApi): AppAudioBridge | null {
  const invoke = tauri.core?.invoke;
  const listen = tauri.event?.listen;
  if (!invoke || !listen) return null;
  let started = false;
  return {
    // Lite builds from before per-app audio have no such command, and say no.
    available: async () => Boolean(await invoke("app_audio_available").catch(() => false)),
    async start(target) {
      started = Boolean(await invoke("app_audio_start", { windowId: target.windowId ?? null }).catch(() => false));
      return started;
    },
    active: () => Promise.resolve(started),
    onData(callback) {
      let off: (() => void) | null = null;
      let gone = false;
      void listen("app-audio:pcm", (event) => {
        if (typeof event.payload === "string") callback(fromBase64(event.payload));
      })
        .then((stop) => {
          if (gone) stop();
          else off = stop;
        })
        .catch(() => undefined);
      return () => {
        gone = true;
        off?.();
      };
    },
    stop() {
      started = false;
      void invoke("app_audio_stop").catch(() => undefined);
    },
  };
}

function bridge(): AppAudioBridge | null {
  if (typeof window === "undefined") return null;
  const shell = window as unknown as { huddle?: { appAudio?: AppAudioBridge }; __TAURI__?: TauriApi };
  if (shell.huddle?.appAudio) return shell.huddle.appAudio;
  return shell.__TAURI__ ? tauriBridge(shell.__TAURI__) : null;
}

/**
 * Whether the shell captures share audio itself once asked (see `start`): the
 * share then asks the browser for video only, or there would be two.
 */
export async function shellCapturesShareAudio(): Promise<boolean> {
  const appAudio = bridge();
  if (typeof appAudio?.start !== "function") return false;
  return appAudio.available ? Boolean(await appAudio.available().catch(() => false)) : true;
}

/** The native window id in a Chromium screen-capture track's label ("window:<id>:0"). */
export function sharedWindowId(video: MediaStreamTrack | undefined): string | undefined {
  return /^window:(\d+):/.exec(video?.label ?? "")?.[1];
}

export async function desktopAppAudio(video?: MediaStreamTrack): Promise<ScreenEcho | null> {
  const appAudio = bridge();
  if (!appAudio) return null;
  if (appAudio.start && !(await appAudio.start({ windowId: sharedWindowId(video) }).catch(() => false))) return null;
  if (!(await appAudio.active().catch(() => false))) return null;
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
