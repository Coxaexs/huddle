import { describe, expect, it } from "vitest";
import {
  handRaiseQueue,
  hasHandRaised,
  initialSpeakAllowed,
  resolveSeatMute,
  shouldStartMuted,
  splitStageRoster,
  type StageSeat,
} from "@/lib/stage";

/** The extra fields these tests read back off a participant. */
type FakeSeat = StageSeat & {
  handRaised?: boolean;
  displayName?: string;
  id?: string;
  color?: string;
};

/** A seat that starts in the audience, the common case in a stage room. */
function seat(overrides: Partial<FakeSeat> = {}): FakeSeat {
  return { muted: true, ...overrides };
}

describe("splitStageRoster", () => {
  it("follows the host's grant rather than the mic when the hub sets it", () => {
    // Brought up but not yet unmuted: already on stage. A muted speaker
    // stays up; an unmuted seat without the floor stays in the audience.
    const { onStage, audience } = splitStageRoster([
      seat({ muted: true, speakAllowed: true }),
      seat({ muted: false, speakAllowed: false }),
      seat({ muted: false, speakAllowed: true, serverMuted: true }),
    ]);
    expect(onStage).toHaveLength(1);
    expect(audience).toHaveLength(2);
  });

  it("puts an unmuted person on stage and a muted one in the audience", () => {
    const { onStage, audience } = splitStageRoster([
      seat({ muted: false }),
      seat({ muted: true }),
    ]);
    expect(onStage).toHaveLength(1);
    expect(audience).toHaveLength(1);
  });

  it("keeps a server-muted person in the audience even when unmuted locally", () => {
    // They are silenced, so putting them on stage would promise an audience
    // something they cannot hear.
    const { onStage, audience } = splitStageRoster([
      seat({ muted: false, serverMuted: true }),
    ]);
    expect(onStage).toHaveLength(0);
    expect(audience).toHaveLength(1);
  });

  it("treats a missing serverMuted flag as not server-muted", () => {
    const { onStage } = splitStageRoster([{ muted: false }]);
    expect(onStage).toHaveLength(1);
  });

  it("accounts for every participant exactly once", () => {
    const people = [
      seat({ muted: false }),
      seat({ muted: true }),
      seat({ muted: false, serverMuted: true }),
      seat({ muted: true, serverMuted: true }),
    ];
    const { onStage, audience } = splitStageRoster(people);
    expect(onStage.length + audience.length).toBe(people.length);
  });

  it("preserves the original order, so the roster does not reshuffle", () => {
    const a = { muted: true, id: "a" };
    const b = { muted: true, id: "b" };
    const c = { muted: true, id: "c" };
    const { audience } = splitStageRoster([a, b, c]);
    expect(audience.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("handles an empty room", () => {
    expect(splitStageRoster([])).toEqual({ onStage: [], audience: [] });
  });

  it("keeps extra participant fields intact", () => {
    const { onStage } = splitStageRoster([
      { muted: false, displayName: "Alice", color: "#fff" },
    ]);
    expect(onStage[0].displayName).toBe("Alice");
  });
});

describe("shouldStartMuted", () => {
  it("starts a stage muted for someone without SPEAK", () => {
    expect(shouldStartMuted("stage", false)).toBe(true);
  });

  it("lets someone with SPEAK open a stage unmuted", () => {
    expect(shouldStartMuted("stage", true)).toBe(false);
  });

  it("never mutes a plain voice room, where everyone is a peer", () => {
    expect(shouldStartMuted("voice", false)).toBe(false);
    expect(shouldStartMuted("voice", true)).toBe(false);
  });

  it("does not mute text-like kinds, which have no microphone", () => {
    for (const kind of ["text", "announcement", "forum", "dm"]) {
      expect(shouldStartMuted(kind, false)).toBe(false);
    }
  });

  it("falls back to a text channel for an unknown kind, so it does not mute", () => {
    expect(shouldStartMuted("something-new", false)).toBe(false);
    expect(shouldStartMuted(null, false)).toBe(false);
  });
});

describe("handRaiseQueue", () => {
  it("lists audience members with a hand up, in order", () => {
    const queue = handRaiseQueue([
      seat({ handRaised: true, displayName: "Alice" }),
      seat({ handRaised: false, displayName: "Bob" }),
      seat({ handRaised: true, displayName: "Carol" }),
    ]);
    expect(queue.map((p) => p.displayName)).toEqual(["Alice", "Carol"]);
  });

  it("excludes someone already speaking, even with a stale flag", () => {
    // Already being heard, so there is nothing left to ask for.
    const queue = handRaiseQueue([{ muted: false, handRaised: true }]);
    expect(queue).toEqual([]);
  });

  it("excludes a server-muted person, whose hand the hosts cannot answer", () => {
    const queue = handRaiseQueue([{ muted: true, serverMuted: true, handRaised: true }]);
    expect(queue).toEqual([]);
  });

  it("is empty when nobody has a hand up", () => {
    expect(handRaiseQueue([seat(), seat()])).toEqual([]);
  });
});

describe("hasHandRaised", () => {
  it("is true only for an explicit true", () => {
    expect(hasHandRaised({ muted: true, handRaised: true })).toBe(true);
    expect(hasHandRaised({ muted: true, handRaised: false })).toBe(false);
    expect(hasHandRaised({ muted: true })).toBe(false);
  });
});

describe("initialSpeakAllowed", () => {
  it("grants the floor on join only where nothing has to be granted", () => {
    expect(initialSpeakAllowed("voice", false)).toBe(true);
    expect(initialSpeakAllowed("text", false)).toBe(true);
  });

  it("withholds the floor in a stage from someone without SPEAK", () => {
    expect(initialSpeakAllowed("stage", false)).toBe(false);
  });

  it("gives a stage host the floor on arrival", () => {
    expect(initialSpeakAllowed("stage", true)).toBe(true);
  });
});

describe("resolveSeatMute", () => {
  it("honours the request in a voice room, where nobody has to be granted anything", () => {
    // A voice room is a conversation between peers; refusing an unmute there
    // would be the bug, not the protection.
    expect(resolveSeatMute({ kind: "voice", speakAllowed: true, requestedMuted: false })).toBe(false);
    expect(resolveSeatMute({ kind: "voice", speakAllowed: false, requestedMuted: true })).toBe(true);
  });

  it("keeps a stage seat without the floor muted however it asks", () => {
    // The whole enforcement: a client that skipped its own auto-mute, or that
    // sent `muted: false` straight after joining, still ends up muted.
    expect(resolveSeatMute({ kind: "stage", speakAllowed: false, requestedMuted: false })).toBe(true);
  });

  it("lets a seat that was put on stage unmute itself", () => {
    expect(resolveSeatMute({ kind: "stage", speakAllowed: true, requestedMuted: false })).toBe(false);
  });

  it("still lets a promoted seat mute itself again", () => {
    expect(resolveSeatMute({ kind: "stage", speakAllowed: true, requestedMuted: true })).toBe(true);
  });

  it("applies the join rule through the same function", () => {
    // Joining asks for unmuted, so a stage seat without the floor lands muted
    // and a voice-room seat does not.
    expect(resolveSeatMute({ kind: "stage", speakAllowed: false, requestedMuted: false })).toBe(true);
    expect(resolveSeatMute({ kind: "voice", speakAllowed: true, requestedMuted: false })).toBe(false);
  });

  it("treats an unknown kind as a normal room rather than silencing it", () => {
    expect(resolveSeatMute({ kind: "something-new", speakAllowed: false, requestedMuted: false })).toBe(false);
    expect(resolveSeatMute({ kind: null, speakAllowed: false, requestedMuted: false })).toBe(false);
  });
});

