import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECOND_SCREEN_STATE,
  isSecondScreenConnectionId,
  mergeSecondScreenState,
  sanitizeSecondScreenPatch,
} from "./second-screen";
import {
  emptySweepState,
  LIVEKIT_JOIN_GRACE_MS,
  LIVEKIT_MISSING_GRACE_MS,
  planSweep,
  type LiveKitRoomView,
} from "./livekit-sweep";
import type { VoiceParticipant } from "./protocol";

const NOW = 1_700_000_000_000;

function seat(userId: string, connectionId: string): VoiceParticipant {
  return {
    id: userId,
    connectionId,
    username: userId,
    displayName: userId,
    avatar: "",
    color: "#ffffff",
    joinedAt: NOW - 60_000,
    muted: false,
    deafened: false,
  };
}

function room(
  name: string,
  ...entries: Array<[identity: string, ago?: number, canPublish?: boolean]>
): LiveKitRoomView {
  return {
    name,
    participants: entries.map(([identity, ago = 60_000, canPublish = false]) => ({
      identity,
      joinedAt: NOW - ago,
      canPublish,
    })),
  };
}

describe("second-screen state helpers", () => {
  it("sanitizes valid patches and ignores unknown or invalid values", () => {
    const patch = sanitizeSecondScreenPatch({
      layout: "split-h",
      primary: "battlemap",
      secondary: "invalid-pane",
      channelId: "ch_123",
      voiceChannelId: "bad channel id with spaces",
      dndRoute: "world",
      followActive: false,
    });
    expect(patch).toEqual({
      layout: "split-h",
      primary: "battlemap",
      channelId: "ch_123",
      voiceChannelId: null,
      dndRoute: "world",
      followActive: false,
    });
  });

  it("merges patches cleanly onto default state with timestamp", () => {
    const merged = mergeSecondScreenState(
      DEFAULT_SECOND_SCREEN_STATE,
      { primary: "dnd-companion", dndRoute: "map", voiceChannelId: "vc_9" },
      NOW,
    );
    expect(merged).toEqual({
      ...DEFAULT_SECOND_SCREEN_STATE,
      primary: "dnd-companion",
      dndRoute: "map",
      voiceChannelId: "vc_9",
      updatedAt: NOW,
    });
  });

  it("identifies screen_ connections", () => {
    expect(isSecondScreenConnectionId("screen_abc123")).toBe(true);
    expect(isSecondScreenConnectionId("main_abc123")).toBe(false);
    expect(isSecondScreenConnectionId(null)).toBe(false);
  });
});

describe("planSweep for receive-only 2nd screen viewers", () => {
  it("keeps userId|screen_xyz connected while userId has an active seat in the room", () => {
    const plan = planSweep(
      [room("v1", ["u1|main1", 60_000, true], ["u1|screen_ipad1", 60_000, false])],
      { v1: [seat("u1", "main1")] },
      emptySweepState(),
      NOW,
    );
    expect(plan.remove).toEqual([]);
    expect(plan.silence).toEqual([]);
  });

  it("silences userId|screen_xyz immediately if canPublish is somehow true", () => {
    const plan = planSweep(
      [room("v1", ["u1|main1", 60_000, true], ["u1|screen_ipad1", 60_000, true])],
      { v1: [seat("u1", "main1")] },
      emptySweepState(),
      NOW,
    );
    expect(plan.remove).toEqual([]);
    expect(plan.silence).toEqual([{ room: "v1", identity: "u1|screen_ipad1" }]);
  });

  it("removes userId|screen_xyz after userId leaves the room, and removes immediately if blocked", () => {
    const first = planSweep(
      [room("v1", ["u1|screen_ipad1", 60_000, false])],
      {},
      emptySweepState(),
      NOW,
    );
    expect(first.remove).toEqual([]);
    const second = planSweep(
      [room("v1", ["u1|screen_ipad1", 60_000 + LIVEKIT_JOIN_GRACE_MS, false])],
      {},
      first.state,
      NOW + LIVEKIT_MISSING_GRACE_MS,
    );
    expect(second.remove).toEqual([{ room: "v1", identity: "u1|screen_ipad1" }]);

    const blockedPlan = planSweep(
      [room("v1", ["u1|screen_ipad2", 500, false])],
      {},
      { ...emptySweepState(), blocked: { "v1\nu1": NOW + 60_000 } },
      NOW,
    );
    expect(blockedPlan.remove).toEqual([{ room: "v1", identity: "u1|screen_ipad2" }]);
  });
});
