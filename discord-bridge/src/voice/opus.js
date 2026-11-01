/**
 * Opus for the voice bridge, through opusscript (libopus compiled to
 * WebAssembly). The native @discordjs/opus crashes Node 22 on exit, and at a
 * few voices this is plenty fast: about 0.3 ms to encode a 20 ms frame and
 * under 0.1 ms to decode one.
 */
import OpusScript from "opusscript";
import { FRAME, SAMPLE_RATE } from "./dsp.js";

/** Discord's format: 48 kHz stereo, 20 ms frames. */
export function createOpus({ music = false, bitrate = 0 } = {}) {
  const codec = new OpusScript(SAMPLE_RATE, 2, music ? OpusScript.Application.AUDIO : OpusScript.Application.VOIP);
  if (bitrate) codec.setBitrate(bitrate);
  let freed = false;
  return {
    /** s16le stereo, one 20 ms frame → one Opus packet. */
    encode: (pcm) => codec.encode(pcm, FRAME),
    /** One Opus packet → s16le stereo. */
    decode: (packet) => codec.decode(packet),
    free() {
      if (freed) return;
      freed = true;
      codec.delete();
    },
  };
}
