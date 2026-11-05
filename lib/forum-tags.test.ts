import { describe, expect, it } from "vitest";
import { MAX_FORUM_TAGS, normalizeForumTags, parseForumTags, pickPostTags, requestedTags, withPostTags } from "./forum-tags";

let counter = 0;
const makeId = () => `new${++counter}`;

describe("forum tags", () => {
  it("cleans a tag list: trims, drops blanks and repeats, keeps valid ids", () => {
    const tags = normalizeForumTags(
      [
        { id: "help1", name: "  Help  ", emoji: "🆘" },
        { name: "help" },
        { name: "" },
        { id: "BAD ID", name: "Solved", moderated: true },
        "nonsense",
      ],
      makeId,
    );
    expect(tags).toEqual([
      { id: "help1", name: "Help", emoji: "🆘" },
      { id: "new1", name: "Solved", moderated: true },
    ]);
  });

  it("caps the list and never cuts an emoji in half", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `tag ${i}` }));
    expect(normalizeForumTags(many, makeId)).toHaveLength(MAX_FORUM_TAGS);
    const [tag] = normalizeForumTags([{ name: "Party", emoji: "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉" }], makeId);
    expect(Array.from(tag.emoji!)).toHaveLength(8);
  });

  it("reads the stored column, and nothing from a broken one", () => {
    expect(parseForumTags('[{"id":"a1","name":"Bug"}]')).toEqual([{ id: "a1", name: "Bug" }]);
    expect(parseForumTags("{oops")).toEqual([]);
    expect(parseForumTags(null)).toEqual([]);
  });

  const available = [
    { id: "bug", name: "Bug" },
    { id: "idea", name: "Idea" },
    { id: "solved", name: "Solved", moderated: true },
  ];

  it("lets a post pick from the forum's tags, at most five", () => {
    expect(pickPostTags(["idea", "nope", "bug", "idea"], available, false)).toEqual(["idea", "bug"]);
    const lots = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, name: `T${i}` }));
    expect(pickPostTags(lots.map((tag) => tag.id), lots, false)).toHaveLength(5);
  });

  it("keeps moderated tags in moderators' hands", () => {
    expect(pickPostTags(["solved", "bug"], available, false)).toEqual(["bug"]);
    expect(pickPostTags(["solved", "bug"], available, true)).toEqual(["solved", "bug"]);
    // The author edits their tags: the moderator's "Solved" stays on.
    expect(pickPostTags(["idea"], available, false, ["solved", "bug"])).toEqual(["solved", "idea"]);
  });

  it("reads and writes a payload's tags", () => {
    expect(requestedTags({ forumTags: ["a", 3, "b"] })).toEqual(["a", "b"]);
    expect(requestedTags({ other: 1 })).toBeNull();
    expect(withPostTags({ silent: true }, ["a"])).toEqual({ silent: true, forumTags: ["a"] });
    expect(withPostTags({ forumTags: ["a"] }, [])).toBeUndefined();
    // A D&D card's own `tags` are left alone.
    expect(withPostTags({ tags: ["Homebrew"] }, [])).toEqual({ tags: ["Homebrew"] });
    expect(withPostTags({ silent: true, forumTags: ["a"] }, [])).toEqual({ silent: true });
  });
});
