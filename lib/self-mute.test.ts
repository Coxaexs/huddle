import { afterEach, describe, expect, it, vi } from "vitest";
import { readSelfMute, saveSelfMute } from "../app/lib/self-mute";

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

  it("does not break when storage refuses", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("denied");
      },
    });
    expect(readSelfMute()).toBe(false);
    expect(() => saveSelfMute(true)).not.toThrow();
  });
});
