import { describe, expect, it } from "vitest";
import { serverColor } from "./servers";
import { importThemeCode, safeThemeColors } from "./themes";

describe("serverColor", () => {
  it("keeps a hex colour and refuses anything that could load a URL", () => {
    expect(serverColor(" #7B63E6 ", "#000000")).toBe("#7B63E6");
    expect(serverColor("url(//evil.example/x)", "#000000")).toBe("#000000");
    expect(serverColor("red", "#000000")).toBe("#000000");
    expect(serverColor(undefined, "#123456")).toBe("#123456");
  });
});

describe("shared theme colours", () => {
  it("keep plain colours and drop anything else", () => {
    expect(
      safeThemeColors({ paper: "#fff", panel: "rgba(1, 2, 3, 0.5)", chatBg: "hsl(200 50% 40%)", mint: "url(https://evil.example/a.png)", coral: "red;background:url(//x)" }),
    ).toEqual({ paper: "#fff", panel: "rgba(1, 2, 3, 0.5)", chatBg: "hsl(200 50% 40%)" });
  });

  it("are checked when a theme code is imported", () => {
    const code = `huddle-theme:v1:${Buffer.from(JSON.stringify({ name: "x", colors: { paper: "#101010", panel: "url(//evil.example)" } })).toString("base64")}`;
    expect(importThemeCode(code)?.colors).toEqual({ paper: "#101010" });
  });
});
