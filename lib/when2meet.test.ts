import { describe, expect, it } from "vitest";
import {
  computeAvailabilityHeatmap,
  MAX_WHEN2MEET_CELLS,
  normalizeWhen2MeetGrid,
  when2MeetCellCoords,
  when2MeetCellIndex,
  when2MeetCellLabels,
} from "./when2meet";

describe("When2Meet availability grid helpers", () => {
  it("normalizes valid grids and enforces cell and bound limits", () => {
    const valid = normalizeWhen2MeetGrid({
      days: [" Fri ", "Sat"],
      slots: ["18:00", "19:00", "20:00"],
      timezone: "Europe/Istanbul",
    });
    expect(valid).toEqual({
      days: ["Fri", "Sat"],
      slots: ["18:00", "19:00", "20:00"],
      timezone: "Europe/Istanbul",
    });

    // Empty / invalid shapes return null
    expect(normalizeWhen2MeetGrid(null)).toBeNull();
    expect(normalizeWhen2MeetGrid({ days: [], slots: ["18:00"] })).toBeNull();
    expect(normalizeWhen2MeetGrid({ days: ["Mon"], slots: [] })).toBeNull();

    // Exceeding MAX_WHEN2MEET_CELLS (7 * 15 = 105 > 96) returns null
    const tooMany = normalizeWhen2MeetGrid({
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      slots: Array.from({ length: 15 }, (_, i) => `${i}:00`),
    });
    expect(tooMany).toBeNull();

    // Boundary 6 * 16 = 96 succeeds
    const exactMax = normalizeWhen2MeetGrid({
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      slots: Array.from({ length: 16 }, (_, i) => `${i}:00`),
    });
    expect(exactMax).not.toBeNull();
    expect(exactMax!.days.length * exactMax!.slots.length).toBe(MAX_WHEN2MEET_CELLS);
  });

  it("maps grid cell coordinates and computes ranked availability heatmap", () => {
    const grid = { days: ["Fri", "Sat"], slots: ["19:00", "20:00", "21:00"] };
    expect(when2MeetCellLabels(grid)).toEqual([
      "Fri 19:00",
      "Fri 20:00",
      "Fri 21:00",
      "Sat 19:00",
      "Sat 20:00",
      "Sat 21:00",
    ]);

    const idx = when2MeetCellIndex(1, 2, grid.slots.length);
    expect(idx).toBe(5);
    expect(when2MeetCellCoords(idx, grid.slots.length)).toEqual({ dayIdx: 1, slotIdx: 2 });

    const counts = [1, 3, 2, 0, 4, 3];
    const voters = [
      [{ id: "u1", name: "Alice" }],
      [
        { id: "u1", name: "Alice" },
        { id: "u2", name: "Bob" },
        { id: "u3", name: "Cara" },
      ],
      [],
      [],
      [
        { id: "u1", name: "Alice" },
        { id: "u2", name: "Bob" },
        { id: "u3", name: "Cara" },
        { id: "u4", name: "Dan" },
      ],
      [],
    ];

    const heatmap = computeAvailabilityHeatmap(grid, counts, voters);
    expect(heatmap.totalCells).toBe(6);
    expect(heatmap.maxCount).toBe(4);
    expect(heatmap.cells[4].ratio).toBe(1);
    expect(heatmap.cells[3].ratio).toBe(0);
    expect(heatmap.bestSlots.map((s) => `${s.day} ${s.slot}`)).toEqual([
      "Sat 20:00",
      "Fri 20:00",
      "Sat 21:00",
    ]);
  });
});
