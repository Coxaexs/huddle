// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StatusMenu } from "@/app/components/chat/status-menu";
import { PRESENCE } from "@/lib/users";
import { expectNoA11yViolations } from "./a11y";

afterEach(cleanup);

function menu(props: Partial<React.ComponentProps<typeof StatusMenu>> = {}) {
  const all = {
    myStatus: "online" as const,
    myCustomStatus: null,
    savePresence: vi.fn(async () => {}),
    autoIdleRef: { current: true },
    setStatusOpen: vi.fn(),
    msnTheme: false,
    shareListening: false,
    setShareListening: vi.fn(),
    autoReply: null,
    setAutoReply: vi.fn(),
    showCustomPrompt: vi.fn(),
    setSoundsOpen: vi.fn(),
    setPictureOpen: vi.fn(),
    setTodayOpen: vi.fn(),
    setSettingsOpen: vi.fn(),
    ...props,
  };
  return { ...render(<StatusMenu {...all} />), ...all };
}

describe("StatusMenu", () => {
  it("offers every presence status", () => {
    menu();
    for (const key of Object.keys(PRESENCE) as Array<keyof typeof PRESENCE>) {
      expect(screen.getByText(PRESENCE[key].label)).toBeTruthy();
    }
  });

  it("saves a picked status, ends auto-idle and closes", () => {
    const { savePresence, setStatusOpen, autoIdleRef } = menu();
    const busy = (Object.keys(PRESENCE) as Array<keyof typeof PRESENCE>).find((k) => k !== "online")!;
    fireEvent.click(screen.getByText(PRESENCE[busy].label));
    expect(savePresence).toHaveBeenCalledWith({ status: busy });
    expect(autoIdleRef.current).toBe(false);
    expect(setStatusOpen).toHaveBeenCalledWith(false);
  });

  it("shows the Messenger extras only under the MSN theme", () => {
    menu();
    expect(screen.queryByText(/Show what I.m listening to/)).toBeNull();
    cleanup();
    menu({ msnTheme: true });
    expect(screen.getByText(/Show what I.m listening to/)).toBeTruthy();
    expect(screen.getByText("Sounds…")).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    const { container } = menu();
    await expectNoA11yViolations(container);
  });
});
