// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { RetroChrome, type RetroChromeProps } from "@/app/components/retro-chrome";
import { getWinampEq, setWinampEq, useMusicEq } from "@/app/lib/winamp-eq-store";
import { EQ_PRESETS, FLAT_EQ } from "@/lib/winamp-eq";

const noop = () => {};
const props: RetroChromeProps = {
  serverName: "Hoffle", serverIconUrl: null, bannerUrl: null, channelName: "general", channelNumber: 1, channelTopic: null,
  onlineCount: 3, memberCount: 9, userName: "mewis", connected: true, voiceRoom: null, muted: false, deafened: false,
  pingMs: 20, player: null, membersOpen: false,
  onPrevChannel: noop, onNextChannel: noop, onToggleMute: noop, onToggleDeafen: noop, onLeaveVoice: noop, onOpenSettings: noop,
  onOpenSearch: noop, onOpenShortcuts: noop, onToggleMembers: noop, onOpenSounds: noop, onOpenPicture: noop, onOpenToday: noop,
  onSendNudge: noop, onSignOut: noop,
};

beforeEach(() => {
  document.documentElement.dataset.customThemeId = "winamp";
  setWinampEq({ ...FLAT_EQ });
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.customThemeId;
  window.localStorage.clear();
});

describe("Winamp equalizer", () => {
  it("loads a preset from the menu and moves the sliders to it", () => {
    render(<RetroChrome {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "PRESETS" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Rock" }));
    const rock = EQ_PRESETS.find((p) => p.name === "Rock")!;
    expect(getWinampEq()).toMatchObject({ on: true, preset: "Rock", bands: rock.bands });
    expect(screen.getByRole("slider", { name: "60Hz" }).getAttribute("aria-valuenow")).toBe(String(rock.bands[0]));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("huddle-winamp-eq-settings")!).preset).toBe("Rock");
  });

  it("moves a slider from the keyboard, snaps to the middle, and resets on a double click", () => {
    render(<RetroChrome {...props} />);
    const slider = screen.getByRole("slider", { name: "1KHz" });
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    expect(getWinampEq().bands[4]).toBe(1);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(getWinampEq().bands[4]).toBe(12);
    fireEvent.keyDown(slider, { key: "End" });
    expect(getWinampEq().bands[4]).toBe(-12);
    fireEvent.doubleClick(slider);
    expect(getWinampEq().bands[4]).toBe(0);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Preamp" }), { key: "PageDown" });
    expect(getWinampEq().preamp).toBe(-3);
  });

  it("switches off with the ON button", () => {
    render(<RetroChrome {...props} />);
    const on = screen.getByRole("button", { name: "ON" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(on);
    expect(on.getAttribute("aria-pressed")).toBe("false");
    expect(getWinampEq().on).toBe(false);
  });
});

describe("the music as heard", () => {
  it("goes through the equalizer only while the Winamp theme is on", async () => {
    setWinampEq({ bands: [6, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    const { result } = renderHook(() => useMusicEq());
    expect(result.current).toEqual([-4.5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const before = result.current;
    act(() => setWinampEq({ preset: null }));
    expect(result.current).toBe(before); // the same setting: the same array, nothing re-planned
    await act(async () => { document.documentElement.dataset.customThemeId = "matrix"; });
    expect(result.current).toBeNull();
    await act(async () => { document.documentElement.dataset.customThemeId = "winamp"; });
    act(() => setWinampEq({ on: false }));
    expect(result.current).toBeNull();
  });
});
