import { describe, expect, it } from "vitest";
import {
  CARD_ENTRANCES,
  CARD_FINISHES,
  JOIN_FLOURISHES,
  NAME_EFFECTS,
  NAME_FONTS,
  STYLE_LOOKS,
  VOICE_RINGS,
  normalizeProfileStyle,
  themeIsLight,
} from "../lib/profile-style";

describe("normalizeProfileStyle", () => {
  it("returns an empty style for junk", () => {
    expect(normalizeProfileStyle(null)).toEqual({});
    expect(normalizeProfileStyle("gradient")).toEqual({});
    expect(normalizeProfileStyle([1, 2])).toEqual({});
  });

  it("keeps known ids and lower-cases colours", () => {
    expect(
      normalizeProfileStyle({
        font: "pixel",
        effect: "gradient",
        nameColors: ["#FF00AA", "#00ff00", "#0000ff"],
        theme: ["#112233", "#AABBCC"],
        finish: "holo",
        pattern: "stars",
        edge: "flow",
        motion: "float",
        entrance: "flip",
        ring: "orbit",
        ringColor: "#ABCDEF",
        join: "portal",
        tile: "plain",
      }),
    ).toEqual({
      font: "pixel",
      effect: "gradient",
      nameColors: ["#ff00aa", "#00ff00", "#0000ff"],
      theme: ["#112233", "#aabbcc"],
      finish: "holo",
      pattern: "stars",
      edge: "flow",
      motion: "float",
      entrance: "flip",
      ring: "orbit",
      ringColor: "#abcdef",
      join: "portal",
      tile: "plain",
    });
  });

  it("drops unknown ids, bad colours and CSS smuggling", () => {
    expect(
      normalizeProfileStyle({
        font: "comic sans; color: red",
        effect: "nope",
        theme: ["red", "#000000"],
        ringColor: "url(javascript:alert(1))",
        finish: "</style>",
        pattern: "none",
      }),
    ).toEqual({});
  });

  it("fits the colours to what the effect takes", () => {
    expect(normalizeProfileStyle({ effect: "solid", nameColors: ["#111111", "#222222"] }).nameColors).toEqual(["#111111"]);
    // Too few colours are topped up from the effect's defaults, not rejected.
    expect(normalizeProfileStyle({ effect: "toon", nameColors: ["#111111"] }).nameColors).toEqual(["#111111", "#ff4d6d"]);
    // Effects that bring their own colours carry none.
    expect(normalizeProfileStyle({ effect: "rainbow", nameColors: ["#111111"] })).toEqual({ effect: "rainbow" });
  });

  it("does not store the default font or an empty pattern", () => {
    expect(normalizeProfileStyle({ font: "default", pattern: "none" })).toEqual({});
  });

  it("accepts every look as it is written", () => {
    for (const look of STYLE_LOOKS) expect(normalizeProfileStyle(look.style)).toEqual(look.style);
  });

  it("has unique ids in every catalog", () => {
    for (const list of [NAME_FONTS, NAME_EFFECTS, CARD_FINISHES, CARD_ENTRANCES, VOICE_RINGS, JOIN_FLOURISHES]) {
      const ids = list.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("themeIsLight", () => {
  it("flips text on pale themes only", () => {
    expect(themeIsLight(["#ffd6ec", "#b9e2ff"])).toBe(true);
    expect(themeIsLight(["#1e1b4b", "#04030f"])).toBe(false);
  });
});
