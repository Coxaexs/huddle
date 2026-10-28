/** How voice is sent and received over WebRTC: sender parameters, jitter buffer, Opus options. */

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

/**
 * Target for incoming audio's jitter buffer. Chrome's adaptive default often
 * idles at 80+ ms; 30 ms was tried and was too tight for Wi-Fi, where it made
 * NetEq constantly stretch and squeeze speech to keep up — a warbly,
 * "phone line" voice. 60 ms still sits below the default.
 */
export const AUDIO_JITTER_TARGET_MS = 60;

/**
 * Opus parameters the default negotiation leaves loose: in-band FEC so a lost
 * packet is rebuilt from its neighbour, no DTX, and 10 ms packets when the far
 * side accepts them. Applied to every Opus payload type in the description.
 */
export function tuneOpusSdp<T extends RTCSessionDescriptionInit>(description: T): T {
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
      return `a=fmtp:${pt} ${[...map].map(([k, v]) => `${k}=${v}`).join(";")}`;
    });
  }
  return { ...description, sdp };
}
