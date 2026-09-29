import { describe, expect, it } from "vitest";
import {
  MAX_GROUPS,
  applyPersonalEmoticons,
  cleanContacts,
  cleanShortcut,
  cleanUploadKey,
} from "./msn-contacts";
import { stripTextStyle } from "./text-style";

describe("cleanContacts", () => {
  it("keeps valid groups, placements into them, and quiet ids", () => {
    const contacts = cleanContacts({
      groups: [
        { id: "friends", name: "  Friends  " },
        { id: "friends", name: "dupe" },
        { id: "bad id!", name: "x" },
        { id: "empty", name: "   " },
      ],
      placement: { u1: "friends", u2: "nowhere", "bad id": "friends" },
      quiet: ["u1", "u1", 42],
    });
    expect(contacts.groups).toEqual([{ id: "friends", name: "Friends" }]);
    expect(contacts.placement).toEqual({ u1: "friends" });
    expect(contacts.quiet).toEqual(["u1"]);
  });

  it("caps the number of groups and survives junk", () => {
    const groups = Array.from({ length: 40 }, (_, i) => ({ id: `g${i}`, name: `G${i}` }));
    expect(cleanContacts({ groups }).groups).toHaveLength(MAX_GROUPS);
    expect(cleanContacts("nope")).toEqual({ groups: [], placement: {}, quiet: [] });
  });
});

describe("personal emoticons", () => {
  it("validates shortcuts and upload keys", () => {
    expect(cleanShortcut("(cat)")).toBe("(cat)");
    expect(cleanShortcut("a")).toBeNull();
    expect(cleanShortcut("has space")).toBeNull();
    expect(cleanShortcut("[x]")).toBeNull();
    expect(cleanUploadKey("abc-123--emoticon.png")).toBe("abc-123--emoticon.png");
    expect(cleanUploadKey("../etc/passwd")).toBeNull();
    expect(cleanUploadKey("a b.png")).toBeNull();
  });

  it("swaps whole-word shortcuts for tokens, and strips back to the shortcut", () => {
    const mine = [{ shortcut: "(cat)", key: "k1--emoticon.png" }];
    const sent = applyPersonalEmoticons("hi (cat) and x(cat)", mine);
    expect(sent).toBe("hi [emo:k1--emoticon.png|(cat)] and x(cat)");
    expect(stripTextStyle(sent)).toBe("hi (cat) and x(cat)");
    expect(applyPersonalEmoticons("`(cat)`", mine)).toBe("`(cat)`");
  });
});
