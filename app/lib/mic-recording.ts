/**
 * "Record a test": a few seconds of your microphone, played back the way the
 * room hears it.
 *
 * The processed track is recorded as Opus at the bitrate a small call sends
 * (see `voiceBitrate`), so the playback carries the codec as well as the
 * chain — gate, auto-gain, suppression, clarity. The untouched capture is
 * recorded alongside it at a much higher rate: comparing the two is how a
 * problem like "they can hear me swallow" gets diagnosed, rather than guessed.
 */

import type { MicChain } from "./mic-chain";

export const TEST_SECONDS = 10;
/** What a call with one or two listeners sends; see `voiceBitrate` in use-voice. */
const ROOM_BITRATE = 64_000;
const RAW_BITRATE = 256_000;

export interface MicTestRecording {
  /** What the room hears. */
  processed: Blob;
  /** What the microphone captured, before any of our processing. */
  raw: Blob;
}

function opusType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

export function canRecordMicTest(): boolean {
  return opusType() !== undefined;
}

/** File extension for a recording's container, for saving it. */
export function recordingExtension(blob: Blob): string {
  if (blob.type.includes("ogg")) return "ogg";
  if (blob.type.includes("mp4")) return "m4a";
  return "webm";
}

function record(stream: MediaStream, bitrate: number, mimeType: string) {
  const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: bitrate });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
    recorder.onerror = () => reject(new Error("recording failed"));
  });
  recorder.start();
  return { recorder, done };
}

/**
 * Records `seconds` of `chain`, calling `onProgress` with the seconds elapsed.
 * Resolves early, with what was recorded so far, if `signal` aborts.
 */
export async function recordMicTest(
  chain: MicChain,
  { seconds = TEST_SECONDS, onProgress, signal }: {
    seconds?: number;
    onProgress?: (elapsed: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<MicTestRecording> {
  const mimeType = opusType();
  if (!mimeType) throw new Error("This browser cannot record audio.");
  // A suspended graph records silence, and on a phone that is easy to hit.
  chain.resume();

  const processed = record(chain.stream, ROOM_BITRATE, mimeType);
  const raw = record(new MediaStream(chain.raw.getAudioTracks()), RAW_BITRATE, mimeType);

  const started = performance.now();
  await new Promise<void>((resolve) => {
    const tick = window.setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      onProgress?.(Math.min(seconds, elapsed));
      if (elapsed >= seconds) finish();
    }, 100);
    const finish = () => {
      window.clearInterval(tick);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    signal?.addEventListener("abort", finish);
  });

  for (const { recorder } of [processed, raw]) {
    if (recorder.state !== "inactive") recorder.stop();
  }
  const [processedBlob, rawBlob] = await Promise.all([processed.done, raw.done]);
  return { processed: processedBlob, raw: rawBlob };
}
