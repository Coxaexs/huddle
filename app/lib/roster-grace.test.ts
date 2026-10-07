import { describe, expect, it } from "vitest";
import type { VoiceParticipant } from "@/lib/protocol";
import { withRosterGrace } from "./roster-grace";

const seat = (id: string, connectionId: string, bot = false) =>
  ({ id, connectionId, bot, joinedAt: 0, muted: false, deafened: false }) as unknown as VoiceParticipant;

describe("withRosterGrace", () => {
  it("returns the fresh roster when there is no grace", () => {
    const fresh = { a: [seat("u1", "c1")] };
    expect(withRosterGrace(fresh, null)).toBe(fresh);
  });

  it("keeps people who have not reconnected yet", () => {
    const merged = withRosterGrace({ a: [seat("u1", "c1")] }, { a: [seat("u1", "c1"), seat("u2", "c2")] });
    expect(merged.a.map((p) => p.connectionId)).toEqual(["c1", "c2"]);
  });

  it("does not seat someone twice who came back under a new id", () => {
    const merged = withRosterGrace({ a: [seat("u2", "c9")] }, { a: [seat("u2", "c2")] });
    expect(merged.a.map((p) => p.connectionId)).toEqual(["c9"]);
  });

  it("drops a stale seat once its connection shows up in another room", () => {
    const merged = withRosterGrace({ b: [seat("u1", "c1")] }, { a: [seat("u1", "c1")] });
    expect(merged.a).toBeUndefined();
    expect(merged.b).toHaveLength(1);
  });
});
