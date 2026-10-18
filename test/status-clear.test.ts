import { describe, expect, it } from "vitest";
import { statusClearAfterMs } from "../app/lib/status-clear";

describe("statusClearAfterMs", () => {
  it("gives fixed spans for the timed choices", () => {
    expect(statusClearAfterMs("30m")).toBe(30 * 60_000);
    expect(statusClearAfterMs("1h")).toBe(60 * 60_000);
    expect(statusClearAfterMs("4h")).toBe(4 * 60 * 60_000);
  });

  it("runs \"today\" to local midnight", () => {
    const evening = new Date(2026, 9, 18, 22, 30, 0);
    expect(statusClearAfterMs("today", evening)).toBe(90 * 60_000);
  });

  it("keeps the status for \"never\"", () => {
    expect(statusClearAfterMs("never")).toBeNull();
  });
});
