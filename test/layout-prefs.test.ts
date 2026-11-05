import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  MAX_PER_AREA,
  MAX_PER_ROW,
  MAX_WIDGETS,
  fitSize,
  isDefaultLayout,
  normalizeLayout,
  placeWidget,
  moveToolbarItem,
  moveWidget,
  removeWidget,
  resizeWidget,
  setPanelPartHidden,
  setToolbarItemHidden,
  toolbarState,
  TOOLBARS,
} from "@/lib/layout-prefs";

describe("normalizeLayout", () => {
  it("falls back to today's layout for anything missing or unknown", () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout("not json")).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout({ channels: "diagonal", members: "up" })).toEqual(DEFAULT_LAYOUT);
    expect(isDefaultLayout(normalizeLayout(undefined))).toBe(true);
  });

  it("keeps valid sides and widgets, from an object or stored JSON", () => {
    const value = { channels: "bottom", members: "left", widgets: [{ id: "music", area: "header", size: "small" }] };
    const expected = { ...DEFAULT_LAYOUT, ...value, widgets: value.widgets.map((widget) => expect.objectContaining(widget)) };
    expect(normalizeLayout(value)).toEqual(expected);
    expect(normalizeLayout(JSON.stringify(value))).toEqual(expected);
  });

  it("drops bad widget ids and unknown areas, and keeps copies of the same widget", () => {
    const layout = normalizeLayout({
      widgets: [
        { id: "music", area: "sidebar-bottom", size: "large" },
        { id: "music", area: "header", size: "small" },
        { id: "bot:dnd-bot:initiative", area: "members-top", size: "medium" },
        { id: "<script>", area: "header", size: "small" },
        { id: "bot:x:y", area: "ceiling", size: "small" },
      ],
    });
    expect(layout.widgets.map((widget) => widget.id)).toEqual(["music", "music", "bot:dnd-bot:initiative"]);
  });

  it("shrinks a widget to what its area allows", () => {
    const layout = normalizeLayout({ widgets: [{ id: "music", area: "header", size: "large" }] });
    expect(layout.widgets[0].size).toBe("small");
  });

  it("caps each area", () => {
    const widgets = Array.from({ length: MAX_PER_AREA + 2 }, (_, index) => ({
      id: `bot:b:w${index}`,
      area: "members-top",
      size: "medium",
    }));
    expect(normalizeLayout({ widgets }).widgets).toHaveLength(MAX_PER_AREA);
  });
});

describe("fitSize", () => {
  it("uses the wanted size when both the area and the widget allow it", () => {
    expect(fitSize("sidebar-bottom", "large")).toBe("large");
  });

  it("picks the nearest size both allow", () => {
    expect(fitSize("sidebar-top", "large")).toBe("medium");
    expect(fitSize("members-top", "small", ["large"])).toBe("large");
  });

  it("says when a widget cannot go somewhere at all", () => {
    expect(fitSize("header", "medium", ["medium", "large"])).toBeNull();
  });
});

describe("placing widgets", () => {
  const base = normalizeLayout(null);

  const uids = (layout: ReturnType<typeof normalizeLayout>, id: string) =>
    layout.widgets.filter((widget) => widget.id === id).map((widget) => widget.uid);

  it("adds, moves before another widget, resizes and removes", () => {
    let layout = placeWidget(base, "music", "sidebar-bottom", { size: "large" });
    layout = placeWidget(layout, "bot:b:poll", "sidebar-bottom");
    const [music] = uids(layout, "music");
    const [poll] = uids(layout, "bot:b:poll");
    layout = moveWidget(layout, poll, "sidebar-bottom", { before: music });
    expect(layout.widgets.map((widget) => widget.id)).toEqual(["bot:b:poll", "music"]);

    layout = moveWidget(layout, music, "header");
    expect(layout.widgets.find((widget) => widget.id === "music")).toEqual({ uid: music, id: "music", area: "header", size: "small" });

    layout = resizeWidget(layout, poll, "large");
    expect(layout.widgets.find((widget) => widget.id === "bot:b:poll")?.size).toBe("large");

    layout = removeWidget(layout, music);
    expect(layout.widgets.map((widget) => widget.id)).toEqual(["bot:b:poll"]);
  });

  it("places the same widget as many times as you like", () => {
    let layout = placeWidget(base, "music", "sidebar-bottom");
    layout = placeWidget(layout, "music", "sidebar-bottom");
    layout = placeWidget(layout, "music", "members-top", { size: "large" });
    const placed = uids(layout, "music");
    expect(placed).toHaveLength(3);
    expect(new Set(placed).size).toBe(3);
    expect(normalizeLayout(layout).widgets).toHaveLength(3);
  });

  it("moves, resizes and removes one copy without touching the others", () => {
    let layout = placeWidget(base, "dnd-dice", "sidebar-bottom");
    layout = placeWidget(layout, "dnd-dice", "sidebar-bottom");
    const [first, second] = uids(layout, "dnd-dice");
    layout = resizeWidget(layout, second, "large");
    expect(layout.widgets.map((widget) => widget.size)).toEqual(["medium", "large"]);
    layout = moveWidget(layout, first, "members-top");
    expect(layout.widgets.map((widget) => widget.area).sort()).toEqual(["members-top", "sidebar-bottom"]);
    layout = removeWidget(layout, first);
    expect(uids(layout, "dnd-dice")).toEqual([second]);
  });

  it("keeps a layout saved before copies existed, the same way every time", () => {
    const old = { widgets: [{ id: "music", area: "sidebar-bottom", size: "large" }, { id: "bot:b:poll", area: "header", size: "small" }] };
    const once = normalizeLayout(old);
    expect(once.widgets.map((widget) => widget.id)).toEqual(["music", "bot:b:poll"]);
    expect(new Set(once.widgets.map((widget) => widget.uid)).size).toBe(2);
    expect(normalizeLayout(old)).toEqual(once);
    expect(normalizeLayout(once)).toEqual(once);
  });

  it("gives two copies stored with the same uid their own", () => {
    const layout = normalizeLayout({ widgets: [
      { uid: "abc", id: "music", area: "sidebar-bottom", size: "medium" },
      { uid: "abc", id: "music", area: "sidebar-bottom", size: "medium" },
    ] });
    expect(new Set(layout.widgets.map((widget) => widget.uid)).size).toBe(2);
  });

  it("accepts every built-in widget and refuses made-up ones", () => {
    const layout = normalizeLayout({ widgets: [
      { id: "music-lyrics", area: "members-top" },
      { id: "dnd-dice", area: "members-top" },
      { id: "<script>", area: "members-top" },
      { id: "dnd-", area: "members-top" },
    ] });
    expect(layout.widgets.map((widget) => widget.id)).toEqual(["music-lyrics", "dnd-dice"]);
  });

  it("refuses a widget its area has no size for, and a full area", () => {
    expect(placeWidget(base, "bot:b:big", "header", { offered: ["large"] })).toBe(base);
    let layout = base;
    for (let index = 0; index < MAX_PER_ROW; index += 1) layout = placeWidget(layout, "music", "header");
    expect(layout.widgets).toHaveLength(MAX_PER_ROW);
    expect(placeWidget(layout, "music", "header")).toBe(layout);
  });

  it("stops at the overall limit", () => {
    let layout = base;
    for (const area of ["sidebar-bottom", "members-top", "sidebar-top", "header", "call"] as const) {
      for (let index = 0; index < MAX_PER_AREA; index += 1) layout = placeWidget(layout, "music", area);
    }
    expect(layout.widgets.length).toBeLessThanOrEqual(MAX_WIDGETS);
    expect(normalizeLayout(layout).widgets).toHaveLength(layout.widgets.length);
  });
});

describe("toolbars", () => {
  it("ships every bar as it is, with nothing stored", () => {
    const state = toolbarState(DEFAULT_LAYOUT, "call");
    expect(state.order).toEqual(TOOLBARS.call.items);
    expect([...toolbarState(DEFAULT_LAYOUT, "composer").hidden]).toEqual(["format", "poll", "games", "commands"]);
  });

  it("moves a button before or after another, and stores only what changed", () => {
    let layout = moveToolbarItem(DEFAULT_LAYOUT, "header", "members", "invite");
    expect(toolbarState(layout, "header").order.slice(0, 2)).toEqual(["members", "invite"]);
    layout = moveToolbarItem(layout, "header", "members", "achievements", true);
    expect(toolbarState(layout, "header").order).toEqual(TOOLBARS.header.items);
    expect(layout.toolbars).toEqual({});
    expect(isDefaultLayout(layout)).toBe(true);
  });

  it("hides a button, shows it again when it is moved back into the bar, and never hides a locked one", () => {
    let layout = setToolbarItemHidden(DEFAULT_LAYOUT, "call", "leave", true);
    expect(toolbarState(layout, "call").hidden.has("leave")).toBe(true);
    expect(isDefaultLayout(layout)).toBe(false);
    layout = moveToolbarItem(layout, "call", "leave", "mute");
    expect(toolbarState(layout, "call").hidden.has("leave")).toBe(false);
    expect(setToolbarItemHidden(layout, "call", "more", true)).toBe(layout);
    // Pinning a tucked-away tool shows it in the bar.
    const pinned = setToolbarItemHidden(DEFAULT_LAYOUT, "composer", "poll", false);
    expect(toolbarState(pinned, "composer").hidden.has("poll")).toBe(false);
  });

  it("drops unknown items and slots new ones in next to their neighbour", () => {
    const layout = normalizeLayout({
      toolbars: { header: { order: ["members", "bogus", "search", "members"], hidden: ["pins", "nope"] } },
    });
    const order = toolbarState(layout, "header").order;
    expect(order).toHaveLength(TOOLBARS.header.items.length);
    // Kept items keep their order; "invite" ships first, "mentions" right after "search".
    expect(order).toEqual(["invite", "members", "search", "mentions", "pins", "saved", "achievements"]);
    expect([...toolbarState(layout, "header").hidden]).toEqual(["pins"]);
  });

  it("keeps the call bar side and switched-off parts, and ignores junk", () => {
    const layout = normalizeLayout({ callBar: "left", hide: ["topic", "banner", "everything"] });
    expect(layout.callBar).toBe("left");
    expect(layout.hide).toEqual(["banner", "topic"]);
    expect(normalizeLayout({ callBar: "diagonal" }).callBar).toBe("bottom");
    expect(setPanelPartHidden(layout, "banner", false).hide).toEqual(["topic"]);
    expect(isDefaultLayout(setPanelPartHidden(setPanelPartHidden(layout, "banner", false), "topic", false))).toBe(false);
  });

  it("puts widgets in the call view in its two sizes", () => {
    expect(fitSize("call", "medium")).toBe("small");
    expect(placeWidget(DEFAULT_LAYOUT, "music", "call", { size: "large" }).widgets[0]).toMatchObject({ id: "music", area: "call", size: "large" });
  });
});
