// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LyricsNow } from "@/app/components/lyrics-now";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const lines = [5, 12, 20, 31, 40, 52, 61, 75].map((at, n) => ({
  at,
  line: `Line ${n + 1}`,
  active: false,
}));

it("jumps the song to a line when it is clicked while playing", () => {
  const onSeek = vi.fn();
  render(<LyricsNow track="Song" lines={lines} live positionMs={33_000} onSeek={onSeek} />);
  // The five lines around "Line 4", the one being sung.
  expect(screen.queryByText("Line 1")).toBeNull();
  expect(screen.getByText("Line 4").closest("button")?.getAttribute("aria-current")).toBe("true");

  fireEvent.click(screen.getByText("Line 6"));
  expect(onSeek).toHaveBeenCalledWith(52_000);
});

it("seeks to where the corrected timing shows the line", () => {
  const onSeek = vi.fn();
  render(<LyricsNow track="Song" lines={lines} live positionMs={33_000} onSeek={onSeek} />);
  fireEvent.click(screen.getByText("+1s")); // lyrics shown 1 s earlier
  fireEvent.click(screen.getByText("Line 5"));
  expect(onSeek).toHaveBeenCalledWith(39_000);
});

it("opens the whole song so any line can be reached", () => {
  const onSeek = vi.fn();
  render(<LyricsNow track="Song" lines={lines} live positionMs={33_000} onSeek={onSeek} />);
  fireEvent.click(screen.getByText("Whole song"));
  fireEvent.click(screen.getByText("Line 8"));
  expect(onSeek).toHaveBeenCalledWith(75_000);
  fireEvent.click(screen.getByText("Line 1"));
  expect(onSeek).toHaveBeenLastCalledWith(5_000);
  fireEvent.click(screen.getByText("Fewer lines"));
  expect(screen.queryByText("Line 1")).toBeNull();
});

it("lines are plain text once the song is no longer playing", () => {
  const onSeek = vi.fn();
  render(<LyricsNow track="Song" lines={lines} onSeek={onSeek} />);
  expect(screen.getByText("Line 1").closest("button")).toBeNull();
  fireEvent.click(screen.getByText("Line 1"));
  expect(onSeek).not.toHaveBeenCalled();
  expect(screen.queryByText("Whole song")).toBeNull();
});

it("says when Musixmatch only had another cut of the song", () => {
  render(
    <LyricsNow
      track="Mayın Tarlası"
      artist="Şebnem Ferah"
      lines={lines}
      source="musixmatch"
      sourceUrl="https://www.musixmatch.com/lyrics/%C5%9Eebnem-Ferah/May%C4%B1n-Tarlas%C4%B1"
      versionLength={448}
    />,
  );
  expect(screen.getByRole("link", { name: "Musixmatch" }).getAttribute("href")).toBe(
    "https://www.musixmatch.com/lyrics/%C5%9Eebnem-Ferah/May%C4%B1n-Tarlas%C4%B1",
  );
  expect(screen.getByText(/7:28 version of the song/)).toBeTruthy();
});

it("names lrclib for older cards, and only links to the sources themselves", () => {
  render(<LyricsNow track="Song" lines={lines} sourceUrl="https://evil.example/" />);
  expect(screen.getByRole("link", { name: "LRCLIB" }).getAttribute("href")).toBe("https://lrclib.net/");
});

it("Wrong lyrics? opens the picker while the song plays", () => {
  const onFix = vi.fn();
  render(<LyricsNow track="Song" lines={lines} live positionMs={33_000} onFix={onFix} loose />);
  fireEvent.click(screen.getByText("Wrong lyrics?"));
  fireEvent.click(screen.getByText("Pick the right one"));
  expect(onFix).toHaveBeenCalledTimes(2);
});
