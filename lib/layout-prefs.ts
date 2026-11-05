/**
 * Where the panels sit, which widgets someone has placed and how their
 * toolbars are arranged, as one small JSON value on the account
 * (users.layout_prefs). The default is the layout everyone already has:
 * channels on the left, members on the right, call controls at the bottom, no
 * widgets, every button where it ships. Anything unknown in a stored value
 * falls back to that default, so an old client or a hand-edited value can
 * never break the app.
 */

export type ChannelsSide = "left" | "right" | "top" | "bottom";
export type MembersSide = "right" | "left";
export type CallBarSide = "bottom" | "top" | "left" | "right";

/** The places a widget can go. "call" is a line beside the call controls. */
export type WidgetArea = "sidebar-top" | "sidebar-bottom" | "members-top" | "header" | "call";
export type WidgetSize = "small" | "medium" | "large";

/** Bits of the interface someone can switch off. */
export type PanelPart = "banner" | "events" | "topic";

export type ToolbarId = "header" | "composer" | "call";

/** A toolbar someone rearranged: every item in their order, and the hidden ones. */
export interface ToolbarPrefs {
  order: string[];
  hidden: string[];
}

export interface WidgetPlacement {
  /** This placement. The same widget can be placed many times, each with its own. */
  uid: string;
  /** Which widget: "music", "music-queue", "dnd-dice" and so on, or `bot:<botId>:<name>`. */
  id: string;
  area: WidgetArea;
  size: WidgetSize;
}

export interface LayoutPrefs {
  channels: ChannelsSide;
  members: MembersSide;
  widgets: WidgetPlacement[];
  callBar: CallBarSide;
  /** Only the toolbars someone changed; the rest are as they ship. */
  toolbars: Partial<Record<ToolbarId, ToolbarPrefs>>;
  hide: PanelPart[];
}

export const DEFAULT_LAYOUT: LayoutPrefs = {
  channels: "left",
  members: "right",
  widgets: [],
  callBar: "bottom",
  toolbars: {},
  hide: [],
};

/** A fresh copy of the default, safe to change. */
export function defaultLayout(): LayoutPrefs {
  return { ...DEFAULT_LAYOUT, widgets: [], toolbars: {}, hide: [] };
}

export const CHANNEL_SIDES: ChannelsSide[] = ["left", "right", "top", "bottom"];
export const MEMBER_SIDES: MembersSide[] = ["right", "left"];
export const CALL_BAR_SIDES: CallBarSide[] = ["bottom", "top", "left", "right"];
export const PANEL_PARTS: PanelPart[] = ["banner", "events", "topic"];
export const WIDGET_AREAS: WidgetArea[] = ["header", "sidebar-top", "sidebar-bottom", "members-top", "call"];
export const WIDGET_SIZES: WidgetSize[] = ["small", "medium", "large"];

/**
 * Every button a toolbar can show, in the order it ships, and which of them
 * start tucked into the toolbar's overflow menu. Hiding a button moves it
 * there too, so nothing becomes unreachable. Locked items can move but not
 * hide (the call bar's "more" button is where the hidden ones go).
 */
export const TOOLBARS: Record<ToolbarId, { items: readonly string[]; hidden: readonly string[]; locked: readonly string[] }> = {
  header: {
    items: ["invite", "search", "mentions", "pins", "saved", "achievements", "members"],
    hidden: [],
    locked: [],
  },
  composer: {
    items: ["emoji", "gif", "format", "poll", "games", "commands"],
    hidden: ["format", "poll", "games", "commands"],
    locked: [],
  },
  call: {
    items: [
      "table", "living", "important", "priority", "sep1",
      "mute", "deafen", "camera", "screen", "sep2",
      "focus", "activities", "more", "qa", "sep3",
      "leave", "sep4", "popout", "fullscreen",
    ],
    hidden: [],
    locked: ["more"],
  },
};
export const TOOLBAR_IDS = Object.keys(TOOLBARS) as ToolbarId[];

/**
 * Which sizes fit where. The header is one line high; the channel list is
 * narrow at the top (it pushes the channels down) and roomier at the bottom.
 */
export const AREA_SIZES: Record<WidgetArea, WidgetSize[]> = {
  header: ["small"],
  "sidebar-top": ["small", "medium"],
  "sidebar-bottom": ["small", "medium", "large"],
  "members-top": ["small", "medium", "large"],
  // Small sits among the buttons' row; large is a full line above them.
  call: ["small", "large"],
};

export const MAX_WIDGETS = 40;
export const MAX_PER_AREA = 12;
/** The header and the call line are one row, so they hold fewer. */
const ROW_AREAS: readonly WidgetArea[] = ["header", "call"];
export const MAX_PER_ROW = 6;

export function maxInArea(area: WidgetArea): number {
  return ROW_AREAS.includes(area) ? MAX_PER_ROW : MAX_PER_AREA;
}

const WIDGET_ID = /^(music(-[a-z]+)?|dnd-[a-z]+|bot:[A-Za-z0-9_-]{1,64}:[a-z0-9_-]{1,32})$/;
const WIDGET_UID = /^[a-z0-9]{1,16}$/;

function freshUid(taken: ReadonlySet<string>): string {
  for (;;) {
    const uid = Math.random().toString(36).slice(2, 10);
    if (uid && !taken.has(uid)) return uid;
  }
}

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
  if (!value || typeof value !== "object") return defaultLayout();
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
    const { uid, id, area, size } = item as Record<string, unknown>;
    if (typeof id !== "string" || !WIDGET_ID.test(id)) continue;
    if (!WIDGET_AREAS.includes(area as WidgetArea)) continue;
    const where = area as WidgetArea;
    if ((perArea.get(where) ?? 0) >= maxInArea(where)) continue;
    const fitted = fitSize(where, WIDGET_SIZES.includes(size as WidgetSize) ? (size as WidgetSize) : "medium");
    if (!fitted) continue;
    // Layouts from before a widget could be placed twice have no uid. The same
    // one every time, so reading a layout twice gives the same result.
    let key = typeof uid === "string" && WIDGET_UID.test(uid) && !seen.has(uid) ? uid : `w${widgets.length}`;
    while (seen.has(key)) key += "x";
    seen.add(key);
    perArea.set(where, (perArea.get(where) ?? 0) + 1);
    widgets.push({ uid: key, id, area: where, size: fitted });
  }

  const callBar = CALL_BAR_SIDES.includes(input.callBar as CallBarSide)
    ? (input.callBar as CallBarSide)
    : DEFAULT_LAYOUT.callBar;
  const hide = PANEL_PARTS.filter((part) => Array.isArray(input.hide) && input.hide.includes(part));
  const toolbars: LayoutPrefs["toolbars"] = {};
  const rawToolbars = input.toolbars && typeof input.toolbars === "object" ? (input.toolbars as Record<string, unknown>) : {};
  for (const id of TOOLBAR_IDS) {
    const prefs = normalizeToolbar(id, rawToolbars[id]);
    if (prefs) toolbars[id] = prefs;
  }
  return { channels, members, widgets, callBar, toolbars, hide };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * A toolbar's stored order and hidden set against what the toolbar has now:
 * unknown items drop out, new ones go in next to the item they ship after.
 * Null when the result is just the default.
 */
function normalizeToolbar(id: ToolbarId, raw: unknown): ToolbarPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const spec = TOOLBARS[id];
  const input = raw as Record<string, unknown>;
  const order = [...new Set(strings(input.order).filter((item) => spec.items.includes(item)))];
  spec.items.forEach((item, index) => {
    if (order.includes(item)) return;
    const before = index > 0 ? order.indexOf(spec.items[index - 1]) : -1;
    order.splice(before + 1, 0, item);
  });
  const hidden = spec.items.filter(
    (item) => strings(input.hidden).includes(item) && !spec.locked.includes(item),
  );
  const sameOrder = order.every((item, index) => item === spec.items[index]);
  const sameHidden = hidden.length === spec.hidden.length && hidden.every((item) => spec.hidden.includes(item));
  return sameOrder && sameHidden ? null : { order, hidden };
}

/** A toolbar as it should show: every item in order, and which are hidden. */
export function toolbarState(layout: LayoutPrefs, id: ToolbarId): { order: readonly string[]; hidden: ReadonlySet<string> } {
  const prefs = layout.toolbars?.[id];
  return prefs
    ? { order: prefs.order, hidden: new Set(prefs.hidden) }
    : { order: TOOLBARS[id].items, hidden: new Set(TOOLBARS[id].hidden) };
}

function withToolbar(layout: LayoutPrefs, id: ToolbarId, order: readonly string[], hidden: Iterable<string>): LayoutPrefs {
  const toolbars = { ...layout.toolbars };
  const prefs = normalizeToolbar(id, { order: [...order], hidden: [...hidden] });
  if (prefs) toolbars[id] = prefs;
  else delete toolbars[id];
  return { ...layout, toolbars };
}

/**
 * Moves a toolbar item next to another (before it, or after it when `after`),
 * or to the end when `target` is null. A hidden item that is moved into the
 * bar shows again.
 */
export function moveToolbarItem(
  layout: LayoutPrefs,
  id: ToolbarId,
  item: string,
  target: string | null,
  after = false,
): LayoutPrefs {
  const state = toolbarState(layout, id);
  if (!state.order.includes(item)) return layout;
  const order = state.order.filter((entry) => entry !== item);
  const at = target && target !== item ? order.indexOf(target) : -1;
  if (at >= 0) order.splice(after ? at + 1 : at, 0, item);
  else if (target === item) order.splice(state.order.indexOf(item), 0, item);
  else order.push(item);
  const hidden = new Set(state.hidden);
  hidden.delete(item);
  return withToolbar(layout, id, order, hidden);
}

export function setToolbarItemHidden(layout: LayoutPrefs, id: ToolbarId, item: string, hidden: boolean): LayoutPrefs {
  const state = toolbarState(layout, id);
  if (!state.order.includes(item) || (hidden && TOOLBARS[id].locked.includes(item))) return layout;
  const next = new Set(state.hidden);
  if (hidden) next.add(item);
  else next.delete(item);
  return withToolbar(layout, id, state.order, next);
}

export function resetToolbar(layout: LayoutPrefs, id: ToolbarId): LayoutPrefs {
  const toolbars = { ...layout.toolbars };
  delete toolbars[id];
  return { ...layout, toolbars };
}

export function setPanelPartHidden(layout: LayoutPrefs, part: PanelPart, hidden: boolean): LayoutPrefs {
  const next = new Set(layout.hide);
  if (hidden) next.add(part);
  else next.delete(part);
  return { ...layout, hide: PANEL_PARTS.filter((entry) => next.has(entry)) };
}

export function isDefaultLayout(layout: LayoutPrefs): boolean {
  return (
    layout.channels === DEFAULT_LAYOUT.channels &&
    layout.members === DEFAULT_LAYOUT.members &&
    layout.widgets.length === 0 &&
    (layout.callBar ?? "bottom") === DEFAULT_LAYOUT.callBar &&
    !Object.keys(layout.toolbars ?? {}).length &&
    !(layout.hide ?? []).length
  );
}

/** Where a placement goes: before another one (by uid) when given, else at the end. */
function insert(widgets: WidgetPlacement[], placed: WidgetPlacement, before?: string | null): WidgetPlacement[] {
  const at = before ? widgets.findIndex((widget) => widget.uid === before) : -1;
  return at >= 0 ? [...widgets.slice(0, at), placed, ...widgets.slice(at)] : [...widgets, placed];
}

function roomFor(widgets: readonly WidgetPlacement[], area: WidgetArea): boolean {
  return widgets.filter((widget) => widget.area === area).length < maxInArea(area) && widgets.length < MAX_WIDGETS;
}

/**
 * Adds a copy of a widget to an area, however many are already placed. It
 * goes before the placement `before` when given, else at the end. A full area
 * refuses it, and so does one with no size the widget offers.
 */
export function placeWidget(
  layout: LayoutPrefs,
  id: string,
  area: WidgetArea,
  options: { size?: WidgetSize; before?: string | null; offered?: readonly WidgetSize[] } = {},
): LayoutPrefs {
  const size = fitSize(area, options.size ?? "medium", options.offered);
  if (!size || !roomFor(layout.widgets, area)) return layout;
  const uid = freshUid(new Set(layout.widgets.map((widget) => widget.uid)));
  return { ...layout, widgets: insert(layout.widgets, { uid, id, area, size }, options.before) };
}

/** Moves one placement, keeping its size where the new area allows it. */
export function moveWidget(
  layout: LayoutPrefs,
  uid: string,
  area: WidgetArea,
  options: { before?: string | null; offered?: readonly WidgetSize[] } = {},
): LayoutPrefs {
  const widget = layout.widgets.find((item) => item.uid === uid);
  if (!widget) return layout;
  const size = fitSize(area, widget.size, options.offered);
  const rest = layout.widgets.filter((item) => item.uid !== uid);
  if (!size || !roomFor(rest, area)) return layout;
  return { ...layout, widgets: insert(rest, { ...widget, area, size }, options.before) };
}

export function removeWidget(layout: LayoutPrefs, uid: string): LayoutPrefs {
  return { ...layout, widgets: layout.widgets.filter((widget) => widget.uid !== uid) };
}

export function resizeWidget(
  layout: LayoutPrefs,
  uid: string,
  size: WidgetSize,
  offered?: readonly WidgetSize[],
): LayoutPrefs {
  return {
    ...layout,
    widgets: layout.widgets.map((widget) => {
      if (widget.uid !== uid) return widget;
      return { ...widget, size: fitSize(widget.area, size, offered) ?? widget.size };
    }),
  };
}
