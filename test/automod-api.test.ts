import { describe, expect, it, vi } from "vitest";
import { validateRuleInput } from "@/app/api/automod/route";

// The route reaches Cloudflare bindings through its imports; none of the
// validation paths under test touch them.
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/hub-client", () => ({ publishStructureChange: vi.fn() }));

describe("validateRuleInput", () => {
  it("accepts a keyword rule with words", () => {
    const result = validateRuleInput({
      kind: "keyword",
      config: { words: ["spam", "scam"] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("keyword");
      expect(JSON.parse(result.configJson)).toEqual({ words: ["spam", "scam"] });
    }
  });

  it("rejects a keyword rule with no words, which could never match", () => {
    // Saving this would look like protection while doing nothing.
    const result = validateRuleInput({ kind: "keyword", config: { words: [] } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("at least one word");
  });

  it("rejects a keyword rule with no config at all", () => {
    expect(validateRuleInput({ kind: "keyword" }).ok).toBe(false);
  });

  it("accepts the numeric kinds with no config, because they have defaults", () => {
    for (const kind of ["mention_limit", "caps", "repeat", "link"]) {
      expect(validateRuleInput({ kind }).ok).toBe(true);
    }
  });

  it("normalizes the kind's case", () => {
    const result = validateRuleInput({ kind: "  KEYWORD  ", config: { words: ["x"] } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("keyword");
  });

  it("rejects an unknown kind", () => {
    const result = validateRuleInput({ kind: "teleport" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Unknown rule kind");
  });

  it("rejects an unknown action", () => {
    const result = validateRuleInput({
      kind: "keyword",
      action: "explode",
      config: { words: ["x"] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("block or timeout");
  });

  it("defaults to blocking when no action is given", () => {
    expect(validateRuleInput({ kind: "keyword", config: { words: ["x"] } }).ok).toBe(true);
  });

  it("survives a config that is not an object", () => {
    // A client sending a string or null must be rejected, not crash the route.
    expect(validateRuleInput({ kind: "keyword", config: "nope" }).ok).toBe(false);
    expect(validateRuleInput({ kind: "mention_limit", config: null }).ok).toBe(true);
  });
});
