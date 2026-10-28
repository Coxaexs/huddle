import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  MAX_PER_AREA,
  fitSize,
  isDefaultLayout,
  normalizeLayout,
  placeWidget,
  moveToolbarItem,
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
    expect(normalizeLayout(value)).toEqual({ ...DEFAULT_LAYOUT, ...value });
    expect(normalizeLayout(JSON.stringify(value))).toEqual({ ...DEFAULT_LAYOUT, ...value });
  });

  it("drops bad widget ids, duplicates and unknown areas", () => {
    const layout = normalizeLayout({
      widgets: [
        { id: "music", area: "sidebar-bottom", size: "large" },
        { id: "music", area: "header", size: "small" },
        { id: "bot:dnd-bot:initiative", area: "members-top", size: "medium" },
        { id: "<script>", area: "header", size: "small" },
        { id: "bot:x:y", area: "ceiling", size: "small" },
      ],
    });
    expect(layout.widgets.map((widget) => widget.id)).toEqual(["music", "bot:dnd-bot:initiative"]);
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

  it("adds, moves before another widget, resizes and removes", () => {
    let layout = placeWidget(base, "music", "sidebar-bottom", { size: "large" });
    layout = placeWidget(layout, "bot:b:poll", "sidebar-bottom");
    layout = placeWidget(layout, "bot:b:poll", "sidebar-bottom", { before: "music" });
    expect(layout.widgets.map((widget) => widget.id)).toEqual(["bot:b:poll", "music"]);

    layout = placeWidget(layout, "music", "header");
    expect(layout.widgets.find((widget) => widget.id === "music")).toEqual({ id: "music", area: "header", size: "small" });

    layout = resizeWidget(layout, "bot:b:poll", "large");
    expect(layout.widgets.find((widget) => widget.id === "bot:b:poll")?.size).toBe("large");

    layout = removeWidget(layout, "music");
    expect(layout.widgets.map((widget) => widget.id)).toEqual(["bot:b:poll"]);
  });

  it("refuses a widget its area has no size for, and a full area", () => {
    expect(placeWidget(base, "bot:b:big", "header", { offered: ["large"] })).toBe(base);
    let layout = base;
    for (let index = 0; index < MAX_PER_AREA; index += 1) {
      layout = placeWidget(layout, `bot:b:w${index}`, "header");
    }
    expect(placeWidget(layout, "music", "header")).toBe(layout);
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
    expect(placeWidget(DEFAULT_LAYOUT, "music", "call", { size: "large" }).widgets[0]).toEqual({ id: "music", area: "call", size: "large" });
  });
});
