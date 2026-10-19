import { afterEach, describe, expect, it, vi } from "vitest";
import { sharedWindowId, shellCapturesShareAudio } from "@/app/lib/app-audio";

const track = (label: string) => ({ label }) as MediaStreamTrack;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sharedWindowId", () => {
  it("reads the native window id from a Chromium window capture", () => {
    expect(sharedWindowId(track("window:132456:0"))).toBe("132456");
  });

  it("has none for a whole screen, a tab or no track", () => {
    expect(sharedWindowId(track("screen:0:0"))).toBeUndefined();
    expect(sharedWindowId(track("web-contents-media-stream://1:2"))).toBeUndefined();
    expect(sharedWindowId(undefined)).toBeUndefined();
  });
});

describe("shellCapturesShareAudio", () => {
  it("is false in a browser and in the Electron app, which capture through getDisplayMedia", async () => {
    vi.stubGlobal("window", {});
    expect(await shellCapturesShareAudio()).toBe(false);
    vi.stubGlobal("window", { huddle: { appAudio: { active: async () => false, onData: () => () => undefined, stop() {} } } });
    expect(await shellCapturesShareAudio()).toBe(false);
  });

  it("asks a shell with start whether its helper is there", async () => {
    const appAudio = { start: async () => true, active: async () => true, onData: () => () => undefined, stop() {} };
    vi.stubGlobal("window", { huddle: { appAudio: { ...appAudio, available: async () => true } } });
    expect(await shellCapturesShareAudio()).toBe(true);
    vi.stubGlobal("window", { huddle: { appAudio: { ...appAudio, available: async () => false } } });
    expect(await shellCapturesShareAudio()).toBe(false);
  });

  it("keeps Lite builds without the helper commands on the browser's audio", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "app_audio_available") throw new Error("command app_audio_available not found");
      return false;
    });
    vi.stubGlobal("window", { __TAURI__: { core: { invoke }, event: { listen: async () => () => undefined } } });
    expect(await shellCapturesShareAudio()).toBe(false);
    invoke.mockImplementation(async () => true);
    expect(await shellCapturesShareAudio()).toBe(true);
  });
});
