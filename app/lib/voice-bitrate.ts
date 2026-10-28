import { VOICE_BITRATE_DEFAULT } from "@/lib/voice-quality";

/**
 * Voice bitrate for a mesh of `listeners` other connections, under the
 * channel's own ceiling (`room`, set in its settings).
 *
 * In a mesh you upload one full copy of your voice per listener, so a busy
 * room multiplies it — and a saturated uplink drops packets, which is what a
 * robotic, choppy voice actually is. So the ceiling is what a small call gets,
 * and a fuller one spends less per copy: a share of the ceiling, and never
 * more than UPLINK_BUDGET across everyone. A camera or screen share already
 * competes for the same uplink, so it counts as a crowd of its own. At the
 * default 64 kbps that is 64 / 48 / 32 kbps for 1–2 / 3–4 / 5+ listeners.
 */
const UPLINK_BUDGET = 600_000;
const CROWD_FLOOR = 32_000;

export function voiceBitrate(
  listeners: number,
  sendingVideo: boolean,
  room: number = VOICE_BITRATE_DEFAULT,
): number {
  const share = listeners >= 5 ? 0.5 : listeners >= 3 || sendingVideo ? 0.75 : 1;
  const budget = UPLINK_BUDGET / Math.max(1, listeners);
  const wanted = Math.min(room * share, budget);
  return Math.round(Math.min(room, Math.max(CROWD_FLOOR, wanted)));
}

/** Screen-share audio is music and games, so it keeps more — but not per copy in a crowd. */
export function screenAudioBitrate(listeners: number): number {
  return listeners >= 3 ? 128_000 : 256_000;
}
/** Screen-share audio through the media server: uploaded once, so it keeps its quality. */
export const SFU_SCREEN_AUDIO_BITRATE = 192_000;
