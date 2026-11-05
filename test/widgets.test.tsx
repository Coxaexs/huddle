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
    userId: "me", runCommand: vi.fn(async () => undefined), table: { initiative, characters }, ...over,
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
    const { container } = show(id, "medium", host({ voiceChannelId: null, players: {}, table: { initiative: null, characters: {} } }));
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
    expect(screen.getByText("Goblin").closest("li")?.className).toContain("bw-current");
    expect(screen.getByText(/round.*3/)).toBeTruthy();
  });

  it("shows the party's health and your spell slots", () => {
    show("dnd-party", "medium");
    expect(screen.getByText("20/40")).toBeTruthy();
    cleanup();
    const { container } = show("dnd-slots", "medium");
    expect(container.querySelectorAll(".bw-slot")).toHaveLength(6);
    expect(container.querySelectorAll(".bw-slot.used")).toHaveLength(1);
  });

  it("looks things up in place", async () => {
    api.mockResolvedValue({ text: "A bright streak flashes." } as never);
    show("dnd-spell", "medium");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "fireball" } });
    fireEvent.click(screen.getByRole("button", { name: "widget.musicSearch.go" }));
    expect(await screen.findByText("A bright streak flashes.")).toBeTruthy();
    expect(JSON.parse(String((api.mock.calls[0][1] as { body: string }).body))).toMatchObject({ kind: "spell", query: "fireball", channelId: "general" });
  });

  it("a one-line lookup posts a card, except conditions, whose command is something else", async () => {
    const value = host();
    show("dnd-spell", "small", value);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "fireball" } });
    fireEvent.click(screen.getByRole("button", { name: "widget.musicSearch.go" }));
    expect(value.runCommand).toHaveBeenCalledWith("/spell fireball");
    cleanup();
    api.mockResolvedValue({ text: "You can't move." } as never);
    const other = host();
    show("dnd-condition", "small", other);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "grappled" } });
    fireEvent.click(screen.getByRole("button", { name: "widget.musicSearch.go" }));
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
