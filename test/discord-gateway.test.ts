import { describe, it, expect, beforeEach } from "vitest";
import zlib from "node:zlib";
import { ZlibStreamEncoder } from "@/lib/discord/zlib-stream";
import {
  GatewayIntent,
  intentAllows,
  MAX_INTENTS,
  ALL_INTENTS,
} from "@/lib/discord/protocol";
import {
  buildSnowflake,
  snowflakeTimestamp,
  isSnowflake,
  DISCORD_EPOCH,
} from "@/lib/discord/snowflake";
import {
  avatarHash,
  colorToInt,
  intToColor,
  everyoneRole,
} from "@/lib/discord/serialize";

describe("zlib-stream framing", () => {
  /**
   * Mirrors a client: one inflate context for the life of the connection.
   * Returns the inflated bytes joined, because a stream emits its own chunk
   * boundaries that have nothing to do with our frame boundaries — those are
   * asserted separately through the sync-flush suffix.
   */
  function inflateAll(frames: Uint8Array[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const out: string[] = [];
      const inflater = zlib.createInflate({
        finishFlush: zlib.constants.Z_SYNC_FLUSH,
      });
      inflater.on("data", (chunk) => out.push(chunk.toString()));
      inflater.on("error", reject);
      for (const frame of frames) inflater.write(Buffer.from(frame));
      inflater.flush(zlib.constants.Z_SYNC_FLUSH, () => resolve(out.join("")));
    });
  }

  it("round-trips a sequence of payloads through one inflate context", async () => {
    const encoder = new ZlibStreamEncoder();
    const payloads = [
      JSON.stringify({ op: 10, d: { heartbeat_interval: 41250 } }),
      JSON.stringify({ op: 0, t: "READY", s: 1, d: { user: { id: "1" } } }),
      JSON.stringify({ op: 11, d: null }),
    ];
    const frames = payloads.map((payload) => encoder.encode(payload));
    expect(await inflateAll(frames)).toBe(payloads.join(""));
  });

  it("ends every frame with the sync-flush suffix clients scan for", () => {
    const encoder = new ZlibStreamEncoder();
    for (const payload of ["{}", JSON.stringify({ a: "x".repeat(1000) })]) {
      const frame = encoder.encode(payload);
      expect([...frame.slice(-4)]).toEqual([0x00, 0x00, 0xff, 0xff]);
    }
  });

  it("emits the zlib header exactly once per connection", () => {
    const encoder = new ZlibStreamEncoder();
    const first = encoder.encode("{}");
    const second = encoder.encode("{}");
    expect([first[0], first[1]]).toEqual([0x78, 0x01]);
    // A second header mid-stream is read as a stored block with a bad length
    // and permanently breaks the client's inflate context.
    expect([second[0], second[1]]).not.toEqual([0x78, 0x01]);
  });

  it("resumes a stream that already sent its header", () => {
    const started = new ZlibStreamEncoder(true);
    const frame = started.encode("{}");
    expect([frame[0], frame[1]]).not.toEqual([0x78, 0x01]);
  });

  it("splits payloads larger than one stored block", async () => {
    const encoder = new ZlibStreamEncoder();
    const payload = JSON.stringify({ big: "y".repeat(200_000) });
    expect(await inflateAll([encoder.encode(payload)])).toBe(payload);
  });
});

describe("intent gating", () => {
  it("delivers guild messages only with the GuildMessages intent", () => {
    expect(intentAllows("MESSAGE_CREATE", GatewayIntent.GuildMessages)).toBe(true);
    expect(intentAllows("MESSAGE_CREATE", GatewayIntent.Guilds)).toBe(false);
  });

  it("gates direct messages on the DM intent instead", () => {
    expect(
      intentAllows("MESSAGE_CREATE", GatewayIntent.GuildMessages, true),
    ).toBe(false);
    expect(
      intentAllows("MESSAGE_CREATE", GatewayIntent.DirectMessages, true),
    ).toBe(true);
  });

  it("always delivers interactions, which are never intent-gated", () => {
    expect(intentAllows("INTERACTION_CREATE", 0)).toBe(true);
    expect(intentAllows("READY", 0)).toBe(true);
  });

  it("drops events it has no rule for rather than leaking them", () => {
    expect(intentAllows("SOME_FUTURE_EVENT", ALL_INTENTS)).toBe(false);
  });

  it("accepts intent bits newer than the ones we know", () => {
    // discord.py sends poll and auto-moderation intents by default; rejecting
    // unknown bits closes 4013, which libraries treat as fatal.
    const unknownBit = 1 << 26;
    expect(unknownBit).toBeLessThanOrEqual(MAX_INTENTS);
  });
});

describe("snowflakes", () => {
  beforeEach(() => {
    // Nothing to reset: these helpers are pure.
  });

  it("encodes the timestamp it was built from", () => {
    const when = Date.UTC(2024, 0, 15, 12, 0, 0);
    const id = buildSnowflake(when);
    expect(snowflakeTimestamp(id)).toBe(when);
  });

  it("produces ids that sort by creation time", () => {
    const early = buildSnowflake(Date.UTC(2020, 0, 1));
    const late = buildSnowflake(Date.UTC(2026, 0, 1));
    expect(BigInt(late) > BigInt(early)).toBe(true);
  });

  it("never collides inside a single millisecond", () => {
    const when = Date.now();
    const ids = new Set(Array.from({ length: 64 }, () => buildSnowflake(when)));
    expect(ids.size).toBe(64);
  });

  it("stays numeric, which strict clients require", () => {
    const id = buildSnowflake(Date.now());
    expect(isSnowflake(id)).toBe(true);
    expect(isSnowflake("general")).toBe(false);
  });

  it("clamps timestamps before Discord's epoch instead of going negative", () => {
    const id = buildSnowflake(DISCORD_EPOCH - 100_000);
    expect(BigInt(id) >= 0n).toBe(true);
  });
});

describe("object serialization helpers", () => {
  it("derives a stable 32-character avatar hash", () => {
    const hash = avatarHash("/hangout/api/uploads/abc--pic.png");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(avatarHash("/hangout/api/uploads/abc--pic.png")).toBe(hash);
    expect(avatarHash("/hangout/api/uploads/other--pic.png")).not.toBe(hash);
    expect(avatarHash(null)).toBeNull();
  });

  it("round-trips colours between Hoffle hex and Discord integers", () => {
    expect(colorToInt("#5865f2")).toBe(0x5865f2);
    expect(intToColor(0x5865f2)).toBe("#5865f2");
    expect(colorToInt("not a colour")).toBe(0);
  });

  it("gives @everyone the guild's own id, as clients assume", () => {
    const role = everyoneRole("1234567890");
    expect(role.id).toBe("1234567890");
    expect(role.name).toBe("@everyone");
    // Permissions must be a decimal string: the full bitfield overflows Number.
    expect(typeof role.permissions).toBe("string");
  });
});
