/**
 * Shared helpers for accessibility tests.
 *
 * These run in jsdom, so the checks are limited to what axe can determine from
 * the DOM alone. Rules that need real layout, painting or computed styles are
 * disabled rather than left to produce false failures — a suite that cries wolf
 * gets ignored, which is worse than not having it.
 */
import axe from "axe-core";

/** Rules axe cannot evaluate in jsdom, with the reason each is off. */
const JSDOM_LIMITATIONS = {
  // Needs real rendered colours from a layout engine.
  "color-contrast": { enabled: false },
  // Needs actual scroll/layout boxes to know whether content overflows.
  "scrollable-region-focusable": { enabled: false },
};

export interface ViolationSummary {
  id: string;
  impact: string | null;
  help: string;
  /** The failing elements, so a failure names what to fix. */
  targets: string[];
}

/**
 * Runs axe over `container` and returns a readable list of violations.
 *
 * An empty array means the rendered markup has no accessibility problems axe
 * can see. Callers assert on the length so the message shows which elements
 * failed rather than a bare "expected 1 to be 0".
 */
export async function findA11yViolations(container: HTMLElement): Promise<ViolationSummary[]> {
  const results = await axe.run(container, {
    rules: JSDOM_LIMITATIONS,
  });

  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? null,
    help: violation.help,
    targets: violation.nodes.flatMap((node) => node.target.map(String)),
  }));
}

/**
 * Asserts that the rendered markup is free of axe violations.
 *
 * Kept as a plain function rather than a custom matcher so the failure output
 * can be JSON, which points straight at the offending selector.
 */
export async function expectNoA11yViolations(container: HTMLElement): Promise<void> {
  const violations = await findA11yViolations(container);
  if (violations.length) {
    throw new Error(
      `Found ${violations.length} accessibility violation(s):\n${JSON.stringify(violations, null, 2)}`,
    );
  }
}
