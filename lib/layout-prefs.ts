/**
 * Where the panels sit and which widgets someone has placed, as one small
 * JSON value on the account (users.layout_prefs). The default is the layout
 * everyone already has: channels on the left, members on the right, no
 * widgets. Anything unknown in a stored value falls back to that default, so
 * an old client or a hand-edited value can never break the app.
 */

export type ChannelsSide = "left" | "right" | "top" | "bottom";
export type MembersSide = "right" | "left";

/** The places a widget can go. */
export type WidgetArea = "sidebar-top" | "sidebar-bottom" | "members-top" | "header";
export type WidgetSize = "small" | "medium" | "large";

export interface WidgetPlacement {
  /** "music" for the built-in one, `bot:<botId>:<name>` for a bot's. */
  id: string;
  area: WidgetArea;
  size: WidgetSize;
}

export interface LayoutPrefs {
  channels: ChannelsSide;
  members: MembersSide;
  widgets: WidgetPlacement[];
}

export const DEFAULT_LAYOUT: LayoutPrefs = { channels: "left", members: "right", widgets: [] };

export const CHANNEL_SIDES: ChannelsSide[] = ["left", "right", "top", "bottom"];
export const MEMBER_SIDES: MembersSide[] = ["right", "left"];
export const WIDGET_AREAS: WidgetArea[] = ["header", "sidebar-top", "sidebar-bottom", "members-top"];
export const WIDGET_SIZES: WidgetSize[] = ["small", "medium", "large"];

/**
 * Which sizes fit where. The header is one line high; the channel list is
 * narrow at the top (it pushes the channels down) and roomier at the bottom.
 */
export const AREA_SIZES: Record<WidgetArea, WidgetSize[]> = {
  header: ["small"],
  "sidebar-top": ["small", "medium"],
  "sidebar-bottom": ["small", "medium", "large"],
  "members-top": ["small", "medium", "large"],
};

export const MAX_WIDGETS = 12;
export const MAX_PER_AREA = 4;

const WIDGET_ID = /^(music|bot:[A-Za-z0-9_-]{1,64}:[a-z0-9_-]{1,32})$/;

/**
 * The size to use for a widget in an area: the wanted one when both allow it,
 * otherwise the nearest size both allow, or null when they share none.
 */
export function fitSize(
  area: WidgetArea,
  wanted: WidgetSize,
  offered: readonly WidgetSize[] = WIDGET_SIZES,
): WidgetSize | null {
  const allowed = AREA_SIZES[area].filter((size) => offered.includes(size));
  if (!allowed.length) return null;
  if (allowed.includes(wanted)) return wanted;
  const rank = WIDGET_SIZES.indexOf(wanted);
  return [...allowed].sort(
    (a, b) => Math.abs(WIDGET_SIZES.indexOf(a) - rank) - Math.abs(WIDGET_SIZES.indexOf(b) - rank),
  )[0];
}

export function normalizeLayout(raw: unknown): LayoutPrefs {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  if (!value || typeof value !== "object") return { ...DEFAULT_LAYOUT, widgets: [] };
  const input = value as Partial<Record<keyof LayoutPrefs, unknown>>;
  const channels = CHANNEL_SIDES.includes(input.channels as ChannelsSide)
    ? (input.channels as ChannelsSide)
    : DEFAULT_LAYOUT.channels;
  const members = MEMBER_SIDES.includes(input.members as MembersSide)
    ? (input.members as MembersSide)
    : DEFAULT_LAYOUT.members;

  const widgets: WidgetPlacement[] = [];
  const seen = new Set<string>();
  const perArea = new Map<WidgetArea, number>();
  for (const item of Array.isArray(input.widgets) ? input.widgets : []) {
    if (widgets.length >= MAX_WIDGETS) break;
    if (!item || typeof item !== "object") continue;
    const { id, area, size } = item as Record<string, unknown>;
    if (typeof id !== "string" || !WIDGET_ID.test(id) || seen.has(id)) continue;
    if (!WIDGET_AREAS.includes(area as WidgetArea)) continue;
    const where = area as WidgetArea;
    if ((perArea.get(where) ?? 0) >= MAX_PER_AREA) continue;
    const fitted = fitSize(where, WIDGET_SIZES.includes(size as WidgetSize) ? (size as WidgetSize) : "medium");
    if (!fitted) continue;
    seen.add(id);
    perArea.set(where, (perArea.get(where) ?? 0) + 1);
    widgets.push({ id, area: where, size: fitted });
  }
  return { channels, members, widgets };
}

export function isDefaultLayout(layout: LayoutPrefs): boolean {
  return (
    layout.channels === DEFAULT_LAYOUT.channels &&
    layout.members === DEFAULT_LAYOUT.members &&
    layout.widgets.length === 0
  );
}

/**
 * Puts a widget into an area (moving it if it was elsewhere), before the
 * widget `before` when given, else at the end. A full area refuses it.
 */
export function placeWidget(
  layout: LayoutPrefs,
  id: string,
  area: WidgetArea,
  options: { size?: WidgetSize; before?: string | null; offered?: readonly WidgetSize[] } = {},
): LayoutPrefs {
  const existing = layout.widgets.find((widget) => widget.id === id);
  const size = fitSize(area, options.size ?? existing?.size ?? "medium", options.offered);
  if (!size) return layout;
  const rest = layout.widgets.filter((widget) => widget.id !== id);
  if (rest.filter((widget) => widget.area === area).length >= MAX_PER_AREA) return layout;
  if (rest.length >= MAX_WIDGETS) return layout;
  const placed: WidgetPlacement = { id, area, size };
  const at = options.before ? rest.findIndex((widget) => widget.id === options.before) : -1;
  const widgets = at >= 0 ? [...rest.slice(0, at), placed, ...rest.slice(at)] : [...rest, placed];
  return { ...layout, widgets };
}

export function removeWidget(layout: LayoutPrefs, id: string): LayoutPrefs {
  return { ...layout, widgets: layout.widgets.filter((widget) => widget.id !== id) };
}

export function resizeWidget(
  layout: LayoutPrefs,
  id: string,
  size: WidgetSize,
  offered?: readonly WidgetSize[],
): LayoutPrefs {
  return {
    ...layout,
    widgets: layout.widgets.map((widget) => {
      if (widget.id !== id) return widget;
      return { ...widget, size: fitSize(widget.area, size, offered) ?? widget.size };
    }),
  };
}
