// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ClubBar, crowdLine, type ClubStatus } from "@/app/components/club-panel";
import type { ClubInfo } from "@/lib/club-feed";

afterEach(cleanup);

function bar(info: ClubInfo, options: { isDj?: boolean } = {}) {
  const onCrowd = vi.fn();
  const status: ClubStatus = { live: true, bpm: 124, info, section: "groove" };
  render(
    <ClubBar
      roomId="room" status={status} nowPlaying={null} djName={null} isDj={options.isDj ?? false} decksFree
      onTakeDecks={() => {}} onLeaveDecks={() => {}} onOpenDecks={() => {}} onOpenLights={() => {}} onRequest={() => {}}
      onCrowd={onCrowd}
    />,
  );
  return onCrowd;
}

it("asks Real DJ for more, and lights the tap while it counts", () => {
  const onCrowd = bar({ mode: "real" });
  expect(screen.getByText(/Cheer together/)).toBeTruthy();
  fireEvent.click(screen.getByText(/More/));
  expect(onCrowd).toHaveBeenCalledWith("more");
  expect(screen.getByText(/More/).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText(/Chill/).getAttribute("aria-pressed")).toBe("false");
});

it("says when the DJ heard the crowd", () => {
  bar({ mode: "real", crowd: { more: 2, chill: 0, said: "up" } });
  expect(screen.getByText("The DJ heard you: turning it up")).toBeTruthy();
});

it("shows a DJ at the decks what the crowd wants, with no buttons of their own", () => {
  bar({ mode: "hands", crowd: { more: 2, chill: 1, said: null } }, { isDj: true });
  expect(screen.queryByText(/More$/)).toBeNull();
  expect(screen.getByText("The crowd: 2 want more · 1 wants it chill")).toBeTruthy();
});

it("leaves Auto DJ's queue to itself", () => {
  bar({ mode: "auto" });
  expect(screen.queryByRole("group", { name: "Tell the DJ" })).toBeNull();
});

it("puts the crowd in a line", () => {
  expect(crowdLine(null)).toBeNull();
  expect(crowdLine({ more: 0, chill: 0, said: null })).toBeNull();
  expect(crowdLine({ more: 1, chill: 3, said: null })).toBe("The crowd: 1 wants more · 3 want it chill");
  expect(crowdLine({ more: 4, chill: 0, said: "drop" })).toBe("The crowd cheered: here comes the drop");
  expect(crowdLine({ more: 0, chill: 2, said: "down" })).toBe("The DJ heard you: taking it down");
});
