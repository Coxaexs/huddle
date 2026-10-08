import { describe, expect, it } from "vitest";
import { applyTtsEffect, clampTtsVoice } from "@/app/lib/tts/client";

function tone(seconds = 0.5, rate = 24000, hz = 220) {
  return Float32Array.from({ length: rate * seconds }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / rate));
}
const peak = (a: Float32Array) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe("TTS voice effects", () => {
  it("leaves audio untouched without an effect", () => {
    const audio = tone();
    expect(applyTtsEffect(audio, 24000, "none")).toBe(audio);
    expect(applyTtsEffect(audio, 24000, undefined)).toBe(audio);
  });

  it("ring-modulates for the robot voice, at the same peak level", () => {
    const audio = tone();
    const robot = applyTtsEffect(audio, 24000, "robot");
    expect(robot).not.toBe(audio);
    expect(robot.length).toBe(audio.length);
    const differs = robot.some((x, i) => Math.abs(x - audio[i]) > 0.05);
    expect(differs).toBe(true);
    expect(peak(robot)).toBeCloseTo(peak(audio), 5);
  });

  it("only accepts known effects from a payload", () => {
    expect(clampTtsVoice({ effect: "robot" }).effect).toBe("robot");
    expect(clampTtsVoice({ effect: "<script>" }).effect).toBe("none");
    expect(clampTtsVoice({ speaker: "male" }).speaker).toBe("male");
    expect(clampTtsVoice({ speaker: "bass" }).speaker).toBe("default");
    expect(clampTtsVoice(null)).toEqual({ tempo: 1, pitch: 1, effect: "none", speaker: "default" });
  });
});
