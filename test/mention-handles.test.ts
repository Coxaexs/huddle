import { describe, expect, it } from "vitest";
import {
  findTagQuery,
  handleMatchesName,
  mentionMatchScore,
  nameToHandle,
} from "@/lib/mention-handles";
import { parseMentionHandles } from "@/app/api/messages/route";

describe("mention handles", () => {
  it("turns names with spaces and emoji into typeable handles", () => {
    expect(nameToHandle("Game Master")).toBe("Game-Master");
    expect(nameToHandle("Chill Lounge 🎧")).toBe("Chill-Lounge");
    expect(nameToHandle("general")).toBe("general");
    expect(nameToHandle("🎮")).toBe("");
  });

  it("matches a typed handle back to its name, ignoring case", () => {
    expect(handleMatchesName("game-master", "Game Master")).toBe(true);
    expect(handleMatchesName("Game", "Game Master")).toBe(false);
    expect(handleMatchesName("", "🎮")).toBe(false);
  });

  it("ranks prefixes above word starts above substrings", () => {
    expect(mentionMatchScore("es", ["Escanor"])).toBe(0);
    expect(mentionMatchScore("es", ["Sir Escanor"])).toBe(1);
    expect(mentionMatchScore("es", ["Lester"])).toBe(2);
    expect(mentionMatchScore("es", ["Bob"])).toBeNull();
    // Any of the names counts: nickname, display name or username.
    expect(mentionMatchScore("esc", ["Sunny", null, "escanor_99"])).toBe(0);
    expect(mentionMatchScore("", ["anyone"])).toBe(0);
  });

  it("finds the @ or # token right before the caret", () => {
    expect(findTagQuery("hey @es")).toEqual({ trigger: "@", query: "es", start: 4 });
    expect(findTagQuery("#gen")).toEqual({ trigger: "#", query: "gen", start: 0 });
    expect(findTagQuery("see @")).toEqual({ trigger: "@", query: "", start: 4 });
    expect(findTagQuery("mail me@home")).toBeNull();
    expect(findTagQuery("@escanor done")).toBeNull();
  });

  it("the server parses role handles long enough to hold spaced names", () => {
    expect(parseMentionHandles("ping @Game-Master and @escanor")).toEqual([
      "game-master",
      "escanor",
    ]);
  });
});
