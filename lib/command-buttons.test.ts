import { describe, expect, it } from "vitest";
import { BUTTON_COMMANDS, COMMAND_BUTTON_SOURCE, parseButtonCommand, readCommandButton } from "./command-buttons";
import { COMMAND_ALIASES } from "@/app/lib/commands";
import { ROLL_COMMANDS } from "@/app/lib/chat/commands/roll";

function tokens(text: string) {
  return [...text.matchAll(new RegExp(COMMAND_BUTTON_SOURCE, "gi"))].map((match) => ({
    label: match.groups?.btnlabel,
    body: match.groups?.btncmd,
  }));
}

describe("COMMAND_BUTTON_SOURCE", () => {
  it("finds plain and labelled buttons", () => {
    expect(tokens("press <button>/roll 1d20</button> now")).toEqual([{ label: undefined, body: "/roll 1d20" }]);
    expect(tokens('<button label="Roll for initiative">/roll 1d20+3</button>')).toEqual([
      { label: "Roll for initiative", body: "/roll 1d20+3" },
    ]);
  });

  it("takes the curly quotes phone keyboards type", () => {
    expect(tokens("<button label=“Stealth”>/roll d20+5 stealth</button>")[0]?.label).toBe("Stealth");
  });

  it("is case-insensitive and finds several in a row", () => {
    expect(tokens("<BUTTON>/flip</BUTTON><button>/8ball</button>")).toHaveLength(2);
  });

  it("does not span lines or nest markup", () => {
    expect(tokens("<button>/roll\n1d20</button>")).toEqual([]);
    expect(tokens("<button><b>/roll</b></button>")).toEqual([]);
    expect(tokens('<button label="a\nb">/roll</button>')).toEqual([]);
    expect(tokens('<button onclick="x">/roll</button>')).toEqual([]);
  });
});

describe("parseButtonCommand", () => {
  it("accepts the roll family and the small games", () => {
    for (const command of ["/roll 1d20", "/gmroll d20+4 perception", "/v 7 h2", "/rouse", "/flip", "/coinflip", "/8ball will it rain?", "/choose a, b", "/rps rock", "/spell fireball"]) {
      expect(parseButtonCommand(command), command).not.toBeNull();
    }
  });

  it("normalises the name and whitespace", () => {
    expect(parseButtonCommand("  /ROLL   2d6 +3 ")).toEqual({ command: "/ROLL 2d6 +3", name: "roll" });
  });

  it("refuses anything that acts on other people, settings or the room", () => {
    for (const command of [
      "/purge 100",
      "/kick bob",
      "/ban bob",
      "/nick Evil",
      "/leave",
      "/w @bob hi",
      "/whisper @bob hi",
      "/poll a | b | c",
      "/play never gonna give you up",
      "/stop",
      "/disconnect",
      "/volume 200",
      "/remind 1m x",
      "/schedule 20:00 x",
      "/record start",
      "/tts hello",
      "/say hello",
      "/ask anything",
      "/game rps",
      "/watch",
      "/shrug",
      "/markdown",
      "/settings",
      "/ask_gm hi",
      "/help",
    ]) {
      expect(parseButtonCommand(command), command).toBeNull();
    }
  });

  it("needs a real slash command", () => {
    expect(parseButtonCommand("roll 1d20")).toBeNull();
    expect(parseButtonCommand("/")).toBeNull();
    expect(parseButtonCommand("/roll-evil")).toBeNull();
    expect(parseButtonCommand("/rollx 1d20")).toBeNull();
    expect(parseButtonCommand(`/roll ${"1".repeat(200)}`)).toBeNull();
  });
});

describe("readCommandButton", () => {
  it("keeps the label, or none", () => {
    expect(readCommandButton(" Initiative ", "/roll 1d20+3")).toEqual({ command: "/roll 1d20+3", name: "roll", label: "Initiative" });
    expect(readCommandButton(undefined, "/flip")?.label).toBeNull();
    expect(readCommandButton("Free gold", "/purge 50")).toBeNull();
  });
});

describe("BUTTON_COMMANDS", () => {
  it("cannot be redirected by an alias to another command", () => {
    // runCommand resolves aliases first; an allowlisted name must stay itself.
    for (const name of BUTTON_COMMANDS) {
      expect(COMMAND_ALIASES[name] ?? name, name).toBe(name);
    }
  });

  it("covers every roll the roll route does", () => {
    for (const name of ROLL_COMMANDS) expect(BUTTON_COMMANDS.has(name), name).toBe(true);
  });
});
