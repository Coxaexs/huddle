import { describe, expect, it } from "vitest";
import {
  emptySweepState,
  LIVEKIT_JOIN_GRACE_MS,
  LIVEKIT_MISSING_GRACE_MS,
  planSweep,
  splitIdentity,
  type LiveKitRoomView,
} from "./livekit-sweep";
import type { VoiceParticipant } from "./protocol";

const NOW = 1_000_000_000;

function seat(userId: string, connectionId: string, extra: Partial<VoiceParticipant> = {}): VoiceParticipant {
  return { id: userId, connectionId, joinedAt: 0, muted: false, deafened: false, ...extra } as VoiceParticipant;
}

function room(name: string, ...people: Array<[identity: string, joinedAgoMs?: number, canPublish?: boolean]>): LiveKitRoomView {
  return {
    name,
    participants: people.map(([identity, ago = 60_000, canPublish = true]) => ({
      identity,
      joinedAt: NOW - ago,
      canPublish,
    })),
  };
}

describe("splitIdentity", () => {
  it("reads the token route's identity", () => {
    expect(splitIdentity("u1|c1")).toEqual({ userId: "u1", connectionId: "c1" });
    expect(splitIdentity("u1")).toEqual({ userId: "u1", connectionId: null });
  });
});

describe("planSweep", () => {
  it("leaves seated people alone", () => {
    const plan = planSweep([room("v1", ["u1|c1"])], { v1: [seat("u1", "c1")] }, emptySweepState(), NOW);
    expect(plan.remove).toEqual([]);
    expect(plan.silence).toEqual([]);
  });

  it("does not remove a seatless participant on the first sighting", () => {
    const plan = planSweep([room("v1", ["u1|c1"])], {}, emptySweepState(), NOW);
    expect(plan.remove).toEqual([]);
    expect(plan.again).toBe(true);
    expect(plan.state.missing["v1\nu1|c1"]).toBe(NOW);
  });

  it("removes a listener with no seat once it has stayed missing", () => {
    const first = planSweep([room("v1", ["u1|c1"])], {}, emptySweepState(), NOW);
    const later = NOW + LIVEKIT_MISSING_GRACE_MS;
    const second = planSweep([room("v1", ["u1|c1"])], {}, first.state, later);
    expect(second.remove).toEqual([{ room: "v1", identity: "u1|c1" }]);
    expect(second.state.removed["u1|c1"]).toBeGreaterThan(later);
  });

  it("gives someone who just connected time for their seat to land", () => {
    // Joined a second before the first sweep; the second sweep is still inside the join grace.
    const first = planSweep([room("v1", ["u1|c1", 1_000])], {}, emptySweepState(), NOW);
    const later = NOW + LIVEKIT_MISSING_GRACE_MS;
    expect(1_000 + LIVEKIT_MISSING_GRACE_MS).toBeLessThan(LIVEKIT_JOIN_GRACE_MS);
    const second = planSweep([room("v1", ["u1|c1", 1_000])], {}, first.state, later);
    expect(second.remove).toEqual([]);
    const third = planSweep([room("v1", ["u1|c1", 1_000])], {}, second.state, NOW + LIVEKIT_JOIN_GRACE_MS);
    expect(third.remove).toEqual([{ room: "v1", identity: "u1|c1" }]);
  });

  it("forgets a missing seat that turned up (a hub restart, then the tabs resumed)", () => {
    const first = planSweep([room("v1", ["u1|c1"])], {}, emptySweepState(), NOW);
    const back = planSweep([room("v1", ["u1|c1"])], { v1: [seat("u1", "c1")] }, first.state, NOW + 20_000);
    expect(back.remove).toEqual([]);
    expect(back.state.missing).toEqual({});
  });

  it("only counts a seat in the same room, for the same user and connection", () => {
    const seats = { v2: [seat("u1", "c1")], v1: [seat("u2", "c1"), seat("u1", "c9")] };
    const first = planSweep([room("v1", ["u1|c1"])], seats, emptySweepState(), NOW);
    const second = planSweep([room("v1", ["u1|c1"])], seats, first.state, NOW + LIVEKIT_MISSING_GRACE_MS);
    expect(second.remove).toHaveLength(1);
  });

  it("removes someone a moderator took out straight away, in that room only", () => {
    const state = { ...emptySweepState(), blocked: { "v1\nu1": NOW + 60_000 } };
    const plan = planSweep([room("v1", ["u1|c2", 500]), room("v2", ["u1|c3", 500])], {}, state, NOW);
    expect(plan.remove).toEqual([{ room: "v1", identity: "u1|c2" }]);
  });

  it("removes an identity it already removed the moment it reconnects", () => {
    const state = { ...emptySweepState(), removed: { "u1|c1": NOW + 60_000 } };
    const plan = planSweep([room("v1", ["u1|c1", 200])], {}, state, NOW);
    expect(plan.remove).toEqual([{ room: "v1", identity: "u1|c1" }]);
  });

  it("never touches the session recorder", () => {
    const plan = planSweep([room("v1", ["recorder|r1"])], {}, { ...emptySweepState(), removed: { "recorder|r1": NOW + 1 } }, NOW);
    expect(plan.remove).toEqual([]);
    expect(plan.state.missing).toEqual({});
  });

  it("silences a seat that may not be heard but can still publish", () => {
    const seats = {
      v1: [seat("u1", "c1", { speakAllowed: false }), seat("u2", "c2", { serverMuted: true }), seat("u3", "c3")],
    };
    const plan = planSweep([room("v1", ["u1|c1"], ["u2|c2"], ["u3|c3"], ["u4|c4", 60_000, false])], { ...seats, v1: [...seats.v1, seat("u4", "c4", { speakAllowed: false })] }, emptySweepState(), NOW);
    expect(plan.silence).toEqual([
      { room: "v1", identity: "u1|c1" },
      { room: "v1", identity: "u2|c2" },
    ]);
  });

  it("stops sweeping once there is nothing left to watch", () => {
    const plan = planSweep([room("v1", ["u1|c1"])], { v1: [seat("u1", "c1")] }, emptySweepState(), NOW);
    expect(plan.again).toBe(false);
    const watching = planSweep([], {}, { ...emptySweepState(), watchUntil: NOW + 1 }, NOW);
    expect(watching.again).toBe(true);
    const expired = planSweep([], {}, { ...emptySweepState(), watchUntil: NOW - 1, removed: { a: NOW - 1 } }, NOW);
    expect(expired.again).toBe(false);
    expect(expired.state.removed).toEqual({});
  });
});
