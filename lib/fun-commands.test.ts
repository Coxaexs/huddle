import { describe, expect, it } from "vitest";
import { chooseOptions, funCommandReply } from "./fun-commands";

const fixed = (value: number) => () => value;

describe("chooseOptions", () => {
  it("splits on pipes, then commas, then 'or'", () => {
    expect(chooseOptions("a | b, c | d")).toEqual(["a", "b, c", "d"]);
    expect(chooseOptions("pizza, tacos,  sushi")).toEqual(["pizza", "tacos", "sushi"]);
    expect(chooseOptions("tea or coffee")).toEqual(["tea", "coffee"]);
  });
});

describe("funCommandReply", () => {
  it("answers the 8-ball and repeats the question", () => {
    expect(funCommandReply("8ball", "", fixed(0))).toBe("🎱 It is certain.");
    expect(funCommandReply("8ball", "Will it rain?", fixed(0.999))).toBe("🎱 “Will it rain?” — Very doubtful.");
  });

  it("chooses one option, or asks for two", () => {
    expect(funCommandReply("choose", "tea or coffee", fixed(0.9))).toBe("🤔 I choose **coffee**.");
    expect(funCommandReply("choose", "tea", fixed(0))).toMatch(/at least two/);
  });

  it("plays rock, paper, scissors", () => {
    // 0 → rock, 0.5 → paper, 0.9 → scissors for the bot.
    expect(funCommandReply("rps", "paper", fixed(0))).toMatch(/You win!$/);
    expect(funCommandReply("rps", "s", fixed(0))).toMatch(/I win!$/);
    expect(funCommandReply("rps", "rock", fixed(0))).toMatch(/tie/);
    expect(funCommandReply("rps", "", fixed(0.9))).toMatch(/I throw scissors/);
  });
});
