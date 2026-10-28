import { expect, it } from "vitest";
import { shardEventAllowed, shardRetryMs } from "./room-shard";

it("lets the room's own traffic through from its shard", () => {
  expect(shardEventAllowed(JSON.stringify({ t: "lounge-state", channelId: "room", poses: [] }))).toBe(true);
  expect(shardEventAllowed(JSON.stringify({ t: "club", channelId: "room" }))).toBe(true);
});

it("drops the shard's partial roster, presence and handshake", () => {
  for (const t of ["ready", "voice", "presence", "room-watch", "pong"]) {
    expect(shardEventAllowed(JSON.stringify({ t, channelId: "room" }))).toBe(false);
  }
  expect(shardEventAllowed("not json")).toBe(false);
  expect(shardEventAllowed(new ArrayBuffer(4))).toBe(false);
});

it("backs off between shard reconnects, up to fifteen seconds", () => {
  expect([0, 1, 2, 3, 4, 10].map(shardRetryMs)).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 15_000]);
});
