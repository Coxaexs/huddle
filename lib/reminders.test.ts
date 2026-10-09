import { describe, expect, it } from "vitest";
import { parseReminder } from "./reminders";

const now = Date.UTC(2026, 9, 9, 12, 0, 0); // 12:00 UTC

describe("parseReminder", () => {
  it("reads durations", () => {
    expect(parseReminder("20m take the pizza out", now)).toEqual({
      dueAt: now + 20 * 60_000,
      text: "take the pizza out",
    });
    expect(parseReminder("1h30m stretch", now)).toMatchObject({ dueAt: now + 90 * 60_000 });
  });

  it("reads clock times in the writer's time zone, rolling to tomorrow when past", () => {
    // UTC+2 writes -120 as the offset; 18:30 local is 16:30 UTC.
    expect(parseReminder("18:30 call mum", now, -120)).toMatchObject({
      dueAt: Date.UTC(2026, 9, 9, 16, 30),
    });
    // 9:00 local already passed today: tomorrow.
    expect(parseReminder("9:00 standup", now, -120)).toMatchObject({
      dueAt: Date.UTC(2026, 9, 10, 7, 0),
    });
    expect(parseReminder("tomorrow 7pm game night", now, 0)).toMatchObject({
      dueAt: Date.UTC(2026, 9, 10, 19, 0),
    });
  });

  it("refuses nonsense", () => {
    expect(parseReminder("soon do things", now)).toHaveProperty("error");
    expect(parseReminder("10m", now)).toHaveProperty("error");
    expect(parseReminder("400d far away", now)).toHaveProperty("error");
  });
});
