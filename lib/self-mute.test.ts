import { afterEach, describe, expect, it, vi } from "vitest";
import { micOpen, mutedAfterForcedMute, readSelfDeafen, readSelfMute, saveSelfDeafen, saveSelfMute } from "../app/lib/self-mute";

function stubStorage(store: Map<string, string>) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("self mute", () => {
  it("starts unmuted", () => {
    stubStorage(new Map());
    expect(readSelfMute()).toBe(false);
  });

  it("remembers the choice both ways", () => {
    stubStorage(new Map());
    saveSelfMute(true);
    expect(readSelfMute()).toBe(true);
    saveSelfMute(false);
    expect(readSelfMute()).toBe(false);
  });

  it("keeps deafen apart from mute", () => {
    stubStorage(new Map());
    saveSelfDeafen(true);
    expect(readSelfDeafen()).toBe(true);
    expect(readSelfMute()).toBe(false);
    saveSelfDeafen(false);
    expect(readSelfDeafen()).toBe(false);
  });

  it("does not break when storage refuses", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("denied");
      },
    });
    expect(readSelfMute()).toBe(false);
    expect(readSelfDeafen()).toBe(false);
    expect(() => saveSelfMute(true)).not.toThrow();
    expect(() => saveSelfDeafen(true)).not.toThrow();
  });
});

describe("mutedAfterForcedMute", () => {
  it("mutes when server-muted and restores an open mic when server-unmuted", () => {
    expect(mutedAfterForcedMute({ forcedMute: true, selfMuted: false, deafened: false })).toBe(true);
    expect(mutedAfterForcedMute({ forcedMute: false, selfMuted: false, deafened: false })).toBe(false);
  });

  it("keeps self-mute, deafen, and stage audience mute when server-unmuted", () => {
    expect(mutedAfterForcedMute({ forcedMute: false, selfMuted: true, deafened: false })).toBe(true);
    expect(mutedAfterForcedMute({ forcedMute: false, selfMuted: false, deafened: true })).toBe(true);
    expect(mutedAfterForcedMute({ forcedMute: false, selfMuted: false, deafened: false, speakAllowed: false })).toBe(true);
    expect(mutedAfterForcedMute({ forcedMute: false, selfMuted: false, deafened: false, speakAllowed: true })).toBe(false);
  });
});

describe("micOpen", () => {
  const base = { forcedMute: false, whispering: false, pushToTalk: false, pttHeld: false, muted: false };

  it("follows the mute state without push-to-talk", () => {
    expect(micOpen(base)).toBe(true);
    expect(micOpen({ ...base, muted: true })).toBe(false);
  });

  it("opens only while the push-to-talk key is held, whatever mute says", () => {
    expect(micOpen({ ...base, pushToTalk: true })).toBe(false);
    expect(micOpen({ ...base, pushToTalk: true, pttHeld: true })).toBe(true);
    expect(micOpen({ ...base, pushToTalk: true, pttHeld: true, muted: true })).toBe(true);
    // A held key means nothing once push-to-talk is off.
    expect(micOpen({ ...base, pttHeld: true, muted: true })).toBe(false);
  });

  it("opens for a whisper through mute and an unheld push-to-talk key", () => {
    expect(micOpen({ ...base, whispering: true, muted: true })).toBe(true);
    expect(micOpen({ ...base, whispering: true, pushToTalk: true })).toBe(true);
  });

  it("stays closed under a server mute, whatever else is set", () => {
    expect(micOpen({ ...base, forcedMute: true })).toBe(false);
    expect(micOpen({ ...base, forcedMute: true, whispering: true })).toBe(false);
    expect(micOpen({ ...base, forcedMute: true, pushToTalk: true, pttHeld: true })).toBe(false);
  });

  it("reopens after a server mute is lifted only if the user's own state allows it", () => {
    const lifted = (own: { selfMuted: boolean; deafened: boolean; speakAllowed?: boolean }) =>
      micOpen({ ...base, muted: mutedAfterForcedMute({ forcedMute: false, ...own }) });
    expect(lifted({ selfMuted: false, deafened: false })).toBe(true);
    expect(lifted({ selfMuted: true, deafened: false })).toBe(false);
    expect(lifted({ selfMuted: false, deafened: true })).toBe(false);
    expect(lifted({ selfMuted: false, deafened: false, speakAllowed: false })).toBe(false);
  });
});
