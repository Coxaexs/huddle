import { describe, expect, it } from "vitest";
import { convertMsnEmoticons } from "./msn-emoticons";

describe("convertMsnEmoticons", () => {
  it("converts standalone emoticons", () => {
    expect(convertMsnEmoticons("hi :) (Y) <3")).toBe("hi 🙂 👍 ❤️");
    expect(convertMsnEmoticons(":D")).toBe("😃");
    expect(convertMsnEmoticons("line one ;)\nline two :(")).toBe("line one 😉\nline two 🙁");
  });

  it("accepts either case for letter codes", () => {
    expect(convertMsnEmoticons("(y) (brb)")).toBe("👍 🔙");
  });

  it("leaves urls, times and glued text alone", () => {
    expect(convertMsnEmoticons("see http://x.com at 12:30")).toBe("see http://x.com at 12:30");
    expect(convertMsnEmoticons("smile:)")).toBe("smile:)");
    expect(convertMsnEmoticons("(Y)es")).toBe("(Y)es");
  });

  it("skips messages with code", () => {
    expect(convertMsnEmoticons("`:)` :)")).toBe("`:)` :)");
  });
});
