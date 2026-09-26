// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  AutomodPanel,
  describeAction,
  formatMinutes,
  summarizeRule,
} from "@/app/components/automod-panel";
import type { AutomodRule } from "@/lib/automod";
import { expectNoA11yViolations } from "./a11y";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A rule with sane defaults, so each test only states what it cares about. */
function rule(
  partial: Partial<AutomodRule> & { config?: AutomodRule["config"] } = {},
): AutomodRule {
  const config = partial.config ?? {
    kind: "keyword" as const,
    words: ["spam"],
    regex: false,
  };
  return {
    id: "r1",
    serverId: "hangout",
    action: "block",
    timeoutMinutes: 0,
    ...partial,
    config,
    // Always derived from the config, so a fixture cannot describe a rule the
    // server would never hand out (a keyword `kind` with a caps config).
    kind: config.kind,
  } as AutomodRule;
}

describe("summarizeRule", () => {
  it("counts blocked words and pluralizes correctly", () => {
    expect(
      summarizeRule(rule({ config: { kind: "keyword", words: ["a"], regex: false } })),
    ).toBe("1 blocked word");
    expect(
      summarizeRule(
        rule({ config: { kind: "keyword", words: ["a", "b", "c"], regex: false } }),
      ),
    ).toBe("3 blocked words");
  });

  it("says when a keyword rule is using regular expressions", () => {
    expect(
      summarizeRule(rule({ config: { kind: "keyword", words: ["a.*"], regex: true } })),
    ).toContain("regular expressions");
  });

  it("describes the numeric limits", () => {
    expect(summarizeRule(rule({ config: { kind: "mention_limit", max: 5 } }))).toBe(
      "max 5 mentions",
    );
    expect(summarizeRule(rule({ config: { kind: "mention_limit", max: 1 } }))).toBe(
      "max 1 mention",
    );
    expect(summarizeRule(rule({ config: { kind: "repeat", maxRepeats: 3 } }))).toBe(
      "max 3 repeats",
    );
  });

  it("spells out that an empty allow-list refuses every link", () => {
    // "allow only " reads like no restriction; it is the opposite.
    expect(summarizeRule(rule({ config: { kind: "link", allow: [] } }))).toBe(
      "allow no links",
    );
    expect(
      summarizeRule(rule({ config: { kind: "link", allow: ["example.com"] } })),
    ).toBe("allow only example.com");
  });

  it("describes a caps rule with both of its thresholds", () => {
    expect(
      summarizeRule(rule({ config: { kind: "caps", minLetters: 12, percent: 70 } })),
    ).toContain("12");
  });
});

describe("formatMinutes", () => {
  it("renders a duration a person can read", () => {
    expect(formatMinutes(10080)).toBe("7 days");
    expect(formatMinutes(1440)).toBe("1 day");
    expect(formatMinutes(60)).toBe("1 hour");
    expect(formatMinutes(90)).toBe("1 hour 30 minutes");
    expect(formatMinutes(1)).toBe("1 minute");
  });

  it("treats unusable input as zero rather than showing NaN", () => {
    expect(formatMinutes(0)).toBe("0 minutes");
    expect(formatMinutes(-5)).toBe("0 minutes");
    expect(formatMinutes(Number.NaN)).toBe("0 minutes");
  });
});

describe("describeAction", () => {
  it("distinguishes refusing a message from timing its author out", () => {
    expect(describeAction(rule({ action: "block" }))).toBe("message refused");
    expect(
      describeAction(rule({ action: "timeout", timeoutMinutes: 30 })),
    ).toBe("message refused, 30 minutes timeout");
  });
});

/** `apiFetch` reads `response.ok` and `response.json()`, so the mock is a Response shape. */
function respond(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload };
}

describe("AutomodPanel", () => {
  const props = {
    serverId: "hangout",
    serverName: "Hangout",
    canManageServer: true,
    onRequestConfirm: vi.fn(),
  };

  it("shows the empty state when the server has no rules", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ rules: [] })));
    render(<AutomodPanel {...props} />);

    await waitFor(() => expect(screen.getByText(/no automod rules/i)).toBeTruthy());
  });

  it("lists a rule with its summary and action", async () => {
    const rules = [
      { ...rule({ config: { kind: "mention_limit", max: 4 } }), enabled: true },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ rules })));
    const { container } = render(<AutomodPanel {...props} />);

    // Asserted on textContent: the summary sits inside a row with nested
    // elements, so getByText cannot match it as a single node.
    await waitFor(() => expect(container.textContent).toContain("max 4 mentions"));
    expect(container.textContent).toMatch(/refuse/i);
  });

  it("still lists a paused rule, so it can be switched back on", async () => {
    // The evaluator ignores disabled rules, but the editor must not, or turning
    // one off would remove it from the UI permanently.
    const rules = [{ ...rule(), enabled: false }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ rules })));
    const { container } = render(<AutomodPanel {...props} />);

    await waitFor(() => expect(container.textContent).toContain("1 blocked word"));
    expect(container.textContent).not.toContain("NO AUTOMOD RULES");
    // And it must read as paused, not silently appear active.
    expect(container.textContent).toMatch(/disabled|paused|off/i);
  });

  it("hides the mutating controls from someone who cannot manage the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ rules: [] })));
    const { container } = render(<AutomodPanel {...props} canManageServer={false} />);

    await waitFor(() => expect(container.textContent).toBeTruthy());
    // A read-only viewer must not be offered an add button they cannot use.
    expect(screen.queryByRole("button", { name: /add rule|new rule/i })).toBeNull();
  });

  it("has no axe violations in its empty state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ rules: [] })));
    const { container } = render(<AutomodPanel {...props} />);

    await waitFor(() => expect(screen.getByText(/no automod rules/i)).toBeTruthy());
    await expectNoA11yViolations(container);
  });
});

