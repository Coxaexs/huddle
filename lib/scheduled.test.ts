import { describe, expect, it } from "vitest";
import { SCHEDULE_TEXT_LIMIT, parseScheduled } from "./scheduled";

const now = Date.UTC(2026, 9, 9, 12, 0, 0); // 12:00 UTC

describe("parseScheduled", () => {
  it("takes the same times as /remind", () => {
    expect(parseScheduled("20:00 Doors are open!", now, -120)).toEqual({
      dueAt: Date.UTC(2026, 9, 9, 18, 0),
      text: "Doors are open!",
    });
    expect(parseScheduled("2h see you soon", now)).toMatchObject({ dueAt: now + 2 * 3_600_000 });
  });

  it("keeps line breaks and allows long messages", () => {
    const parsed = parseScheduled("1h Line one\nLine two", now);
    expect(parsed).toMatchObject({ text: "Line one\nLine two" });
    const long = parseScheduled(`1h ${"x".repeat(SCHEDULE_TEXT_LIMIT + 50)}`, now);
    expect("text" in long && long.text.length).toBe(SCHEDULE_TEXT_LIMIT);
  });

  it("explains what it needs", () => {
    expect(parseScheduled("20:00", now)).toMatchObject({ error: expect.stringContaining("/schedule") });
    expect(parseScheduled("soon hello", now)).toMatchObject({ error: expect.stringContaining("/schedule") });
  });
});
