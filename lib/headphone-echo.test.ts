import { describe, expect, it } from "vitest";
import { outputKind } from "../app/components/headphone-echo-prompt";

describe("output kind from a device label", () => {
  it("recognises headphones and headsets across platforms", () => {
    for (const label of [
      "Headphones (Realtek(R) Audio)",
      "Default - Headphones (Realtek(R) Audio)",
      "Headset Earphone (HyperX Cloud II Wireless)",
      "Headset (WH-1000XM4 Hands-Free AG Audio)",
      "WH-1000XM5",
      "AirPods Pro",
      "Galaxy Buds2 Pro",
      "External Headphones",
      "Kopfhörer (Realtek High Definition Audio)",
      "Kulaklık (Realtek(R) Audio)",
      "Arctis Nova 7 Game (SteelSeries Arctis Nova 7)",
      "Jabra Evolve2 65",
      "Logitech G PRO X Gaming Headset",
      "Headphones - Built-in Audio Analog Stereo",
    ]) {
      expect(outputKind(label), label).toBe("headphones");
    }
  });

  it("recognises loudspeakers", () => {
    for (const label of [
      "Speakers (Realtek(R) Audio)",
      "Default - Speakers (High Definition Audio Device)",
      "MacBook Pro Speakers",
      "Hoparlör (Realtek(R) Audio)",
      "LG ULTRAGEAR (NVIDIA High Definition Audio)",
      "HDMI / DisplayPort - Built-in Audio",
      "Built-in Audio Analog Stereo Speaker",
    ]) {
      expect(outputKind(label), label).not.toBe("headphones");
    }
    expect(outputKind("Speakers (Realtek(R) Audio)")).toBe("speakers");
    expect(outputKind("MacBook Pro Speakers")).toBe("speakers");
  });

  it("does not guess at a name that says nothing", () => {
    expect(outputKind("Realtek Digital Output (Realtek(R) Audio)")).toBe("unknown");
    expect(outputKind("USB Audio Device")).toBe("unknown");
  });
});
