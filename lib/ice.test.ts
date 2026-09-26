import { describe, expect, it } from "vitest";
import { privateAddress, turnOnly } from "../app/lib/ice";
import { addressVerdict, parseIceUrl, splitFrames, targetsFromIceServers } from "../scripts/check-turn.mjs";

describe("relay address verdicts", () => {
  it("rejects everything a peer could not reach", () => {
    for (const address of [
      "192.168.1.198",
      "10.0.0.5",
      "172.20.3.4",
      "127.0.0.1",
      "169.254.1.1",
      "100.96.0.1",
      "0.0.0.0",
      "::1",
      "fe80::1",
      "fd00::1",
    ]) {
      expect(privateAddress(address), address).not.toBe("");
      expect(addressVerdict(address), address).not.toBeNull();
    }
  });

  it("accepts routable addresses", () => {
    for (const address of ["188.89.120.47", "8.8.8.8", "1.1.1.1", "2001:4860:4860::8888"]) {
      expect(privateAddress(address), address).toBe("");
      expect(addressVerdict(address), address).toBeNull();
    }
  });

  // The app and the terminal tool answer the same question, so they must not
  // drift: a relay that one calls usable and the other calls broken is worse
  // than either answer alone.
  it("agrees with the check-turn script about what is unusable", () => {
    for (const address of [
      "192.168.1.198", "10.1.2.3", "172.16.0.1", "172.31.255.255", "172.32.0.1",
      "127.0.0.1", "100.64.0.0", "100.127.255.255", "100.128.0.1", "224.0.0.1",
      "8.8.4.4", "172.15.0.1", "100.63.255.255",
    ]) {
      expect(privateAddress(address) !== "", address).toBe(addressVerdict(address) !== null);
    }
  });
});

describe("the relay check only asks the relay", () => {
  it("drops the stun URLs that share a server entry", () => {
    const servers = [
      { urls: ["stun:turn.example.com:3478", "stun:stun.l.google.com:19302"] },
      {
        urls: [
          "turn:turn.example.com:3478?transport=udp",
          "turn:turn.example.com:3478?transport=tcp",
          "turns:turn.example.com:5349?transport=tcp",
        ],
        username: "hoffle",
        credential: "secret",
      },
    ];
    expect(turnOnly(servers)).toEqual([
      {
        urls: [
          "turn:turn.example.com:3478?transport=udp",
          "turn:turn.example.com:3478?transport=tcp",
          "turns:turn.example.com:5349?transport=tcp",
        ],
        username: "hoffle",
        credential: "secret",
      },
    ]);
  });

  it("finds nothing to check when no relay is configured", () => {
    expect(turnOnly([{ urls: "stun:stun.cloudflare.com:3478" }])).toEqual([]);
  });
});

describe("parsing ice server lists", () => {
  it("reads a transport out of a TURN url, and defaults it like a browser would", () => {
    expect(parseIceUrl("turn:turn.example.com:3478?transport=udp")).toMatchObject({
      scheme: "turn", host: "turn.example.com", port: 3478, kind: "udp",
    });
    expect(parseIceUrl("turn:turn.example.com:3478?transport=tcp")).toMatchObject({ kind: "tcp" });
    expect(parseIceUrl("turn:turn.example.com")).toMatchObject({ port: 3478, kind: "udp" });
    expect(parseIceUrl("turns:turn.example.com:5349?transport=tcp")).toMatchObject({
      scheme: "turns", port: 5349, kind: "tls",
    });
    expect(parseIceUrl("stun:stun.example.com:3478")).toMatchObject({ scheme: "stun", kind: "udp" });
  });

  it("keeps the credentials that belong to each server entry", () => {
    const targets = targetsFromIceServers(
      JSON.stringify([
        { urls: ["stun:stun.l.google.com:19302"] },
        {
          urls: ["turn:turn.example.com:3478?transport=udp"],
          username: "hoffle",
          credential: "secret",
        },
      ]),
    );
    expect(targets).toHaveLength(2);
    expect(targets[1]).toMatchObject({ username: "hoffle", credential: "secret", kind: "udp" });
  });
});

/** A STUN message of the size a server actually sends back. */
function stunFrame(type: number, bodyLength = 12): Buffer {
  const frame = Buffer.alloc(20 + bodyLength);
  frame.writeUInt16BE(type, 0);
  frame.writeUInt16BE(bodyLength, 2);
  frame.writeUInt32BE(0x2112a442, 4);
  return frame;
}

describe("reassembling a TURN-over-TCP stream", () => {
  // STUN messages on a stream are delimited by their own header, not by a
  // length prefix. Reading them as if they were prefixed makes a relay that
  // works over UDP look unreachable over TCP — which is the transport people
  // behind an HTTPS-only network are stuck with.
  it("reads one whole message, with nothing left over", () => {
    const { frames, rest } = splitFrames(stunFrame(0x0101));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(32);
    expect(rest).toHaveLength(0);
  });

  it("reads several messages that arrived in one read", () => {
    const { frames } = splitFrames(Buffer.concat([stunFrame(0x0101), stunFrame(0x0103, 20)]));
    expect(frames.map((frame) => frame.length)).toEqual([32, 40]);
  });

  it("holds a partial message back until the rest of it arrives", () => {
    const whole = stunFrame(0x0101);
    const first = splitFrames(whole.subarray(0, 18));
    expect(first.frames).toHaveLength(0);
    expect(first.rest).toHaveLength(18);

    const second = splitFrames(Buffer.concat([first.rest, whole.subarray(18)]));
    expect(second.frames).toHaveLength(1);
    expect(second.frames[0]).toHaveLength(32);
    expect(second.rest).toHaveLength(0);
  });

  it("still understands a ChannelData message, which does carry a length", () => {
    const channel = Buffer.concat([Buffer.from([0x40, 0x01, 0x00, 0x04]), Buffer.from([1, 2, 3, 4])]);
    const { frames } = splitFrames(channel);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(8);
  });
});
