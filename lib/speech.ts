/**
 * PatientDesk speech (https://speech.patientdesk.ai): Alania-2 text-to-speech
 * and Duyu speech-to-text, both Turkish. Shared by the server routes and the
 * settings UI; the key (SPEECH_API_KEY) stays on the server.
 */

export const SPEECH_HOST = "voice.patientdesk.ai";

/** Alania-2's built-in voices, as listed in its docs. The first is the default. */
export const ALANIA_VOICES = [
  { id: "alania2-f1", name: "Default", gender: "female", description: "Alania-2's standard voice" },
  { id: "alania2-nisa", name: "Nisa", gender: "female", description: "Gentle and playful" },
  { id: "alania2-selin", name: "Selin", gender: "female", description: "Relaxed and friendly" },
  { id: "alania2-lina", name: "Lina", gender: "female", description: "Warm and calm" },
  { id: "alania2-melisa", name: "Melisa", gender: "female", description: "Bright and energetic" },
  { id: "alania2-nil", name: "Nil", gender: "female", description: "Warm and enthusiastic" },
  { id: "alania2-oncel", name: "Öncel", gender: "male", description: "Mature and reassuring" },
  { id: "alania2-m1", name: "M1", gender: "male", description: "Alania-2's standard male voice" },
  { id: "alania2-emre", name: "Emre", gender: "male", description: "Smooth and thoughtful" },
  { id: "alania2-fikri", name: "Fikri", gender: "male", description: "Clear and gentle" },
  { id: "alania2-sezgin", name: "Sezgin", gender: "male", description: "Soft-spoken and breathy" },
] as const;

export type AlaniaVoiceId = (typeof ALANIA_VOICES)[number]["id"];

export const DEFAULT_ALANIA_VOICE: AlaniaVoiceId = "alania2-f1";
export const DEFAULT_ALANIA_MALE_VOICE: AlaniaVoiceId = "alania2-oncel";

export function isAlaniaVoice(value: unknown): value is AlaniaVoiceId {
  return typeof value === "string" && ALANIA_VOICES.some((voice) => voice.id === value);
}

/** Duyu's language setting: Turkish, or let it guess. */
export type DuyuLanguage = "tr" | "auto";

/** Longest file Duyu is sent in one go; a five-minute voice message is far smaller. */
export const MAX_TRANSCRIBE_BYTES = 12 * 1024 * 1024;

/**
 * Duyu's file transcription (POST /v1/audio/transcriptions, OpenAI-style
 * multipart). It takes the webm/opus voice messages as they are. Throws on
 * anything but a clean answer; an empty `text` means it heard no speech.
 */
export async function transcribeWithDuyu(
  key: string,
  audio: ArrayBuffer,
  options: { contentType?: string; language?: DuyuLanguage; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ text: string; language: string | null }> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: options.contentType || "audio/webm" }), "voice.webm");
  form.append("language", options.language || "auto");
  const response = await (options.fetchImpl || fetch)(`https://${SPEECH_HOST}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
  });
  if (!response.ok) throw new Error(`Duyu answered ${response.status}`);
  const data = (await response.json()) as { text?: unknown; language?: unknown };
  return {
    text: typeof data.text === "string" ? data.text.trim() : "",
    language: typeof data.language === "string" ? data.language : null,
  };
}
