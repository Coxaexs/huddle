// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { LOUNGE_EVENT, useLivingRoom } from "@/app/hooks/use-living-room";
import type { VoiceParticipant } from "@/lib/protocol";

afterEach(cleanup);

const person = (connectionId: string) => ({ connectionId, id: connectionId, displayName: connectionId, joinedAt: 0 }) as unknown as VoiceParticipant;

/** The room open with me and one other person in it: they stand at (1, 0), I start at (-1, 0) facing the top of the room. */
function room() {
  const hook = renderHook(() => useLivingRoom({ roomId: "r", connectionId: "me", participants: [person("me"), person("you")], send: () => true }));
  act(() => hook.result.current.setOpen(true));
  act(() => {
    window.dispatchEvent(new CustomEvent(LOUNGE_EVENT, { detail: { t: "lounge", channelId: "r", connectionId: "you", pose: { x: 1, z: 0, facing: 0 } } }));
    hook.result.current.move({ x: -1, z: 0, facing: 0, seat: null });
  });
  return hook;
}

describe("where voices come from in the living room", () => {
  it("overhead, a voice stays where its speaker is on the screen when your avatar turns to walk", () => {
    const hook = room();
    act(() => hook.result.current.setEar(0));                                   // the camera looks at the top of the room
    const before = hook.result.current.heard!.get("you")!;
    expect(before.seat.x).toBeGreaterThan(1.5);                                // on my right
    // A: a step left, and the avatar turns to face left as it walks.
    act(() => hook.result.current.move({ x: -1.1, z: 0, facing: -Math.PI / 2, seat: null }));
    const after = hook.result.current.heard!.get("you")!;
    expect(after.seat.x).toBeGreaterThan(1.5);                                 // still on my right
    expect(Math.abs(after.seat.z)).toBeLessThan(0.1);                          // not swung behind me
    expect(after.pan).toBeCloseTo(before.pan, 1);
  });

  it("turning the camera turns what you hear, and through your eyes your facing does", () => {
    const hook = room();
    act(() => hook.result.current.setEar(Math.PI / 2));                       // the camera turned to look at the right wall
    expect(hook.result.current.heard!.get("you")!.seat.z).toBeLessThan(-1.5);   // ahead now
    act(() => hook.result.current.setEar(null));                                 // first person: the body's facing
    act(() => hook.result.current.move({ x: -1, z: 0, facing: -Math.PI / 2, seat: null }));
    expect(hook.result.current.heard!.get("you")!.seat.z).toBeGreaterThan(1.5);  // facing away from them: behind
  });
});
