/**
 * When2Meet-style availability poll grids and heatmap calculations.
 * Cell `(dayIdx, slotIdx)` maps deterministically to `poll_votes.choice` =
 * `dayIdx * grid.slots.length + slotIdx`, reusing the existing votes schema cleanly.
 */

export const MAX_WHEN2MEET_DAYS = 7;
export const MAX_WHEN2MEET_SLOTS = 24;
export const MAX_WHEN2MEET_CELLS = 96;

export interface When2MeetGrid {
  days: string[];
  slots: string[];
  timezone?: string;
}

export interface HeatmapVoter {
  id: string;
  name: string;
}

export interface HeatmapCell {
  index: number;
  day: string;
  slot: string;
  count: number;
  ratio: number;
  voters: HeatmapVoter[];
}

export interface AvailabilityHeatmap {
  totalCells: number;
  maxCount: number;
  cells: HeatmapCell[];
  bestSlots: HeatmapCell[];
}

export function normalizeWhen2MeetGrid(raw: unknown): When2MeetGrid | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.days) || !Array.isArray(obj.slots)) return null;

  const days = obj.days
    .map((d) => String(d).trim().slice(0, 24))
    .filter(Boolean)
    .slice(0, MAX_WHEN2MEET_DAYS);
  const slots = obj.slots
    .map((s) => String(s).trim().slice(0, 16))
    .filter(Boolean)
    .slice(0, MAX_WHEN2MEET_SLOTS);

  if (days.length === 0 || slots.length === 0) return null;
  if (days.length * slots.length > MAX_WHEN2MEET_CELLS) return null;

  const timezone =
    typeof obj.timezone === "string" && obj.timezone.trim()
      ? obj.timezone.trim().slice(0, 64)
      : undefined;

  return { days, slots, ...(timezone ? { timezone } : {}) };
}

export function when2MeetCellIndex(
  dayIdx: number,
  slotIdx: number,
  slotsPerDay: number,
): number {
  return dayIdx * slotsPerDay + slotIdx;
}

export function when2MeetCellCoords(
  index: number,
  slotsPerDay: number,
): { dayIdx: number; slotIdx: number } {
  if (slotsPerDay <= 0) return { dayIdx: 0, slotIdx: 0 };
  return {
    dayIdx: Math.floor(index / slotsPerDay),
    slotIdx: index % slotsPerDay,
  };
}

export function when2MeetCellLabels(grid: When2MeetGrid): string[] {
  const labels: string[] = [];
  for (const day of grid.days) {
    for (const slot of grid.slots) {
      labels.push(`${day} ${slot}`);
    }
  }
  return labels;
}

export function computeAvailabilityHeatmap(
  grid: When2MeetGrid,
  counts: number[],
  voters?: HeatmapVoter[][],
): AvailabilityHeatmap {
  const slotsPerDay = grid.slots.length;
  const totalCells = grid.days.length * slotsPerDay;
  let maxCount = 0;

  for (let i = 0; i < totalCells; i++) {
    const c = Number(counts[i] ?? 0);
    if (c > maxCount) maxCount = c;
  }

  const cells: HeatmapCell[] = [];
  for (let d = 0; d < grid.days.length; d++) {
    for (let s = 0; s < slotsPerDay; s++) {
      const index = when2MeetCellIndex(d, s, slotsPerDay);
      const count = Math.max(0, Number(counts[index] ?? 0));
      cells.push({
        index,
        day: grid.days[d],
        slot: grid.slots[s],
        count,
        ratio: maxCount > 0 ? count / maxCount : 0,
        voters: voters?.[index] ?? [],
      });
    }
  }

  const bestSlots =
    maxCount > 0
      ? [...cells]
          .filter((cell) => cell.count > 0)
          .sort((a, b) => b.count - a.count || a.index - b.index)
          .slice(0, 3)
      : [];

  return { totalCells, maxCount, cells, bestSlots };
}
