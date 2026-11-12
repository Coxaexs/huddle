import { afterEach, describe, expect, it, vi } from "vitest";
import { shapeOpusSend, tuneOpusSdp } from "@/app/lib/opus-tuning";
import {
  classifyLink,
  ewma,
  fitBudget,
  lossBetween,
  profileFor,
  readSample,
  SELF_SPEAKER,
  VoiceQosMonitor,
  type QosSdpShape,
  type QosState,
} from "@/app/lib/voice-qos";

/** A connection whose counters the test moves by hand. */
function fakePeer(start = 64_000) {
  const link = { sent: 0, lost: 0, jitter: 0.005, rtt: 0.04, available: undefined as number | undefined };
  const encoding: RTCRtpEncodingParameters = { maxBitrate: start };
  const setParameters = vi.fn(async (parameters: RTCRtpSendParameters) => {
    encoding.maxBitrate = parameters.encodings[0].maxBitrate;
  });
  const sender = {
    track: { kind: "audio" },
    getParameters: () => ({ encodings: [{ ...encoding }] }),
    setParameters,
  };
  const pc = {
    connectionState: "connected" as RTCPeerConnectionState,
    getSenders: () => [sender],
    getStats: vi.fn(async () =>
      new Map<string, unknown>([
        ["T", { type: "transport", selectedCandidatePairId: "P" }],
        ["P", { id: "P", type: "candidate-pair", currentRoundTripTime: link.rtt, availableOutgoingBitrate: link.available }],
        ["X", { id: "X", type: "candidate-pair", nominated: true, state: "succeeded", currentRoundTripTime: 9 }],
        ["O", { type: "outbound-rtp", kind: "audio", packetsSent: link.sent }],
        ["V", { type: "outbound-rtp", kind: "video", packetsSent: 99_999 }],
        ["R", { type: "remote-inbound-rtp", kind: "audio", packetsLost: link.lost, jitter: link.jitter }],
      ]),
    ),
  };
  /** Two seconds of talking with this share of it lost. */
  const send = (lossRate: number) => {
    link.sent += 100;
    link.lost += Math.round(100 * lossRate);
  };
  return { pc: pc as unknown as RTCPeerConnection, link, send, bitrate: () => encoding.maxBitrate, setParameters };
}

async function polls(monitor: VoiceQosMonitor, peer: ReturnType<typeof fakePeer>, lossRate: number, count: number) {
  for (let index = 0; index < count; index++) {
    peer.send(lossRate);
    await monitor.poll();
  }
}

afterEach(() => vi.useRealTimers());

describe("voice QoS numbers", () => {
  it("averages with the newest sample weighing 35 %", () => {
    expect(ewma(null, 0.2)).toBe(0.2);
    expect(ewma(0, 0.1)).toBeCloseTo(0.035);
    expect(ewma(0.1, 0)).toBeCloseTo(0.065);
  });

  it("reads audio counters and the selected candidate pair", async () => {
    const peer = fakePeer();
    peer.link.sent = 500;
    peer.link.lost = 7;
    peer.link.available = 300_000;
    expect(readSample(await peer.pc.getStats())).toMatchObject({
      packetsSent: 500,
      remoteLost: 7,
      jitterMs: 5,
      rttMs: 40,
      availableOutgoingBitrate: 300_000,
    });
  });

  it("measures loss on what we send, or on what we receive until they report", () => {
    const base = { packetsSent: 0, remoteLost: 0, packetsReceived: 0, packetsLost: 0, jitterMs: null, rttMs: null, availableOutgoingBitrate: null };
    expect(lossBetween(base, { ...base, packetsSent: 100, remoteLost: 5 })).toBeCloseTo(0.05);
    // A late packet lowers their count; that is not negative loss.
    expect(lossBetween({ ...base, remoteLost: 5 }, { ...base, packetsSent: 100, remoteLost: 3 })).toBe(0);
    expect(lossBetween({ ...base, remoteLost: null }, { ...base, remoteLost: null, packetsReceived: 90, packetsLost: 10 })).toBeCloseTo(0.1);
    // Muted or DTX: a handful of packets prove nothing.
    expect(lossBetween(base, { ...base, packetsSent: 4, remoteLost: 2 })).toBeNull();
  });

  it("sorts a link into normal, lossy or severe, and holds its state in between", () => {
    const at = (loss: number, jitterMs = 5, rttMs = 40) => ({ loss, jitterMs, rttMs });
    expect(classifyLink(at(0.005))).toBe("normal");
    expect(classifyLink(at(0.03))).toBe("lossy");
    expect(classifyLink(at(0.09))).toBe("severe");
    expect(classifyLink(at(0, 5, 400))).toBe("severe");
    expect(classifyLink(at(0.015), "normal")).toBe("normal");
    expect(classifyLink(at(0.015), "lossy")).toBe("lossy");
    expect(classifyLink(at(0.001, 45), "lossy")).toBe("lossy");
    expect(classifyLink(at(0.015), "severe")).toBe("lossy");
  });

  it("gives each state its profile", () => {
    const on = { speaking: false, shapeable: true };
    expect(profileFor("normal", 64_000, on)).toEqual({ state: "normal", bitrate: 64_000, dtx: false, redundancy: false });
    expect(profileFor("lossy", 128_000, on)).toEqual({ state: "lossy", bitrate: 64_000, dtx: false, redundancy: true });
    expect(profileFor("severe", 64_000, on)).toEqual({ state: "severe", bitrate: 16_000, dtx: true, redundancy: false });
    expect(profileFor("severe", 64_000, { ...on, speaking: true }).bitrate).toBe(32_000);
    // Without a way to renegotiate, only the bitrate moves.
    expect(profileFor("lossy", 64_000, { speaking: false, shapeable: false }).redundancy).toBe(false);
    // The browser's own estimate of the path caps it, never below the floor.
    expect(profileFor("normal", 64_000, { ...on, available: 50_000 }).bitrate).toBe(40_000);
    expect(profileFor("normal", 64_000, { ...on, available: 5_000 }).bitrate).toBe(16_000);
  });

  it("keeps every copy together under the uplink budget, counting RED twice", () => {
    const cost = (list: { bitrate: number; redundancy: boolean }[]) =>
      list.reduce((sum, profile) => sum + profile.bitrate * (profile.redundancy ? 2 : 1), 0);
    const roomy = Array.from({ length: 4 }, () => ({ bitrate: 64_000, redundancy: false }));
    expect(fitBudget(roomy)).toEqual(roomy);
    const lossy = Array.from({ length: 8 }, () => ({ bitrate: 64_000, redundancy: true }));
    expect(cost(lossy)).toBe(1_024_000);
    expect(cost(fitBudget(lossy))).toBeLessThanOrEqual(600_000);
    expect(fitBudget(lossy)[0].bitrate).toBe(37_500);
    // A link already at the floor stays there; the others make the room.
    const mixed = [{ bitrate: 16_000, redundancy: false }, { bitrate: 256_000, redundancy: false }, { bitrate: 256_000, redundancy: false }, { bitrate: 256_000, redundancy: false }];
    const fitted = fitBudget(mixed);
    expect(fitted[0].bitrate).toBe(16_000);
    expect(cost(fitted)).toBeLessThanOrEqual(600_000);
    expect(fitted[1].bitrate).toBeGreaterThan(190_000);
  });
});

describe("VoiceQosMonitor", () => {
  it("leaves a clean link at the target and follows the target", async () => {
    const peer = fakePeer(32_000);
    const monitor = new VoiceQosMonitor();
    monitor.setTarget(64_000);
    monitor.registerPeer("a", peer.pc);
    expect(peer.bitrate()).toBe(64_000);
    await polls(monitor, peer, 0, 3);
    expect(monitor.inspect("a")?.profile.state).toBe("normal");
    monitor.setTarget(48_000);
    expect(peer.bitrate()).toBe(48_000);
    monitor.destroy();
  });

  it("adds redundancy on a lossy link and takes it away once the link has stayed clean", async () => {
    const peer = fakePeer();
    const shapes: QosSdpShape[] = [];
    const states: QosState[] = [];
    const monitor = new VoiceQosMonitor({
      applySdp: (_id, shape) => (shapes.push(shape), true),
      onState: (_id, state) => states.push(state),
    });
    monitor.setTarget(96_000);
    monitor.registerPeer("a", peer.pc);
    await polls(monitor, peer, 0.05, 2);
    await Promise.resolve();
    expect(monitor.inspect("a")?.profile).toMatchObject({ state: "lossy", redundancy: true, bitrate: 64_000 });
    expect(shapes).toEqual([{ dtx: false, redundancy: true }]);
    // Clean again, but not yet for long enough to be believed.
    await polls(monitor, peer, 0, 6);
    expect(monitor.inspect("a")?.profile.state).toBe("lossy");
    await polls(monitor, peer, 0, 8);
    expect(monitor.inspect("a")?.profile).toMatchObject({ state: "normal", redundancy: false, bitrate: 96_000 });
    expect(shapes.at(-1)).toEqual({ dtx: false, redundancy: false });
    expect(states).toEqual(["lossy", "normal"]);
    monitor.destroy();
  });

  it("drops a drowning link to 16 kbps with DTX, and to 32 kbps while we talk", async () => {
    let now = 0;
    const peer = fakePeer();
    const shapes: QosSdpShape[] = [];
    const monitor = new VoiceQosMonitor({ applySdp: (_id, shape) => (shapes.push(shape), true), now: () => now });
    monitor.registerPeer("a", peer.pc);
    await polls(monitor, peer, 0.2, 2);
    await Promise.resolve();
    expect(monitor.inspect("a")?.profile).toMatchObject({ state: "severe", bitrate: 16_000, dtx: true });
    expect(peer.bitrate()).toBe(16_000);
    expect(shapes.at(-1)).toEqual({ dtx: true, redundancy: false });
    // Someone else talking changes nothing; our own voice is raised at once.
    monitor.setActiveSpeaker("b");
    expect(peer.bitrate()).toBe(16_000);
    monitor.setActiveSpeaker(SELF_SPEAKER);
    expect(peer.bitrate()).toBe(32_000);
    // A breath between words is not the end of the turn.
    monitor.setActiveSpeaker(null);
    now += 1000;
    await polls(monitor, peer, 0.2, 1);
    expect(peer.bitrate()).toBe(32_000);
    now += 3000;
    await polls(monitor, peer, 0.2, 1);
    expect(peer.bitrate()).toBe(16_000);
    monitor.destroy();
  });

  it("calls a slow round trip severe whatever the loss", async () => {
    const peer = fakePeer();
    peer.link.rtt = 0.5;
    const monitor = new VoiceQosMonitor();
    monitor.registerPeer("a", peer.pc);
    await polls(monitor, peer, 0, 2);
    expect(monitor.inspect("a")?.profile.state).toBe("severe");
    monitor.destroy();
  });

  it("asks again when the renegotiation could not start", async () => {
    const peer = fakePeer();
    const applySdp = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const monitor = new VoiceQosMonitor({ applySdp });
    monitor.registerPeer("a", peer.pc);
    await polls(monitor, peer, 0.05, 2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applySdp).toHaveBeenCalledTimes(1);
    await polls(monitor, peer, 0.05, 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applySdp).toHaveBeenCalledTimes(2);
    await polls(monitor, peer, 0.05, 2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applySdp).toHaveBeenCalledTimes(2);
    monitor.destroy();
  });

  it("does not touch a sender that already has the right bitrate", async () => {
    const peer = fakePeer(64_000);
    const monitor = new VoiceQosMonitor();
    monitor.registerPeer("a", peer.pc);
    await polls(monitor, peer, 0, 4);
    expect(peer.setParameters).not.toHaveBeenCalled();
    monitor.destroy();
  });

  it("polls every two seconds while there are peers, and stops when there are none", async () => {
    vi.useFakeTimers();
    const one = fakePeer();
    const two = fakePeer();
    const monitor = new VoiceQosMonitor();
    monitor.registerPeer("a", one.pc);
    monitor.registerPeer("b", two.pc);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(one.pc.getStats).toHaveBeenCalledTimes(2);
    monitor.unregisterPeer("a");
    await vi.advanceTimersByTimeAsync(2000);
    expect(one.pc.getStats).toHaveBeenCalledTimes(2);
    expect(two.pc.getStats).toHaveBeenCalledTimes(3);
    monitor.unregisterPeer("b");
    expect(vi.getTimerCount()).toBe(0);
    monitor.registerPeer("b", two.pc);
    expect(vi.getTimerCount()).toBe(1);
    monitor.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(monitor.inspect("b")).toBeNull();
  });

  it("applies nothing from a poll that was still reading when it was destroyed", async () => {
    const peer = fakePeer();
    const monitor = new VoiceQosMonitor();
    monitor.registerPeer("a", peer.pc);
    await polls(monitor, peer, 0, 1);
    peer.send(0.5);
    const reading = monitor.poll();
    monitor.destroy();
    await reading;
    expect(peer.bitrate()).toBe(64_000);
  });
});

describe("shapeOpusSend", () => {
  const sdp = [
    "v=0",
    "a=group:BUNDLE 0 1",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9",
    "a=mid:0",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1;usedtx=0",
    "a=rtpmap:63 red/48000/2",
    "a=fmtp:63 111/111",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9",
    "a=mid:1",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1;usedtx=0",
    "a=rtpmap:63 red/48000/2",
    "a=fmtp:63 111/111",
    "",
  ].join("\r\n");
  const lines = (text: string | undefined) => (text || "").split("\r\n");

  it("turns on DTX and RED for the microphone's section only", () => {
    const shaped = lines(shapeOpusSend({ type: "answer", sdp }, { dtx: true, redundancy: true, mids: ["0"] }).sdp);
    expect(shaped[2]).toBe("m=audio 9 UDP/TLS/RTP/SAVPF 63 111 9");
    expect(shaped[5]).toBe("a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1");
    expect(shaped.slice(8)).toEqual(lines(sdp).slice(8));
  });

  it("turns them back off", () => {
    const on = shapeOpusSend({ type: "answer" as const, sdp }, { dtx: true, redundancy: true, mids: ["0"] });
    expect(shapeOpusSend(on, { dtx: false, redundancy: false, mids: ["0"] }).sdp).toBe(sdp);
  });

  it("leaves a description alone when it has no section of ours", () => {
    expect(shapeOpusSend({ type: "offer", sdp }, { dtx: true, redundancy: true, mids: [] }).sdp).toBe(sdp);
    expect(shapeOpusSend({ type: "offer", sdp }, { dtx: true, redundancy: true, mids: ["7"] }).sdp).toBe(sdp);
  });

  it("never lets our own description ask the far side for RED", () => {
    const shaped = shapeOpusSend({ type: "offer" as const, sdp }, { dtx: false, redundancy: true, mids: ["0", "1"] });
    const ours = lines(tuneOpusSdp(shaped).sdp);
    expect(ours[2]).toBe("m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9");
    expect(ours[8]).toBe("m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9");
  });
});
