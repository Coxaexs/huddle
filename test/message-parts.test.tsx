// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MessageEditor, MUSIC_CARD_KINDS, MusicPayloadCard } from "@/app/components/chat/message-parts";

afterEach(cleanup);

describe("MessageEditor", () => {
  function editor() {
    const props = { value: "hello", onChange: vi.fn(), onCancel: vi.fn(), onSave: vi.fn() };
    const view = render(<MessageEditor {...props} />);
    return { ...props, textarea: view.container.querySelector("textarea")! };
  }

  it("edits, saves on Enter, keeps Shift+Enter, cancels on Escape", () => {
    const { textarea, onChange, onSave, onCancel } = editor();
    expect(textarea.value).toBe("hello");
    fireEvent.change(textarea, { target: { value: "hello there" } });
    expect(onChange).toHaveBeenCalledWith("hello there");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("MusicPayloadCard", () => {
  const payloads: Record<string, Record<string, unknown>> = {
    "music-settings": { voiceChannelId: "voice-1", autoplay: false, automix: false },
    "music-stats": { voiceChannelId: "voice-1", label: "This week", plays: 3, unique: 2, hours: 1, topSongs: [], topRequesters: [] },
    "music-queue": { voiceChannelId: "voice-1", queue: [], totalTracks: 0 },
    "music-history": { voiceChannelId: "voice-1", history: [] },
    "music-search": { voiceChannelId: "voice-1", query: "lofi", track: { title: "Lofi Beats", artist: "Chill", duration: 180 } },
  };

  it("draws a card for every music kind", () => {
    expect([...MUSIC_CARD_KINDS].sort()).toEqual(Object.keys(payloads).sort());
    for (const kind of MUSIC_CARD_KINDS) {
      const { container } = render(<MusicPayloadCard kind={kind} payload={payloads[kind] as never} onCommand={vi.fn(async () => {})} />);
      expect(container.firstChild, kind).toBeTruthy();
      cleanup();
    }
  });

  it("draws nothing for other kinds", () => {
    const { container } = render(<MusicPayloadCard kind="ai" payload={{} as never} onCommand={vi.fn(async () => {})} />);
    expect(container.firstChild).toBeNull();
  });

  it("passes its buttons' commands through", () => {
    const onCommand = vi.fn(async () => {});
    const { container } = render(<MusicPayloadCard kind="music-history" payload={{ voiceChannelId: "voice-1", history: [{ title: "Song A", query: "song a" }] } as never} onCommand={onCommand} />);
    const button = container.querySelector("button:not([disabled])");
    if (button) {
      fireEvent.click(button);
      expect(onCommand).toHaveBeenCalled();
    }
  });
});
