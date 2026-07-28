export type RoomActivityKind =
  | "watch"
  | "whiteboard"
  | "tierlist"
  | "drawguess"
  | "timer";

export interface ActivityStroke {
  id: string;
  color: string;
  width: number;
  points: number[];
  by?: string;
}

export interface TierRow {
  id: string;
  label: string;
  color: string;
  items: string[];
}

export interface RoomActivity {
  channelId: string;
  kind: RoomActivityKind;
  state: Record<string, unknown>;
  createdBy: string;
  createdByName: string;
  updatedAt: string;
}

export const ACTIVITY_KINDS: RoomActivityKind[] = [
  "watch",
  "whiteboard",
  "tierlist",
  "drawguess",
  "timer",
];

export function isActivityKind(value: unknown): value is RoomActivityKind {
  return ACTIVITY_KINDS.includes(value as RoomActivityKind);
}

export const DEFAULT_TIERS: TierRow[] = [
  { id: "s", label: "S", color: "#ef6b8f", items: [] },
  { id: "a", label: "A", color: "#f49a63", items: [] },
  { id: "b", label: "B", color: "#f1cf65", items: [] },
  { id: "c", label: "C", color: "#65d6a6", items: [] },
  { id: "d", label: "D", color: "#74a7f7", items: [] },
];
