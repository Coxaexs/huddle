import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, icsDate, icsText } from "@/lib/ics";

describe("iCalendar", () => {
  it("escapes text values", () => {
    expect(icsText("Game night; bring snacks, drinks\nand dice \\o/")).toBe("Game night\\; bring snacks\\, drinks\\nand dice \\\\o/");
  });

  it("formats instants in UTC", () => {
    expect(icsDate("2026-10-27T18:30:00.000Z")).toBe("20261027T183000Z");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const folded = foldLine(`SUMMARY:${"ü".repeat(60)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(lines.slice(1).every((line) => line.startsWith(" "))).toBe(true);
    expect(lines.map((line, i) => (i ? line.slice(1) : line)).join("")).toBe(`SUMMARY:${"ü".repeat(60)}`);
  });

  it("builds a calendar with one VEVENT per event", () => {
    const ics = buildIcs(
      [
        { id: "e1", title: "D&D", description: "", startsAt: "2026-10-30T19:00:00.000Z", endsAt: null, serverName: "Night Owls", url: "https://hoffle.online/hangout/?server=s1" },
      ],
      { name: "Hoffle events", now: Date.parse("2026-10-27T12:00:00Z") },
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:e1@hoffle");
    expect(ics).toContain("DTSTART:20261030T190000Z");
    // No end given: an hour long.
    expect(ics).toContain("DTEND:20261030T200000Z");
    expect(ics).toContain("SUMMARY:D&D");
    expect(ics).toContain("DTSTAMP:20261027T120000Z");
  });
});
