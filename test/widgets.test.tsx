// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/lib/client", () => ({ apiFetch: vi.fn(), basePath: "/hangout" }));
vi.mock("@/app/lib/i18n-context", () => ({
  useI18n: () => ({ t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key) }),
}));
vi.mock("@/app/lib/image-proxy", () => ({ proxiedImage: (url: string) => url }));
vi.mock("@/app/components/music-player", () => ({ openMusicPlayer: vi.fn() }));
vi.mock("@/app/components/widgets/web-view", () => ({ openWebView: vi.fn() }));

import { apiFetch } from "@/app/lib/client";
import { BuiltinWidgetBody } from "@/app/components/widgets/builtin-widgets";
import { BUILTIN_WIDGETS, WidgetHostProvider, type WidgetHostValue } from "@/app/components/widgets/widget-host";
import { WIDGET_SIZES, normalizeLayout, type WidgetSize } from "@/lib/layout-prefs";
import { EN_APP as en } from "@/lib/i18n-catalog/en";

const api = vi.mocked(apiFetch);
const track = (id: string, title: string) => ({
  id, title, artist: "Artist", thumbnail: "https://x/c.jpg", duration: 200, audioUrl: "", pageUrl: `https://y/${id}`, requestedBy: "me",
});
const playing = {
  channelId: "room", track: track("t1", "Song One"), queue: [track("t2", "Song Two")], history: [track("t0", "Song Zero")],
  paused: false, positionMs: 12000, updatedAt: Date.now(), volume: 100, loop: "off" as const,
};
const initiative = { entries: [{ id: "a", name: "Thorin", value: 18 }, { id: "b", name: "Goblin", value: 9 }], turn: 1, round: 3 };
const characters = { me: { name: "Thorin", portraitUrl: null, cls: "Fighter", level: 5, hp: 20, maxHp: 40, ac: 18, abilities: [16, 12, 14, 8, 10, 11], slots: [4, 2], used: [1, 0] } };

function host(over: Partial<WidgetHostValue> = {}): WidgetHostValue {
  return {
    serverId: "s1", activeChannelId: "general", voiceChannelId: "room", players: { room: playing as never },
    voiceRooms: [{ id: "room", name: "Lounge" }, { id: "other", name: "Other" }], joinVoice: vi.fn(), membersOpen: true, musicBot: true, playerBot: true,
    userId: "me", runCommand: vi.fn(async () => undefined), table: { initiative, characters, setInitiative: vi.fn() }, ...over,
  };
}
function show(id: string, size: WidgetSize, value = host()) {
  return render(<WidgetHostProvider value={value}><BuiltinWidgetBody id={id} size={size} area="members-top" /></WidgetHostProvider>);
}

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({ playlists: [{ name: "Road trip", count: 12 }], lines: [[0, "first line"], [10, "second line"], [60, "later line"]], trackId: "t1", results: [] } as never);
});
afterEach(cleanup);

describe("every built-in widget", () => {
  it("has a body, a name and a description", () => {
    expect(BUILTIN_WIDGETS.length).toBeGreaterThanOrEqual(20);
    for (const entry of BUILTIN_WIDGETS) {
      expect((en as Record<string, string>)[entry.titleKey] || entry.titleKey === "widget.music", entry.id).toBeTruthy();
      expect((en as Record<string, string>)[entry.descKey], entry.id).toBeTruthy();
      expect(normalizeLayout({ widgets: [{ id: entry.id, area: "members-top" }] }).widgets, entry.id).toHaveLength(1);
    }
  });

  it.each(BUILTIN_WIDGETS.flatMap((entry) => WIDGET_SIZES.map((size) => [entry.id, size] as const)))("%s draws at %s", async (id, size) => {
    const { container } = show(id, size);
    await act(async () => undefined);
    expect(container.textContent || container.querySelector("button,input,img")).toBeTruthy();
  });

  it.each(BUILTIN_WIDGETS.map((entry) => entry.id))("%s copes with being out of a call", async (id) => {
    const { container } = show(id, "medium", host({ voiceChannelId: null, players: {}, table: { initiative: null, characters: {}, setInitiative: vi.fn() } }));
    await act(async () => undefined);
    expect(container).toBeTruthy();
  });
});

describe("music widgets", () => {
  it("lyrics only ever ask for saved lyrics, never a paid search", async () => {
    show("music-lyrics", "medium");
    await screen.findByText("second line");
    const urls = api.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.startsWith("/api/music/lyrics"))).toBe(true);
    expect(urls.join(" ")).not.toContain("find");
  });

  it("the loop button steps through the modes instead of switching off", async () => {
    show("music-controls", "medium");
    fireEvent.click(screen.getByRole("button", { name: "widget.musicControls.loop" }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(JSON.parse(String((api.mock.calls[0][1] as { body: string }).body)).command).toBe("/loop queue");
  });

  it("shows what is next and what just played", async () => {
    show("music-queue", "medium");
    expect(await screen.findByText("Song Two")).toBeTruthy();
    cleanup();
    show("music-history", "medium");
    expect(await screen.findByText("Song Zero")).toBeTruthy();
  });

  it("starts a playlist", async () => {
    show("music-playlists", "medium");
    fireEvent.click(await screen.findByRole("button", { name: "widget.music.play" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String((api.mock.calls[1][1] as { body: string }).body))).toMatchObject({ name: "Road trip", voiceChannelId: "room", mode: "play" });
  });

  it("two copies keep their own state", async () => {
    const value = host();
    render(
      <WidgetHostProvider value={value}>
        <BuiltinWidgetBody id="music-search" size="medium" area="members-top" />
        <BuiltinWidgetBody id="music-search" size="medium" area="members-top" />
      </WidgetHostProvider>,
    );
    const [one, two] = screen.getAllByRole("textbox") as HTMLInputElement[];
    fireEvent.change(one, { target: { value: "abba" } });
    expect(one.value).toBe("abba");
    expect(two.value).toBe("");
  });
});

describe("D&D widgets", () => {
  it("rolls through /roll, so the real dice show", () => {
    const value = host();
    show("dnd-dice", "medium", value);
    fireEvent.click(screen.getByRole("button", { name: "d20" }));
    expect(value.runCommand).toHaveBeenCalledWith("/roll 1d20");
    fireEvent.click(screen.getByRole("button", { name: "widget.dndDice.adv" }));
    fireEvent.click(screen.getByRole("button", { name: "d20" }));
    expect(value.runCommand).toHaveBeenLastCalledWith("/roll 1d20 adv");
    fireEvent.click(screen.getByRole("button", { name: "widget.dndDice.more" }));
    fireEvent.click(screen.getByRole("button", { name: "d6" }));
    expect(value.runCommand).toHaveBeenLastCalledWith("/roll 2d6");
  });

  it("shows whose turn it is", () => {
    show("dnd-initiative", "medium");
    expect(screen.getByText("Goblin").closest("li")?.className).toContain("is-current");
    expect(screen.getByText(/round.*3/)).toBeTruthy();
  });

  it("shows the party's health and your spell slots", () => {
    show("dnd-party", "medium");
    expect(screen.getByText("20/40")).toBeTruthy();
    cleanup();
    const { container } = show("dnd-slots", "medium");
    expect(container.querySelectorAll(".xw-slot")).toHaveLength(6);
    expect(container.querySelectorAll(".xw-slot.used")).toHaveLength(1);
  });

  it("looks things up in place", async () => {
    api.mockResolvedValue({ text: "A bright streak flashes." } as never);
    show("dnd-spell", "medium");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "fireball" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(await screen.findByText("A bright streak flashes.")).toBeTruthy();
    expect(JSON.parse(String((api.mock.calls[0][1] as { body: string }).body))).toMatchObject({ kind: "spell", query: "fireball", channelId: "general" });
  });

  it("a one-line lookup posts a card, except conditions, whose command is something else", async () => {
    const value = host();
    show("dnd-spell", "small", value);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "fireball" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(value.runCommand).toHaveBeenCalledWith("/spell fireball");
    cleanup();
    api.mockResolvedValue({ text: "You can't move." } as never);
    const other = host();
    show("dnd-condition", "small", other);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "grappled" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(await screen.findByText("You can't move.")).toBeTruthy();
    expect(other.runCommand).not.toHaveBeenCalled();
  });

  it("lists rolls as they come in", async () => {
    show("dnd-rolls", "medium");
    act(() => {
      window.dispatchEvent(new CustomEvent("huddle-dice-roll", { detail: { expression: "1d20", total: 17, roller: { id: "a", displayName: "Sam" }, animationSeed: "s1" } }));
    });
    expect(await screen.findByText("17")).toBeTruthy();
  });
});

describe("what the rebuilt widgets can do", () => {
  const commands = () => api.mock.calls.filter(([url]) => url === "/api/music/command").map(([, init]) => JSON.parse(String(init?.body)).command);

  it("jumps to a queued song, and removes one, by its place in the queue", async () => {
    const two = { ...playing, queue: [track("t2", "Song Two"), track("t3", "Song Three")] };
    show("music-queue", "medium", host({ players: { room: two as never } }));
    fireEvent.click(screen.getByText("Song Three"));
    await waitFor(() => expect(commands()).toContain("/skipto 2"));
    fireEvent.click(screen.getAllByRole("button", { name: "widget.musicQueue.remove" })[0]);
    await waitFor(() => expect(commands()).toContain("/remove 1"));
  });

  it("does not offer to change a queue you are not in the room for", async () => {
    show("music-queue", "medium", host({ voiceChannelId: null }));
    expect(screen.getByText("Song Two")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "widget.musicQueue.remove" })).toBeNull();
    expect(screen.queryByRole("button", { name: "widget.musicQueue.jump" })).toBeNull();
  });

  it("moves initiative on to the next turn", () => {
    const value = host();
    show("dnd-initiative", "medium", value);
    fireEvent.click(screen.getByRole("button", { name: "widget.dndInitiative.next" }));
    expect(value.table.setInitiative).toHaveBeenCalledWith(expect.objectContaining({ turn: 0, round: 4 }));
  });

  it("shows a lookup as the same card chat shows", async () => {
    api.mockResolvedValue({ text: "plain", payload: { type: "spell", name: "Fireball", subtitle: "3rd-level evocation", facts: [{ label: "Range", value: "150 feet" }] } });
    const { container } = show("dnd-spell", "medium");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "fireball" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await screen.findByText("Fireball");
    expect(container.querySelector(".dnd-card")).toBeTruthy();
    expect(screen.queryByText("plain")).toBeNull();
  });

  it("lets you roll from a card, like the one in chat", async () => {
    api.mockResolvedValue({ text: "plain", payload: { type: "monster", name: "Goblin", abilities: [{ label: "DEX", score: 14, mod: "+2" }] } });
    const value = host();
    show("dnd-monster", "medium", value);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "goblin" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    fireEvent.click(await screen.findByTitle(/Roll a DEX check/));
    expect(value.runCommand).toHaveBeenCalledWith("/roll d20+2 Goblin DEX check");
  });

  it("shows a V5 roll's successes, and marks a natural 20", async () => {
    const { container } = show("dnd-rolls", "medium");
    const roll = (seed: string, total: number, value: number, summary?: string) =>
      window.dispatchEvent(new CustomEvent("huddle-dice-roll", { detail: { expression: "1d20", dice: [{ sides: 20, sign: 1, rolls: [{ value, kept: true }] }], modifier: 0, total, summary, roller: { id: "me", displayName: "Thorin" }, rollType: "normal", animationSeed: seed } }));
    act(() => { roll("a", 3, 7, "3 SUCCESSES"); });
    act(() => { roll("b", 20, 20); });
    const badges = [...container.querySelectorAll(".xw-badge")];
    expect(badges.map((badge) => badge.textContent)).toEqual(["20", "3"]);
    expect(badges[0].className).toContain("crit");
  });
});

describe("the progress bar", () => {
  const widgets = ["music-controls", "music-queue", "music-history", "music-cover", "music-lyrics", "music-search", "music-playlists"];
  const at = (seconds: number, over: object = {}) => ({ ...playing, positionMs: seconds * 1000, updatedAt: Date.now(), paused: true, ...over });
  const room = (value: object) => host({ players: { room: value as never } });

  it.each(widgets)("%s shows the song's times, like the Music widget", async (id) => {
    for (const size of ["medium", "large"] as const) {
      const { container, unmount } = show(id, size, room(at(50)));
      await act(async () => undefined);
      const bar = container.querySelector(".mw-progress");
      expect(bar?.textContent, size).toBe("0:503:20");
      expect((bar?.firstElementChild as HTMLElement).style.width, size).toBe("25%");
      unmount();
    }
  });

  it.each(widgets)("%s has a thin bar at small size", async (id) => {
    const { container } = show(id, "small", room(at(50)));
    await act(async () => undefined);
    expect((container.querySelector(".xw-edge-bar > span") as HTMLElement).style.width).toBe("25%");
  });

  it.each(widgets)("%s has no bar with nothing playing", async (id) => {
    const { container } = show(id, "medium", host({ players: {} }));
    await act(async () => undefined);
    expect(container.querySelector(".mw-progress")).toBeNull();
  });

  it.each(widgets)("%s has no bar for a live stream, which has no length", async (id) => {
    const { container } = show(id, "medium", room(at(50, { track: { ...playing.track, duration: null } })));
    await act(async () => undefined);
    expect(container.querySelector(".mw-progress")).toBeNull();
  });

  it("stops at the end of the song", async () => {
    const { container } = show("music-queue", "medium", room(at(500)));
    await act(async () => undefined);
    expect(container.querySelector(".mw-progress")?.textContent).toBe("3:203:20");
  });

  it("moves while the song plays", async () => {
    vi.useFakeTimers();
    try {
      const { container } = show("music-queue", "medium", room(at(50, { paused: false })));
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(container.querySelector(".mw-progress")?.textContent).toBe("1:003:20");
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives every room its own bar", async () => {
    const value = host({ players: { room: at(50) as never, other: at(100, { channelId: "other" }) as never } });
    const { container } = show("music-rooms", "medium", value);
    await act(async () => undefined);
    const widths = [...container.querySelectorAll<HTMLElement>(".xw-row-bar > span")].map((bar) => bar.style.width);
    expect(widths).toEqual(["25%", "50%"]);
  });
});
