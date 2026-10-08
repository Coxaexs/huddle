// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MiniVoiceBar } from "@/app/components/chat/mini-voice-bar";
import { expectNoA11yViolations } from "./a11y";

afterEach(cleanup);

/** Just the parts of the voice hook the bar reads. */
function fakeVoice(overrides: Record<string, unknown> = {}) {
  return {
    channelId: "kitchen-table",
    screenSharing: false,
    screenQuality: "1080p30",
    screenShareAudio: true,
    screenFilm: false,
    cameraOn: false,
    leave: vi.fn(),
    startCamera: vi.fn(),
    stopCamera: vi.fn(),
    stopScreenShare: vi.fn(),
    startScreenShare: vi.fn(),
    setScreenQuality: vi.fn(),
    setScreenFilm: vi.fn(),
    setScreenShareAudio: vi.fn(),
    ...overrides,
  } as unknown as React.ComponentProps<typeof MiniVoiceBar>["voice"];
}

function bar(props: Partial<React.ComponentProps<typeof MiniVoiceBar>> = {}) {
  const handlers = {
    setQuickSoundboardOpen: vi.fn(),
    setSidebarShareSetupOpen: vi.fn(),
    setStageChannelId: vi.fn(),
  };
  const view = render(
    <MiniVoiceBar
      voice={fakeVoice()}
      roomName="Kitchen Table"
      soundboardServerId="hangout"
      quickSoundboardOpen={false}
      sidebarShareSetupOpen={false}
      {...handlers}
      {...props}
    />,
  );
  return { ...view, ...handlers };
}

describe("MiniVoiceBar", () => {
  it("names the room and says it is connected", () => {
    bar();
    expect(screen.getByText("Kitchen Table")).toBeTruthy();
    expect(screen.getByText("voice connected")).toBeTruthy();
  });

  it("opens the room's stage when its name is clicked", () => {
    const { setStageChannelId } = bar();
    fireEvent.click(screen.getByTitle("Open voice channel"));
    expect(setStageChannelId).toHaveBeenCalledWith("kitchen-table");
  });

  it("toggles the soundboard and marks the button while it is open", () => {
    const { setQuickSoundboardOpen, rerender } = bar();
    fireEvent.click(screen.getByTitle("Soundboard"));
    expect(setQuickSoundboardOpen).toHaveBeenCalledTimes(1);
    rerender(
      <MiniVoiceBar
        voice={fakeVoice()}
        roomName="Kitchen Table"
        soundboardServerId="hangout"
        quickSoundboardOpen
        sidebarShareSetupOpen={false}
        setQuickSoundboardOpen={setQuickSoundboardOpen}
        setSidebarShareSetupOpen={vi.fn()}
        setStageChannelId={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Close soundboard").className).toContain("on");
  });

  it("turns the camera on, or off when it already is", () => {
    const voice = fakeVoice();
    bar({ voice });
    fireEvent.click(screen.getByTitle("Camera"));
    expect(voice.startCamera).toHaveBeenCalled();
    cleanup();
    const live = fakeVoice({ cameraOn: true });
    bar({ voice: live });
    fireEvent.click(screen.getByTitle("Turn camera off"));
    expect(live.stopCamera).toHaveBeenCalled();
  });

  it("stops sharing straight away while a share is live", () => {
    const voice = fakeVoice({ screenSharing: true });
    const { setSidebarShareSetupOpen } = bar({ voice });
    fireEvent.click(screen.getByTitle(/Stop sharing/));
    expect(voice.stopScreenShare).toHaveBeenCalled();
    expect(setSidebarShareSetupOpen).not.toHaveBeenCalled();
  });

  it("leaves the room", () => {
    const voice = fakeVoice();
    bar({ voice });
    fireEvent.click(screen.getByTitle("Disconnect"));
    expect(voice.leave).toHaveBeenCalled();
  });

  it("has no accessibility violations", async () => {
    const { container } = bar();
    await expectNoA11yViolations(container);
  });
});
