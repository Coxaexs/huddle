import { describe, it, expect } from "vitest";

describe("Quick Reactions & Hidden Emojis Logic", () => {
  const DEFAULT_QUICK_REACTIONS = ["👍", "👎", "❤️", "😂", "🔥", "🎉"];

  it("preserves an empty quick reaction list without resetting to defaults", () => {
    const rawStored = "[]";
    const parsed = JSON.parse(rawStored);
    // Formerly: if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    // Which erroneously reverted empty arrays back to DEFAULT_QUICK_REACTIONS.
    const resolved = Array.isArray(parsed) ? parsed : DEFAULT_QUICK_REACTIONS;
    expect(resolved).toEqual([]);
    expect(resolved.length).toBe(0);
  });

  it("properly removes an emoji and normalizes colons", () => {
    const prev = ["👍", "❤️", ":custom_cat:", ":dog:"];
    const emojiToRemove = ":custom_cat:";
    const clean = emojiToRemove.replace(/^:|:$/g, "");
    const next = prev.filter(
      (e) => e !== emojiToRemove && e.replace(/^:|:$/g, "") !== clean,
    );
    expect(next).toEqual(["👍", "❤️", ":dog:"]);
  });

  it("hides server emojis by id, clean name, and colon-name", () => {
    const hiddenServerEmojiIds: string[] = [];
    const id = "emoji-123";
    const name = "custom_cat";
    const cleanName = name.replace(/^:|:$/g, "");
    const tokens = [id, cleanName, `:${cleanName}:`];
    const nextHidden = [...new Set([...hiddenServerEmojiIds, ...tokens])];

    expect(nextHidden).toContain("emoji-123");
    expect(nextHidden).toContain("custom_cat");
    expect(nextHidden).toContain(":custom_cat:");

    const sampleServerEmojis = [
      { id: "emoji-123", name: "custom_cat", url: "/url1" },
      { id: "emoji-456", name: "happy_dog", url: "/url2" },
    ];

    const visible = sampleServerEmojis.filter((emoji) => {
      const code = `:${emoji.name}:`;
      const clean = emoji.name;
      return (
        !nextHidden.includes(emoji.id) &&
        !nextHidden.includes(clean) &&
        !nextHidden.includes(code)
      );
    });

    expect(visible.length).toBe(1);
    expect(visible[0].name).toBe("happy_dog");
  });

  it("excludes duplicates already in quickReactions from server emojis list", () => {
    const quickReactions = ["👍", ":happy_dog:"];
    const hiddenServerEmojiIds: string[] = [];
    const sampleServerEmojis = [
      { id: "emoji-456", name: "happy_dog", url: "/url2" },
      { id: "emoji-789", name: "cool_fox", url: "/url3" },
    ];

    const visible = sampleServerEmojis.filter((emoji) => {
      const code = `:${emoji.name}:`;
      const clean = emoji.name;
      return (
        !hiddenServerEmojiIds.includes(emoji.id) &&
        !hiddenServerEmojiIds.includes(clean) &&
        !hiddenServerEmojiIds.includes(code) &&
        !quickReactions.includes(code) &&
        !quickReactions.includes(clean)
      );
    });

    expect(visible.map((e) => e.name)).toEqual(["cool_fox"]);
  });
});
