// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BlahajBuddy } from "@/app/components/blahaj-buddy";
import { expectNoA11yViolations } from "./a11y";

beforeEach(() => {
  document.documentElement.dataset.blahaj = "on";
  document.documentElement.dataset.customThemeId = "cozy";
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-blahaj");
  document.documentElement.removeAttribute("data-custom-theme-id");
  window.localStorage.clear();
});

describe("BlahajBuddy (Desktop Companion)", () => {
  it("renders the default Blåhaj shark on cozy theme", () => {
    render(<BlahajBuddy />);
    const btn = screen.getByRole("button", { name: /Boop Blåhaj/i });
    expect(btn).toBeTruthy();
    expect(document.querySelector(".blahaj-svg")).toBeTruthy();
  });

  it("adapts companion identity to Vampire theme (Vlad the Bat)", () => {
    document.documentElement.dataset.customThemeId = "vampire";
    render(<BlahajBuddy />);
    const btn = screen.getByRole("button", { name: /Boop Vlad/i });
    expect(btn).toBeTruthy();
    expect(document.querySelector(".bat-svg")).toBeTruthy();
  });

  it("adapts companion identity to Matrix theme (Unit-01)", () => {
    document.documentElement.dataset.customThemeId = "matrix";
    render(<BlahajBuddy />);
    const btn = screen.getByRole("button", { name: /Boop Unit-01/i });
    expect(btn).toBeTruthy();
    expect(document.querySelector(".matrix-svg")).toBeTruthy();
  });

  it("adapts companion identity to Dark Academia theme (Archimedes)", () => {
    document.documentElement.dataset.customThemeId = "dark-academia";
    render(<BlahajBuddy />);
    const btn = screen.getByRole("button", { name: /Boop Archimedes/i });
    expect(btn).toBeTruthy();
    expect(document.querySelector(".owl-svg")).toBeTruthy();
  });

  it("adapts companion identity to MSN theme (Clippy the Paperclip)", () => {
    document.documentElement.dataset.customThemeId = "msn";
    render(<BlahajBuddy />);
    const btn = screen.getByRole("button", { name: /Boop Clippy/i });
    expect(btn).toBeTruthy();
    expect(document.querySelector(".clippy-svg")).toBeTruthy();
  });

  it("opens popover with talk, focus timer, and tools tabs on click", () => {
    render(<BlahajBuddy />);
    const avatarBtn = screen.getByRole("button", { name: /Boop Blåhaj/i });
    fireEvent.click(avatarBtn);

    // Popover dialog opened
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Talk")).toBeTruthy();
    expect(screen.getByText("Focus")).toBeTruthy();
    expect(screen.getByText("Tools")).toBeTruthy();
  });

  it("boops companion, increases affection count, and cycles thoughts", () => {
    render(<BlahajBuddy />);
    fireEvent.click(screen.getByRole("button", { name: /drag to reposition/i }));

    const boopBtn = screen.getByRole("button", { name: /^Boop Blåhaj$/i });
    fireEvent.click(boopBtn);

    expect(screen.getByText(/1 boop/i)).toBeTruthy();
  });

  it("switches to focus timer tab and switches presets", () => {
    render(<BlahajBuddy />);
    fireEvent.click(screen.getByRole("button", { name: /Boop Blåhaj/i }));

    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    expect(screen.getByText("25:00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "5m Rest" }));
    expect(screen.getByText("05:00")).toBeTruthy();
  });

  it("switches to tools tab and provides dice rolling and scratchpad memo", () => {
    render(<BlahajBuddy />);
    fireEvent.click(screen.getByRole("button", { name: /Boop Blåhaj/i }));

    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    expect(screen.getByText(/Dice & Decision/i)).toBeTruthy();
    expect(screen.getByText(/Quick Scratchpad/i)).toBeTruthy();

    const d20Btn = screen.getByRole("button", { name: /Roll d20/i });
    fireEvent.click(d20Btn);

    const memoInput = screen.getByPlaceholderText(/Jot room codes/i);
    fireEvent.change(memoInput, { target: { value: "huddle-secret-room-123" } });
    expect(window.localStorage.getItem("huddle-buddy-memo")).toBe("huddle-secret-room-123");
  });

  it("invokes /roll command when rolling dice or submitting custom notation", () => {
    const onRollCommand = vi.fn();
    render(<BlahajBuddy onRollCommand={onRollCommand} />);
    fireEvent.click(screen.getByRole("button", { name: /Boop Blåhaj/i }));
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));

    // Roll d20
    const d20Btn = screen.getByRole("button", { name: /Roll d20/i });
    fireEvent.click(d20Btn);
    expect(onRollCommand).toHaveBeenCalledWith("/roll 1d20");

    // Settle roll
    fireEvent(
      window,
      new CustomEvent("huddle-dice-rolled", {
        detail: { expression: "1d20", total: 17 },
      }),
    );
    expect(screen.getByText("17")).toBeTruthy();

    // Roll d6
    const d6Btn = screen.getByRole("button", { name: /Roll d6/i });
    fireEvent.click(d6Btn);
    expect(onRollCommand).toHaveBeenCalledWith("/roll 1d6");

    // Settle roll
    fireEvent(
      window,
      new CustomEvent("huddle-dice-rolled", {
        detail: { expression: "1d6", total: 4 },
      }),
    );
    expect(screen.getByText("4")).toBeTruthy();

    // Roll d100
    const d100Btn = screen.getByRole("button", { name: /Roll d100/i });
    fireEvent.click(d100Btn);
    expect(onRollCommand).toHaveBeenCalledWith("/roll 1d100");

    // Settle roll
    fireEvent(
      window,
      new CustomEvent("huddle-dice-rolled", {
        detail: { expression: "1d100", total: 88 },
      }),
    );
    expect(screen.getByText("88")).toBeTruthy();

    // Custom notation input
    const input = screen.getByLabelText(/Custom dice expression/i);
    fireEvent.change(input, { target: { value: "2d6+3" } });
    const submitBtn = screen.getByRole("button", { name: /Submit custom roll/i });
    fireEvent.click(submitBtn);
    expect(onRollCommand).toHaveBeenCalledWith("/roll 2d6+3");

    // Settle custom roll
    fireEvent(
      window,
      new CustomEvent("huddle-dice-rolled", {
        detail: { expression: "2d6+3", total: 11 },
      }),
    );
    expect(screen.getByText("11")).toBeTruthy();

    // Flip coin
    const flipBtn = screen.getByRole("button", { name: /Flip Coin/i });
    fireEvent.click(flipBtn);
    expect(onRollCommand).toHaveBeenCalledWith("/flip");
  });

  it("closes popover when [X] button is clicked", () => {
    render(<BlahajBuddy />);
    fireEvent.click(screen.getByRole("button", { name: /Boop Blåhaj/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    const closeBtn = screen.getByRole("button", { name: /Close dialog/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("allows putting companion to sleep and waking back up", () => {
    render(<BlahajBuddy />);
    fireEvent.click(screen.getByRole("button", { name: /Boop Blåhaj/i }));

    const sleepBtn = screen.getByRole("button", { name: /Put Blåhaj to sleep/i });
    fireEvent.click(sleepBtn);

    // Companion turned off
    expect(document.documentElement.dataset.blahaj).toBe("off");
    expect(window.localStorage.getItem("huddle-blahaj")).toBe("off");

    // Sleep dock wake pill is visible
    const wakeBtn = screen.getByRole("button", { name: /Wake up Blåhaj/i });
    expect(wakeBtn).toBeTruthy();

    // Click wake
    fireEvent.click(wakeBtn);
    expect(document.documentElement.dataset.blahaj).toBe("on");
    expect(window.localStorage.getItem("huddle-blahaj")).toBe("on");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<BlahajBuddy />);
    await expectNoA11yViolations(container);
  });
});
