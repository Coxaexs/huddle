// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StreamPreviewPopover, formatStreamDuration } from "@/app/components/chat/stream-preview-popover";
import { TileVideo } from "@/app/components/voice-stage/tiles";
import { STREAM_PREVIEW_EVENT, getStreamPreview, pruneStreamPreviews } from "@/app/lib/stream-preview";
import type { VideoTile } from "@/app/components/voice-stage/types";

afterEach(() => {
  cleanup();
  pruneStreamPreviews(new Set());
});

const anchor = { top: 100, left: 20, right: 220, bottom: 133, width: 200, height: 33 } as DOMRect;

function card(props: Partial<React.ComponentProps<typeof StreamPreviewPopover>> = {}) {
  const handlers = { send: vi.fn(), onWatchStream: vi.fn(), onKeep: vi.fn(), onClose: vi.fn() };
  render(
    <StreamPreviewPopover
      kind="screen"
      connectionId="seat-1"
      streamerName="Mara"
      startedAt={1_000_000}
      hubNow={() => 1_000_000 + 754_000}
      anchorRect={anchor}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("Streaming Now card", () => {
  it("asks the hub for the streamer's frame and shows how long they have been live", () => {
    const { send } = card();
    expect(send).toHaveBeenCalledWith({ t: "stream-preview-get", connectionId: "seat-1" });
    expect(screen.getByText("12:34")).toBeTruthy();
    expect(screen.getByText("Mara's screen")).toBeTruthy();
  });

  it("shows the frame and window title the hub sends back", () => {
    card({ connectionId: "seat-2" });
    act(() => {
      window.dispatchEvent(new CustomEvent(STREAM_PREVIEW_EVENT, {
        detail: { connectionId: "seat-2", image: "data:image/jpeg;base64,AAAA", title: "Valheim", at: 1 },
      }));
    });
    expect(screen.getByText("Valheim")).toBeTruthy();
    expect((screen.getByAltText("Mara's stream preview") as HTMLImageElement).src).toContain("data:image/jpeg");
    expect(getStreamPreview("seat-2")?.title).toBe("Valheim");
  });

  it("stays open while the pointer is on it, so its button can be clicked", () => {
    const { onKeep, onWatchStream, onClose } = card();
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseEnter(dialog);
    expect(onKeep).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Watch Stream"));
    expect(onWatchStream).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("describes a watch party by its film", () => {
    card({ kind: "watch", connectionId: undefined, streamerName: "Watch party", title: "Brooklyn Nine-Nine S1E20" });
    expect(screen.getByText("Brooklyn Nine-Nine S1E20")).toBeTruthy();
    expect(screen.getByText("Join Watch Party")).toBeTruthy();
  });

  it("formats durations", () => {
    expect(formatStreamDuration(65_000)).toBe("1:05");
    expect(formatStreamDuration(3_725_000)).toBe("1:02:05");
  });
});

describe("tune-in prompt", () => {
  const screenTile: VideoTile = {
    key: "seat-1:stream-a", label: "Mara · screen", self: false, mirrored: false, connecting: false,
    remoteId: "seat-1", videoKind: "screen", hidden: true,
  };

  it("asks before showing a screen share, over its preview frame", () => {
    const onTuneIn = vi.fn();
    const { container } = render(<TileVideo tile={screenTile} needsTuneIn onTuneIn={onTuneIn} preview="data:image/jpeg;base64,AAAA" />);
    expect(screen.getByText("Do you want to see Mara's screen share?")).toBeTruthy();
    expect(container.querySelector("img.stream-tunein-preview")).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
    fireEvent.click(screen.getByText("Go Ahead"));
    expect(onTuneIn).toHaveBeenCalledWith(screenTile);
  });

  it("keeps the Show button on a share the viewer hid", () => {
    const onHide = vi.fn();
    render(<TileVideo tile={screenTile} onHide={onHide} />);
    expect(screen.getByText("Screen share hidden")).toBeTruthy();
    fireEvent.click(screen.getByText("Show"));
    expect(onHide).toHaveBeenCalledWith(screenTile, false);
  });

  it("asks before loading a watch party film", () => {
    const tile: VideoTile = {
      key: "watch:https://example.com/a.mp4", watchUrl: "https://example.com/a.mp4", watchTitle: "Film A",
      label: "Film A · watch party", self: false, mirrored: false, connecting: false, videoKind: "watch",
    };
    const { container } = render(<TileVideo tile={tile} needsTuneIn onTuneIn={vi.fn()} />);
    expect(screen.getByText("Do you want to watch Film A?")).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
  });
});
