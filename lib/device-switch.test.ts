import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { audioDevices, diffAudioDevices } from "../app/lib/devices";
import { deviceName, offerFor } from "../app/components/device-switch-prompt";

const info = (kind: MediaDeviceKind, deviceId: string, label = deviceId, groupId = "") =>
  ({ kind, deviceId, label, groupId }) as MediaDeviceInfo;

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("audio device hot-plug", () => {
  it("ignores the OS aliases, cameras and anonymous devices", () => {
    const devices = audioDevices([
      info("audioinput", "default", "Default - Headset"),
      info("audiooutput", "communications", "Communications - Headset"),
      info("videoinput", "cam", "Webcam"),
      info("audioinput", "", ""),
      info("audioinput", "mic-1", "USB Mic"),
    ]);
    expect(devices.map((device) => device.deviceId)).toEqual(["mic-1"]);
  });

  it("reports what was plugged in and pulled out", () => {
    const before = audioDevices([info("audioinput", "a"), info("audiooutput", "b")]);
    const after = audioDevices([info("audioinput", "a"), info("audioinput", "c")]);
    const { added, removed } = diffAudioDevices(before, after);
    expect(added.map((device) => device.deviceId)).toEqual(["c"]);
    expect(removed.map((device) => device.deviceId)).toEqual(["b"]);
  });

  it("offers a headset's microphone and speaker together", () => {
    const added = audioDevices([
      info("audiooutput", "other-out", "Monitor", "g1"),
      info("audioinput", "hs-in", "Headset", "g2"),
      info("audiooutput", "hs-out", "Headset", "g2"),
    ]);
    const offer = offerFor(added, true);
    expect(offer?.microphone?.deviceId).toBe("hs-in");
    expect(offer?.speaker?.deviceId).toBe("hs-out");
  });

  it("never offers a speaker where output cannot be chosen, nor what is already chosen", () => {
    expect(offerFor(audioDevices([info("audiooutput", "out")]), false)).toBeNull();
    window.localStorage.setItem("huddle-device-mic", "mic");
    expect(offerFor(audioDevices([info("audioinput", "mic")]), true)).toBeNull();
  });

  it("drops Chromium's USB id from names", () => {
    expect(deviceName("Jabra Evolve 65 (0b0e:030c)")).toBe("Jabra Evolve 65");
    expect(deviceName("MacBook Pro Microphone")).toBe("MacBook Pro Microphone");
  });
});
