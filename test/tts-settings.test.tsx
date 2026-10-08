// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TtsSettings } from "@/app/components/chat/tts-settings";
import { getTtsVoice, ttsPlaybackEnabled } from "@/app/lib/tts/client";
import { expectNoA11yViolations } from "./a11y";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

describe("TtsSettings", () => {
  it("saves tempo, pitch and effect as you change them", () => {
    render(<TtsSettings />);
    fireEvent.change(screen.getByLabelText(/Tempo/), { target: { value: "0.8" } });
    fireEvent.change(screen.getByLabelText(/Pitch/), { target: { value: "0.9" } });
    fireEvent.change(screen.getByLabelText("Effect"), { target: { value: "robot" } });
    expect(getTtsVoice()).toEqual({ tempo: 0.8, pitch: 0.9, effect: "robot" });
    expect(screen.getByText(/0.80× · slower/)).toBeTruthy();
    expect(screen.getByText(/0.90× · deeper/)).toBeTruthy();
  });

  it("turns hearing /tts messages off and on", () => {
    render(<TtsSettings />);
    const box = screen.getByLabelText(/Read \/tts messages aloud/) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(ttsPlaybackEnabled()).toBe(false);
    fireEvent.click(box);
    expect(ttsPlaybackEnabled()).toBe(true);
  });

  it("resets to the normal voice", () => {
    render(<TtsSettings />);
    fireEvent.change(screen.getByLabelText("Effect"), { target: { value: "robot" } });
    fireEvent.click(screen.getByText("Reset to the normal voice"));
    expect(getTtsVoice()).toEqual({ tempo: 1, pitch: 1, effect: "none" });
  });

  it("switches the preview sentence with the language", () => {
    render(<TtsSettings />);
    fireEvent.change(screen.getByLabelText("Preview language"), { target: { value: "tr" } });
    expect((screen.getByLabelText("Preview text") as HTMLInputElement).value).toMatch(/Merhaba/);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<TtsSettings />);
    await expectNoA11yViolations(container);
  });
});
