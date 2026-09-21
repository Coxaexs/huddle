import { describe, expect, it } from "vitest";

describe("Dice Roll & Theme Features", () => {
  it("builds predetermined notation for dice-box-threejs", async () => {
    const { buildDiceBoxNotation } = await import("../app/components/dice-overlay");

    const singleRoll: any = {
      dice: [{ sides: 20, rolls: [{ value: 14, kept: true }] }],
    };
    expect(buildDiceBoxNotation(singleRoll)).toBe("1d20@14");

    const advRoll: any = {
      dice: [{ sides: 20, rolls: [{ value: 14, kept: false }, { value: 19, kept: true }] }],
    };
    expect(buildDiceBoxNotation(advRoll)).toBe("2d20@14,19");

    const multiRoll: any = {
      dice: [
        { sides: 20, rolls: [{ value: 14, kept: true }] },
        { sides: 6, rolls: [{ value: 5, kept: true }] },
      ],
    };
    expect(buildDiceBoxNotation(multiRoll)).toBe("1d20+1d6@14,5");
  });

  it("parses inline theme names and hex colors correctly", () => {
    const allowedThemes = ["default", "pride", "trans", "nonbinary"];
    const COLOR_NAMES: Record<string, string> = {
      blue: "#2563eb",
      skyblue: "#0284c7",
      pink: "#db2777",
      red: "#e11d48",
    };

    function parseCommand(rawInput: string) {
      let parsedTheme: string | undefined;
      let parsedThemeColor: string | undefined;
      let input = rawInput.replace(/^\/roll\s*/i, "").trim();

      const hexMatch = input.match(/(?:^|\s)#([0-9a-fA-F]{6})\b/);
      if (hexMatch) {
        parsedThemeColor = `#${hexMatch[1]}`;
        input = input.replace(hexMatch[0], " ").trim();
      }

      const tokens = input.split(/\s+/);
      const remainingTokens: string[] = [];
      for (const token of tokens) {
        const lower = token.toLowerCase();
        if (allowedThemes.includes(lower)) {
          parsedTheme = lower;
        } else if (COLOR_NAMES[lower]) {
          parsedThemeColor = COLOR_NAMES[lower];
        } else {
          remainingTokens.push(token);
        }
      }
      input = remainingTokens.join(" ").trim();
      return { input, parsedTheme, parsedThemeColor };
    }

    expect(parseCommand("/roll 1d20 pride")).toEqual({
      input: "1d20",
      parsedTheme: "pride",
      parsedThemeColor: undefined,
    });

    expect(parseCommand("/roll 2d6 trans")).toEqual({
      input: "2d6",
      parsedTheme: "trans",
      parsedThemeColor: undefined,
    });

    expect(parseCommand("/roll 1d20 blue")).toEqual({
      input: "1d20",
      parsedTheme: undefined,
      parsedThemeColor: "#2563eb",
    });

    expect(parseCommand("/roll 1d20 #db2777")).toEqual({
      input: "1d20",
      parsedTheme: undefined,
      parsedThemeColor: "#db2777",
    });
  });
});
