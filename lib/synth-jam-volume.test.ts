import { describe, expect, it } from "vitest";
import { jamEngine } from "../app/lib/synth-jam";

describe("Gesture Synth volume controls", () => {
  it("defaults to a reasonable volume and unmuted", () => {
    expect(jamEngine.getVolume()).toBeGreaterThanOrEqual(0);
    expect(jamEngine.getVolume()).toBeLessThanOrEqual(1);
    expect(typeof jamEngine.isMuted()).toBe("boolean");
  });

  it("sets and clamps master volume", () => {
    jamEngine.setVolume(0.5);
    expect(jamEngine.getVolume()).toBe(0.5);

    jamEngine.setVolume(1.8);
    expect(jamEngine.getVolume()).toBe(1.0);

    jamEngine.setVolume(-0.2);
    expect(jamEngine.getVolume()).toBe(0);

    // Restore to 0.8
    jamEngine.setVolume(0.8);
    expect(jamEngine.getVolume()).toBe(0.8);
  });

  it("toggles mute state and notifies subscribers", () => {
    let notified = 0;
    const unsubscribe = jamEngine.subscribeVolume(() => {
      notified += 1;
    });

    jamEngine.setMuted(true);
    expect(jamEngine.isMuted()).toBe(true);
    expect(notified).toBe(1);

    jamEngine.setMuted(false);
    expect(jamEngine.isMuted()).toBe(false);
    expect(notified).toBe(2);

    unsubscribe();
    jamEngine.setMuted(true);
    expect(notified).toBe(2); // no new notifications after unsubscribe
    jamEngine.setMuted(false);
  });

  it("controls per-seat mute and volume overrides", () => {
    const seatId = "seat-123";
    expect(jamEngine.isSeatMuted(seatId)).toBe(false);
    expect(jamEngine.getSeatVolume(seatId)).toBe(1);

    jamEngine.setSeatMuted(seatId, true);
    expect(jamEngine.isSeatMuted(seatId)).toBe(true);

    jamEngine.setSeatVolume(seatId, 0.4);
    expect(jamEngine.getSeatVolume(seatId)).toBe(0.4);

    jamEngine.setSeatMuted(seatId, false);
    expect(jamEngine.isSeatMuted(seatId)).toBe(false);

    jamEngine.drop(seatId);
    expect(jamEngine.isSeatMuted(seatId)).toBe(false);
    expect(jamEngine.getSeatVolume(seatId)).toBe(1);
  });
});
