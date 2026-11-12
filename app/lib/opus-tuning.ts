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
  // An answer copies the offer's codec order, and `shapeOpusSend` may have put
  // RED first in the offer we were shown. Our own description always says
  // Opus first, so the far side never sends RED because of our edit.
  sdp = mapAudioSections(sdp, () => true, (section) => preferCodec(section, "opus"));
  return { ...description, sdp };
}

/** Runs `edit` over each audio section of an SDP that `pick` accepts (by its mid). */
function mapAudioSections(sdp: string, pick: (mid: string | null) => boolean, edit: (section: string) => string): string {
  const [session, ...media] = sdp.split(/^(?=m=)/m);
  return session + media.map((section) => {
    if (!section.startsWith("m=audio ")) return section;
    return pick(section.match(/^a=mid:(\S+)/m)?.[1] ?? null) ? edit(section) : section;
  }).join("");
}

/** Moves a codec's payload type to the front of a media section's m= line. */
function preferCodec(section: string, codec: string): string {
  const pt = section.match(new RegExp(`^a=rtpmap:(\\d+) ${codec}/48000`, "im"))?.[1];
  if (!pt) return section;
  return section.replace(/^(m=audio \S+ \S+)((?: \d+)+)/, (_line, head: string, list: string) => {
    const rest = list.trim().split(" ").filter((other) => other !== pt);
    return `${head} ${[pt, ...rest].join(" ")}`;
  });
}

/**
 * Shapes how *we* send voice to a peer, by editing *their* description before
 * it is applied: Chrome takes DTX and the send codec from the remote side, and
 * ignores `encoding.dtx` / `encoding.codec` for audio. Nothing is signalled,
 * so the far side neither knows nor changes what it sends.
 *
 * - `dtx`: stop sending during silence (a keep-alive every 400 ms instead of
 *   50 packets a second).
 * - `redundancy`: send RED, each packet carrying the one before as well, when
 *   the far side can decode it. Costs twice the encoder's bitrate.
 *
 * Only the sections in `mids` are touched (the microphone's), so screen-share
 * audio keeps plain Opus. Every call states both options, so applying it to
 * each new remote description also turns them back off.
 */
export function shapeOpusSend<T extends RTCSessionDescriptionInit>(
  description: T,
  { dtx, redundancy, mids }: { dtx: boolean; redundancy: boolean; mids: Iterable<string> },
): T {
  if (!description.sdp) return description;
  const wanted = new Set(mids);
  if (!wanted.size) return description;
  const sdp = mapAudioSections(description.sdp, (mid) => mid !== null && wanted.has(mid), (section) => {
    let next = section;
    for (const [, pt] of section.matchAll(/^a=rtpmap:(\d+) opus\/48000/gim)) {
      next = next.replace(new RegExp(`^a=fmtp:${pt} ([^\r\n]*)`, "m"), (_line, params: string) => {
        const kept = params.split(";").map((kv) => kv.trim()).filter((kv) => kv && !kv.startsWith("usedtx="));
        return `a=fmtp:${pt} ${[...kept, `usedtx=${dtx ? 1 : 0}`].join(";")}`;
      });
    }
    return preferCodec(next, redundancy ? "red" : "opus");
  });
  return { ...description, sdp };
}
