import { afterEach, expect, it, vi } from "vitest";
import { primeDeviceLabels } from "./devices";

afterEach(() => vi.unstubAllGlobals());

function devices(labels: string[]) {
  const stop = vi.fn();
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }));
  vi.stubGlobal("navigator", {
    mediaDevices: {
      enumerateDevices: async () => labels.map((label) => ({ kind: "audioinput", label, deviceId: label || "x" })),
      getUserMedia,
    },
  });
  return { getUserMedia, stop };
}

it("leaves the microphone alone when its name is already readable", async () => {
  const { getUserMedia } = devices(["MacBook Pro Microphone"]);
  await primeDeviceLabels();
  expect(getUserMedia).not.toHaveBeenCalled();
});

it("reads blank names through an unprocessed capture, and lets it go", async () => {
  const { getUserMedia, stop } = devices([""]);
  await primeDeviceLabels();
  // Echo cancellation would start Apple's voice processing on a Mac.
  expect(getUserMedia).toHaveBeenCalledWith({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    video: false,
  });
  expect(stop).toHaveBeenCalled();
});
