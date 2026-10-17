// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MusicHistoryCard } from "@/app/components/music-cards";

afterEach(cleanup);

const history = Array.from({ length: 60 }, (_, n) => ({
  index: n + 1,
  title: n === 42 ? "Adamlar - Sarılırım Birine" : `Song ${n + 1}`,
  playedAt: Date.now() - n * 60_000,
  requestedBy: n % 2 ? "Smart Autoplay" : "mewis",
}));

it("pages /longhistory 25 at a time and finds a song by name", () => {
  render(<MusicHistoryCard history={history} long />);
  expect(screen.getByText("Page 1 / 3")).toBeTruthy();
  expect(screen.getByText("Song 1")).toBeTruthy();
  expect(screen.queryByText("Song 26")).toBeNull();

  fireEvent.click(screen.getByText(/Older/));
  expect(screen.getByText("Song 26")).toBeTruthy();
  expect(screen.getByText("Page 2 / 3")).toBeTruthy();

  fireEvent.change(screen.getByPlaceholderText(/Find a song/), { target: { value: "sarılırım" } });
  expect(screen.getByText("Adamlar - Sarılırım Birine")).toBeTruthy();
  expect(screen.queryByText("Song 1")).toBeNull();
  expect(screen.queryByText(/Page /)).toBeNull();
  expect(screen.getByText(/Today .* · mewis/)).toBeTruthy();
});

it("keeps plain /history unpaged", () => {
  render(<MusicHistoryCard history={history.slice(0, 10)} />);
  expect(screen.queryByPlaceholderText(/Find a song/)).toBeNull();
  expect(screen.getByText("Song 10")).toBeTruthy();
});
