/**
 * Voice channel bitrate: how much each speaker may spend on one copy of their
 * voice. Set per channel by whoever can manage it, like Discord's.
 *
 * Mono Opus speech is near-transparent from about 64 kbps, which is why that
 * is the default; the headroom above it is for music, singing and anyone who
 * wants it. It is a ceiling, not a promise: `voiceBitrate` spends less per
 * copy as a mesh room fills, and the rates above 192 kbps are for small rooms
 * on steady links (see `sfuMicPlan` in app/lib/voice-bitrate.ts).
 */
export const VOICE_BITRATE_DEFAULT = 64_000;
export const VOICE_BITRATE_MIN = 32_000;
export const VOICE_BITRATE_MAX = 320_000;
export const VOICE_BITRATE_PRESETS = [32_000, 64_000, 96_000, 128_000, 192_000, 256_000, 320_000];

/** The rates above VOICE_BITRATE_BIG_ROOM_MAX are for rooms of up to this many people (bots aside). */
export const VOICE_BITRATE_HIFI_PEOPLE = 10;
/** The most a bigger room sends per speaker, whatever its setting. */
export const VOICE_BITRATE_BIG_ROOM_MAX = 192_000;

/** Any input, including a missing or garbled one, as a usable bitrate. */
export function clampVoiceBitrate(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return VOICE_BITRATE_DEFAULT;
  return Math.round(Math.max(VOICE_BITRATE_MIN, Math.min(VOICE_BITRATE_MAX, number)));
}

/** A channel's setting as the ceiling for a room with `people` in it. */
export function roomVoiceBitrate(setting: unknown, people: number): number {
  const bitrate = clampVoiceBitrate(setting);
  return people > VOICE_BITRATE_HIFI_PEOPLE ? Math.min(bitrate, VOICE_BITRATE_BIG_ROOM_MAX) : bitrate;
}
