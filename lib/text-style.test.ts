import { describe, expect, it } from "vitest";
import {
  TAG_PATTERN,
  applyMessageFont,
  describeTag,
  resolveColor,
  resolveFont,
  stripTextStyle,
} from "./text-style";

describe("resolveColor", () => {
  it("accepts names, hex and Messenger Plus! numbers", () => {
    expect(resolveColor("red")).toBe("#e5484d");
    expect(resolveColor("#ABC")).toBe("#abc");
    expect(resolveColor("ff00aa")).toBe("#ff00aa");
    expect(resolveColor("4")).toBe("#ff0000");
  });

  it("rejects anything that could smuggle CSS", () => {
    expect(resolveColor("red;background:url(x)")).toBeNull();
    expect(resolveColor("expression")).toBeNull();
    expect(resolveColor("99")).toBeNull();
    expect(resolveColor("#12345")).toBeNull();
  });
});

describe("describeTag", () => {
  it("builds validated styles", () => {
    expect(describeTag("c", "blue")?.style).toEqual({ color: "#3e7bfa" });
    expect(describeTag("COLOR", "blue")?.tag).toBe("c");
    expect(describeTag("font", "comic")?.style.fontFamily).toContain("Comic Sans MS");
    expect(describeTag("size", "huge")?.style).toEqual({ fontSize: "1.75em" });
    expect(describeTag("rainbow")?.className).toBe("fx fx-rainbow");
    expect(describeTag("hl")?.style.backgroundColor).toBeTruthy();
  });

  it("makes a gradient when the closing tag has a colour", () => {
    expect(describeTag("c", "red", "blue")?.className).toBe("fx-gradient");
  });

  it("refuses unknown arguments", () => {
    expect(describeTag("c", "notacolour")).toBeNull();
    expect(describeTag("font", "wingdings")).toBeNull();
    expect(describeTag("size", "gigantic")).toBeNull();
    expect(describeTag("marquee")).toBeNull();
  });
});

describe("resolveFont", () => {
  it("matches ids and display names", () => {
    expect(resolveFont("comic")?.id).toBe("comic");
    expect(resolveFont("Times New Roman")?.id).toBe("times");
    expect(resolveFont("nope")).toBeNull();
  });
});

describe("TAG_PATTERN", () => {
  it("pairs tags case-insensitively and lazily", () => {
    const matches = [..."[B]hi[/b] and [c=4]x[/c]".matchAll(TAG_PATTERN)];
    expect(matches.map((m) => m.groups?.body)).toEqual(["hi", "x"]);
  });
});

describe("stripTextStyle", () => {
  it("removes nested tags but keeps unknown ones verbatim", () => {
    expect(stripTextStyle("[c=red][b]hi[/b][/c] [c=zzz]no[/c]")).toBe("hi [c=zzz]no[/c]");
    expect(stripTextStyle("[c=red]grad[/c=blue]")).toBe("grad");
    expect(stripTextStyle("-# small print")).toBe("small print");
  });
});

describe("applyMessageFont", () => {
  it("wraps the message in the chosen font", () => {
    expect(applyMessageFont("hello", { font: "comic", color: "blue", bold: true })).toBe(
      "[f=comic][c=blue][b]hello[/b][/c][/f]",
    );
  });

  it("leaves text alone for the default font, blanks and code blocks", () => {
    expect(applyMessageFont("hello", {})).toBe("hello");
    expect(applyMessageFont("hello", null)).toBe("hello");
    expect(applyMessageFont("  ", { bold: true })).toBe("  ");
    expect(applyMessageFont("```js\nx\n```", { bold: true })).toBe("```js\nx\n```");
  });

  it("drops values it can't validate", () => {
    expect(applyMessageFont("hi", { font: "wingdings", color: "blue" })).toBe("[c=blue]hi[/c]");
  });
});
