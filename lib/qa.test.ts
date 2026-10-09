import { describe, expect, it } from "vitest";
import { sortQuestions, type QaQuestion } from "./qa";

function question(id: string, extra: Partial<QaQuestion> = {}): QaQuestion {
  return {
    id,
    channelId: "stage",
    userId: "u",
    author: "A",
    text: id,
    votes: 0,
    createdAt: `2026-10-09T18:00:0${id.length}Z`,
    answered: false,
    pinned: false,
    ...extra,
  };
}

describe("sortQuestions", () => {
  it("puts the pinned one first, answered ones last, then most votes, then oldest", () => {
    const sorted = sortQuestions([
      question("a", { votes: 1 }),
      question("bb", { votes: 5, answered: true }),
      question("ccc", { votes: 3 }),
      question("dddd", { votes: 0, pinned: true }),
      question("e", { votes: 3, createdAt: "2026-10-09T17:00:00Z" }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["dddd", "e", "ccc", "a", "bb"]);
  });
});
