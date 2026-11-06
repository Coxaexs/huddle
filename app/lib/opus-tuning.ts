/** How voice is sent over WebRTC: sender parameters and Opus options. */

/** Caps an audio sender's bitrate and gives it priority over video. */
export async function tuneAudioSender(
  sender: RTCRtpSender,
  maxBitrate: number,
): Promise<void> {
  if (sender.track?.kind !== "audio") return;
  const parameters = sender.getParameters();
  if (!parameters.encodings.length) parameters.encodings = [{}];
  for (const encoding of parameters.encodings) {
    encoding.maxBitrate = maxBitrate;
    // Discontinuous transmission is useful for telephony, but its repeated
    // noise-floor switching is distracting in a persistent friends' room.
    // Not in the DOM typings yet, but implemented where it matters.
    (encoding as RTCRtpEncodingParameters & { dtx?: string }).dtx = "disabled";
    // Ask the OS/router to put voice ahead of screen share and camera packets.
    encoding.priority = "high";
    encoding.networkPriority = "high";
  }
  await sender.setParameters(parameters).catch(() => undefined);
}

/*
 * The receiver's jitter buffer is deliberately left alone. `jitterBufferTarget`
 * acts as a floor, not a cap: 60 ms held a clean link's buffer at 63 ms where
 * Chrome settles at about 26 ms, which added 34 ms to every voice. On a lossy
 * link Chrome grew it to the same size with or without a target.
 */

/**
 * Opus parameters the default negotiation leaves loose: in-band FEC so a lost
 * packet is rebuilt from its neighbour, no DTX, and 10 ms packets when the far
 * side accepts them. Applied to every Opus payload type in the description.
 *
 * `stereo` is for a peer that sends real stereo. Chrome decodes to mono unless
 * its own description asks for stereo, whatever the far side says it sends.
 */
export function tuneOpusSdp<T extends RTCSessionDescriptionInit>(
  description: T,
  { stereo = false }: { stereo?: boolean } = {},
): T {
  if (!description.sdp) return description;
  const opus = [...description.sdp.matchAll(/a=rtpmap:(\d+) opus\/48000/gi)].map((m) => m[1]);
  let sdp = description.sdp;
  for (const pt of opus) {
    sdp = sdp.replace(new RegExp(`a=fmtp:${pt} ([^\r\n]*)`, "g"), (_line, params: string) => {
      const map = new Map(params.split(";").filter(Boolean).map((kv) => {
        const [k, v = ""] = kv.trim().split("=");
        return [k, v] as const;
      }));
      map.set("useinbandfec", "1");
      map.set("usedtx", "0");
      map.set("minptime", "10");
      if (stereo) map.set("stereo", "1");
      return `a=fmtp:${pt} ${[...map].map(([k, v]) => `${k}=${v}`).join(";")}`;
    });
  }
  return { ...description, sdp };
}
