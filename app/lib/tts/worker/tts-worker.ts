/**
 * The TTS worker. Built on its own by scripts/build-tts-worker.mjs into
 * public/assets/tts/tts-worker.js, so synthesis never blocks the chat.
 *
 * In:  { type: "init", basePath } then { type: "speak", id, text, lang, speed?, speaker? }
 * Out: { type: "audio", id, audio: Float32Array, sampleRate } | { type: "error", id, message }
 */
import { configureRuntime } from "./runtime";
import { EnglishVoice, ENGLISH_RATE } from "./english";
import { MaleEnglishVoice, KITTEN_RATE } from "./kitten";
import { TurkishVoice, TURKISH_RATE } from "./turkish";

type Request =
  | { type: "init"; basePath: string }
  | { type: "speak"; id: number; text: string; lang: "tr" | "en"; speed?: number; speaker?: "default" | "male" };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

let english: Promise<EnglishVoice> | null = null;
let maleEnglish: Promise<MaleEnglishVoice> | null = null;
let turkish: Promise<TurkishVoice> | null = null;
// One synthesis at a time; the wasm runtime is single-threaded anyway.
let queue: Promise<void> = Promise.resolve();

async function speak(id: number, text: string, lang: "tr" | "en", speed = 1, speaker = "default") {
  const male = lang === "en" && speaker === "male";
  // Both models set their own speaking rate; keep it in the range they handle.
  speed = Math.min(2, Math.max(0.5, Number.isFinite(speed) ? speed : 1));
  try {
    let audio: Float32Array;
    let sampleRate: number;
    if (lang === "tr") {
      turkish ??= TurkishVoice.load();
      audio = await (await turkish).synthesize(text, { speed });
      sampleRate = TURKISH_RATE;
    } else if (male) {
      maleEnglish ??= MaleEnglishVoice.load();
      audio = await (await maleEnglish).synthesize(text, { speed });
      sampleRate = KITTEN_RATE;
    } else {
      english ??= EnglishVoice.load();
      audio = await (await english).synthesize(text, { speed });
      sampleRate = ENGLISH_RATE;
    }
    scope.postMessage({ type: "audio", id, audio, sampleRate }, [audio.buffer]);
  } catch (error) {
    // A failed load is retried on the next message rather than cached.
    if (lang === "tr") turkish = null;
    else if (male) maleEnglish = null;
    else english = null;
    scope.postMessage({ type: "error", id, message: error instanceof Error ? error.message : String(error) });
  }
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") {
    configureRuntime(message.basePath);
    return;
  }
  if (message.type === "speak") {
    queue = queue.then(() => speak(message.id, message.text, message.lang, message.speed, message.speaker));
  }
};
