/**
 * Voice channel bitrate: how much each speaker may spend on one copy of their
 * voice. Set per channel by whoever can manage it, like Discord's.
 *
 * Mono Opus speech is near-transparent from about 64 kbps, which is why that
 * is the default; the headroom above it is for music, singing and anyone who
 * wants it. It is a ceiling, not a promise — see `voiceBitrate` in use-voice,
 * which spends less per copy as a mesh room fills.
 */
export const VOICE_BITRATE_DEFAULT = 64_000;
export const VOICE_BITRATE_MIN = 32_000;
export const VOICE_BITRATE_MAX = 256_000;
export const VOICE_BITRATE_PRESETS = [32_000, 64_000, 96_000, 128_000, 192_000, 256_000];

/** Any input, including a missing or garbled one, as a usable bitrate. */
export function clampVoiceBitrate(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return VOICE_BITRATE_DEFAULT;
  return Math.round(Math.max(VOICE_BITRATE_MIN, Math.min(VOICE_BITRATE_MAX, number)));
}
