import { describe, expect, it } from "vitest";
import {
  capsRatio,
  containsKeyword,
  escapeRegExp,
  evaluateMessage,
  extractUrls,
  toAutomodRule,
  type AutomodRule,
  type StoredAutomodRule,
} from "@/lib/automod";

/** Builds a rule directly, bypassing the row parser. */
function rule(config: AutomodRule["config"], overrides: Partial<AutomodRule> = {}): AutomodRule {
  return {
    id: "r1",
    serverId: "hangout",
    kind: config.kind,
    action: "block",
    timeoutMinutes: 0,
    config,
    ...overrides,
  };
}

/** Builds a stored row for the parser tests. */
function row(overrides: Partial<StoredAutomodRule> = {}): StoredAutomodRule {
  return {
    id: "r1",
    server_id: "hangout",
    kind: "keyword",
    enabled: 1,
    action: "block",
    timeout_minutes: 0,
    config: JSON.stringify({ words: ["badword"] }),
    ...overrides,
  };
}

describe("toAutomodRule", () => {
  it("drops disabled rules", () => {
    expect(toAutomodRule(row({ enabled: 0 }))).toBeNull();
  });

  it("drops a rule kind it does not understand", () => {
    expect(toAutomodRule(row({ kind: "time_travel" }))).toBeNull();
  });

  it("drops a keyword rule with no words, which could never match", () => {
    expect(toAutomodRule(row({ config: "{}" }))).toBeNull();
    expect(toAutomodRule(row({ config: JSON.stringify({ words: [] }) }))).toBeNull();
  });

  it("survives a config blob that is not valid JSON", () => {
    // A hand-edited or corrupted row must degrade, not throw on every message.
    const parsed = toAutomodRule(row({ kind: "mention_limit", config: "{not json" }));
    expect(parsed?.config).toEqual({ kind: "mention_limit", max: 5 });
  });

  it("applies working defaults for the numeric rule kinds", () => {
    expect(toAutomodRule(row({ kind: "mention_limit", config: "{}" }))?.config).toEqual({
      kind: "mention_limit",
      max: 5,
    });
    expect(toAutomodRule(row({ kind: "caps", config: "{}" }))?.config).toEqual({
      kind: "caps",
      minLetters: 12,
      percent: 70,
    });
    expect(toAutomodRule(row({ kind: "repeat", config: "{}" }))?.config).toEqual({
      kind: "repeat",
      maxRepeats: 3,
    });
  });

  it("treats a timeout action without a duration as the default, not as never", () => {
    const parsed = toAutomodRule(row({ action: "timeout", timeout_minutes: 0 }));
    expect(parsed?.action).toBe("timeout");
    expect(parsed?.timeoutMinutes).toBe(10);
  });

  it("ignores a timeout duration when the action only blocks", () => {
    const parsed = toAutomodRule(row({ action: "block", timeout_minutes: 999 }));
    expect(parsed?.timeoutMinutes).toBe(0);
  });

  it("falls back to block for an unknown action", () => {
    expect(toAutomodRule(row({ action: "launch_missiles" }))?.action).toBe("block");
  });

  it("clamps a percentage above 100, which could never fire", () => {
    const parsed = toAutomodRule(row({ kind: "caps", config: '{"percent":500}' }));
    expect(parsed?.config).toEqual({ kind: "caps", minLetters: 12, percent: 100 });
  });

  it("keeps regex mode only when it was explicitly asked for", () => {
    expect(toAutomodRule(row({ config: '{"words":["a"]}' }))?.config).toMatchObject({
      regex: false,
    });
    expect(
      toAutomodRule(row({ config: '{"words":["a"],"regex":true}' }))?.config,
    ).toMatchObject({ regex: true });
  });
});

describe("capsRatio", () => {
  it("counts only cased letters", () => {
    expect(capsRatio("HELLO")).toBe(1);
    expect(capsRatio("hello")).toBe(0);
    // Digits and punctuation are not evidence of shouting.
    expect(capsRatio("123 !!! ???")).toBe(0);
  });

  it("computes the fraction of uppercase letters", () => {
    expect(capsRatio("HELLo")).toBeCloseTo(0.8, 5);
    expect(capsRatio("Happy BIRTHDAY")).toBeCloseTo(9 / 13, 5);
  });

  it("returns 0 for text with no letters at all", () => {
    expect(capsRatio("")).toBe(0);
    expect(capsRatio("🙂")).toBe(0);
  });
});

describe("extractUrls", () => {
  it("finds http, https and bare www hosts", () => {
    expect(extractUrls("see https://example.com/a and www.test.org")).toEqual([
      "https://example.com/a",
      "www.test.org",
    ]);
  });

  it("finds nothing in plain text", () => {
    expect(extractUrls("no links here")).toEqual([]);
  });
});

describe("containsKeyword", () => {
  it("treats non-ASCII letters as part of a word", () => {
    // `\b` is ASCII-only: "şaka" used to count as a boundary before "aka".
    expect(containsKeyword("şaka yaptım", "aka")).toBe(false);
    expect(containsKeyword("sen bir şerefsizsin", "şerefsiz")).toBe(false);
    expect(containsKeyword("tam bir şerefsiz!", "şerefsiz")).toBe(true);
  });

  it("matches whole words only", () => {
    expect(containsKeyword("that is classy", "ass")).toBe(false);
    expect(containsKeyword("what an ass", "ass")).toBe(true);
  });

  it("ignores case", () => {
    expect(containsKeyword("BADWORD here", "badword")).toBe(true);
  });

  it("treats plain keywords literally, not as patterns", () => {
    // An operator who types `c++` means the characters, not a quantifier.
    expect(containsKeyword("i write c++ daily", "c++")).toBe(true);
    expect(containsKeyword("i write c daily", "c++")).toBe(false);
  });

  it("honours regex mode when asked", () => {
    expect(containsKeyword("buy now!!!", "now!+", true)).toBe(true);
    expect(containsKeyword("buy now", "now!+", true)).toBe(false);
  });

  it("returns false for a regex the operator got wrong", () => {
    // A broken pattern must not break message posting.
    expect(containsKeyword("anything", "([unclosed", true)).toBe(false);
  });
});

describe("escapeRegExp", () => {
  it("escapes every regex metacharacter", () => {
    expect(escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
  });
});

describe("evaluateMessage", () => {
  it("allows everything when there are no rules", () => {
    expect(evaluateMessage([], { text: "anything", mentionCount: 99 })).toBeNull();
  });

  it("blocks on a keyword hit and explains itself without quoting the word", () => {
    const rules = [rule({ kind: "keyword", words: ["badword"], regex: false })];
    const violation = evaluateMessage(rules, { text: "a BADWORD here", mentionCount: 0 });
    expect(violation).toMatchObject({ ruleId: "r1", kind: "keyword", action: "block" });
    expect(violation?.reason).not.toContain("badword");
  });

  it("lets a clean message through", () => {
    const rules = [rule({ kind: "keyword", words: ["badword"], regex: false })];
    expect(evaluateMessage(rules, { text: "all good", mentionCount: 0 })).toBeNull();
  });

  it("allows a mention count at the limit and blocks one over it", () => {
    const rules = [rule({ kind: "mention_limit", max: 3 })];
    expect(evaluateMessage(rules, { text: "hi", mentionCount: 3 })).toBeNull();
    expect(evaluateMessage(rules, { text: "hi", mentionCount: 4 })).toMatchObject({
      kind: "mention_limit",
    });
  });

  it("writes a singular reason for a limit of one", () => {
    const rules = [rule({ kind: "mention_limit", max: 1 })];
    expect(evaluateMessage(rules, { text: "hi", mentionCount: 2 })?.reason).toContain("1 person");
  });

  it("blocks a link that is not on the allow-list", () => {
    const rules = [rule({ kind: "link", allow: ["example.com"] })];
    expect(evaluateMessage(rules, { text: "see https://elsewhere.net", mentionCount: 0 })).toMatchObject(
      { kind: "link" },
    );
  });

  it("allows an allow-listed host and its subdomains", () => {
    const rules = [rule({ kind: "link", allow: ["example.com"] })];
    expect(evaluateMessage(rules, { text: "see https://example.com", mentionCount: 0 })).toBeNull();
    expect(
      evaluateMessage(rules, { text: "see https://cdn.example.com/x", mentionCount: 0 }),
    ).toBeNull();
  });

  it("is not fooled by a host that merely ends with the allowed name", () => {
    // `notexample.com` must not pass because it ends with `example.com`.
    const rules = [rule({ kind: "link", allow: ["example.com"] })];
    expect(
      evaluateMessage(rules, { text: "see https://notexample.com", mentionCount: 0 }),
    ).toMatchObject({ kind: "link" });
  });

  it("leaves text without links alone when a link rule is on", () => {
    const rules = [rule({ kind: "link", allow: [] })];
    expect(evaluateMessage(rules, { text: "no links", mentionCount: 0 })).toBeNull();
  });

  it("exempts short messages from the caps rule", () => {
    const rules = [rule({ kind: "caps", minLetters: 12, percent: 70 })];
    // "LOL" is shouting but not a wall of it.
    expect(evaluateMessage(rules, { text: "LOL", mentionCount: 0 })).toBeNull();
    expect(
      evaluateMessage(rules, { text: "WHY IS EVERYONE SHOUTING", mentionCount: 0 }),
    ).toMatchObject({ kind: "caps" });
  });

  it("exempts normal prose from the caps rule", () => {
    const rules = [rule({ kind: "caps", minLetters: 12, percent: 70 })];
    expect(
      evaluateMessage(rules, { text: "Hello everyone, how are you doing?", mentionCount: 0 }),
    ).toBeNull();
  });

  it("counts the message being posted toward the repeat limit", () => {
    const rules = [rule({ kind: "repeat", maxRepeats: 3 })];
    const context = { mentionCount: 0 };

    expect(
      evaluateMessage(rules, { ...context, text: "hi", recentMessages: ["hi", "hi"] }),
    ).toBeNull();
    expect(
      evaluateMessage(rules, { ...context, text: "hi", recentMessages: ["hi", "hi", "hi"] }),
    ).toMatchObject({ kind: "repeat" });
  });

  it("ignores case and surrounding whitespace when spotting repeats", () => {
    const rules = [rule({ kind: "repeat", maxRepeats: 2 })];
    expect(
      evaluateMessage(rules, { text: "  SPAM ", mentionCount: 0, recentMessages: ["spam", "Spam"] }),
    ).toMatchObject({ kind: "repeat" });
  });

  it("reports the timeout the action will apply", () => {
    const rules = [
      rule({ kind: "keyword", words: ["spam"], regex: false }, {
        action: "timeout",
        timeoutMinutes: 30,
      }),
    ];
    const violation = evaluateMessage(rules, { text: "spam", mentionCount: 0 });
    expect(violation).toMatchObject({ action: "timeout", timeoutMinutes: 30 });
  });

  it("returns the first matching rule, so rule order decides the reason", () => {
    const rules = [
      rule({ kind: "mention_limit", max: 1 }, { id: "first" }),
      rule({ kind: "keyword", words: ["spam"], regex: false }, { id: "second" }),
    ];
    const violation = evaluateMessage(rules, { text: "spam spam", mentionCount: 5 });
    expect(violation?.ruleId).toBe("first");
  });
});

