import { describe, expect, it } from "vitest";
import { comboToAccelerator, globalShortcutProblem } from "./hotkeys";

describe("comboToAccelerator", () => {
  it("keeps Ctrl as Ctrl, so a Mac does not turn it into Cmd", () => {
    expect(comboToAccelerator("Ctrl+Shift+KeyM")).toBe("Control+Shift+M");
    expect(comboToAccelerator("Meta+KeyM")).toBe("Super+M");
  });

  it("takes symbol and numpad keys (ö, ç, ş on a Turkish keyboard)", () => {
    expect(comboToAccelerator("Alt+Comma")).toBe("Alt+,");
    expect(comboToAccelerator("Alt+Period")).toBe("Alt+.");
    expect(comboToAccelerator("Alt+Semicolon")).toBe("Alt+;");
    expect(comboToAccelerator("Alt+BracketLeft")).toBe("Alt+[");
    expect(comboToAccelerator("Ctrl+Numpad5")).toBe("Control+num5");
    expect(comboToAccelerator("Alt+Backquote")).toBe("Alt+`");
  });

  it("refuses bare modifiers and keys Electron cannot name", () => {
    expect(comboToAccelerator("Ctrl+ControlLeft")).toBe("");
    expect(comboToAccelerator("Alt+IntlBackslash")).toBe("");
  });
});

describe("globalShortcutProblem", () => {
  it("accepts ordinary choices", () => {
    expect(globalShortcutProblem("Alt+Comma")).toBe("");
    expect(globalShortcutProblem("Ctrl+Shift+KeyO")).toBe("");
    expect(globalShortcutProblem("Shift+F9")).toBe("");
    expect(globalShortcutProblem("Ctrl+Alt+KeyC")).toBe("");
  });

  it("needs Ctrl, Alt or Cmd, not Shift alone", () => {
    expect(globalShortcutProblem("KeyH")).toBe("modifier");
    expect(globalShortcutProblem("Shift+KeyH")).toBe("modifier");
  });

  it("leaves copy and paste alone", () => {
    expect(globalShortcutProblem("Ctrl+KeyC")).toBe("reserved");
    expect(globalShortcutProblem("Meta+KeyV")).toBe("reserved");
  });

  it("names unusable keys", () => {
    expect(globalShortcutProblem("Alt+ArrowUp")).toBe("key");
  });
});
