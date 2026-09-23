import { describe, expect, it } from "vitest";
import {
  resolveEmojiShortcode,
  replaceEmojiShortcodes,
  parseQuickReaction,
  findMatchingEmojiShortcodes,
  EMOJI_DATASET,
} from "@/lib/emoji-shortcodes";

describe("Emoji Shortcodes & Quick-Reactions System", () => {
  it("has a comprehensive emoji dataset including all requested emojis", () => {
    expect(EMOJI_DATASET.length).toBeGreaterThan(200);

    // Verify requested test emojis
    expect(resolveEmojiShortcode("tada")).toBe("🎉");
    expect(resolveEmojiShortcode(":tada:")).toBe("🎉");
    expect(resolveEmojiShortcode("smiley")).toBe("😃");
    expect(resolveEmojiShortcode(":smiley:")).toBe("😃");
    expect(resolveEmojiShortcode("thumbsup")).toBe("👍");
    expect(resolveEmojiShortcode(":thumbsup:")).toBe("👍");

    // Aliases
    expect(resolveEmojiShortcode("+1")).toBe("👍");
    expect(resolveEmojiShortcode(":+1:")).toBe("👍");
    expect(resolveEmojiShortcode("-1")).toBe("👎");
    expect(resolveEmojiShortcode("fire")).toBe("🔥");
    expect(resolveEmojiShortcode("heart")).toBe("❤️");
    expect(resolveEmojiShortcode("100")).toBe("💯");
  });

  it("replaces emoji shortcodes in text with unicode emojis while preserving custom server emojis", () => {
    const text = "Great job! :tada: You did it :thumbsup: That was awesome :smiley:";
    const converted = replaceEmojiShortcodes(text);
    expect(converted).toBe("Great job! 🎉 You did it 👍 That was awesome 😃");

    // Preserves server custom emojis
    const customEmojis = {
      partyblob: "/uploads/partyblob.png",
      tada_custom: "/uploads/tada.png",
    };
    const mixed = "Check :tada: and :partyblob:";
    const mixedConverted = replaceEmojiShortcodes(mixed, customEmojis);
    expect(mixedConverted).toBe("Check 🎉 and :partyblob:");
  });

  it("parses quick reaction shortcuts to react to the last message with that emoji", () => {
    // :+tada:
    const tada = parseQuickReaction(":+tada:");
    expect(tada).not.toBeNull();
    expect(tada?.emoji).toBe("🎉");
    expect(tada?.isCustom).toBe(false);

    // :+smiley:
    const smiley = parseQuickReaction(":+smiley:");
    expect(smiley).not.toBeNull();
    expect(smiley?.emoji).toBe("😃");

    // :+thumbsup:
    const thumbsup = parseQuickReaction(":+thumbsup:");
    expect(thumbsup).not.toBeNull();
    expect(thumbsup?.emoji).toBe("👍");

    // :+1:
    const plusOne = parseQuickReaction(":+1:");
    expect(plusOne).not.toBeNull();
    expect(plusOne?.emoji).toBe("👍");

    // Alternative variations: +:tada:, +tada, :+🎉
    const variant1 = parseQuickReaction("+:tada:");
    expect(variant1?.emoji).toBe("🎉");

    const variant2 = parseQuickReaction("+tada");
    expect(variant2?.emoji).toBe("🎉");

    const variant3 = parseQuickReaction(":+🎉:");
    expect(variant3?.emoji).toBe("🎉");

    const variant4 = parseQuickReaction("+🎉");
    expect(variant4?.emoji).toBe("🎉");

    // Custom server emoji reaction
    const customReaction = parseQuickReaction(":+custompepe:", { custompepe: "/uploads/pepe.png" });
    expect(customReaction?.emoji).toBe("custompepe");
    expect(customReaction?.isCustom).toBe(true);

    // Normal messages must NOT trigger quick reaction
    expect(parseQuickReaction("Hello world")).toBeNull();
    expect(parseQuickReaction("Look at this: +10 bonus")).toBeNull();
    expect(parseQuickReaction("Great job! :tada:")).toBeNull();
  });

  it("finds matching emoji shortcodes for autocomplete suggestions", () => {
    const matchesTada = findMatchingEmojiShortcodes("tad");
    expect(matchesTada.some((m) => m.name === "tada" && m.symbol === "🎉")).toBe(true);

    const matchesSmile = findMatchingEmojiShortcodes("smil");
    expect(matchesSmile.some((m) => m.name === "smiley" || m.name === "smile")).toBe(true);

    const matchesThumb = findMatchingEmojiShortcodes("thumb");
    expect(matchesThumb.some((m) => m.name === "thumbsup")).toBe(true);
  });
});
