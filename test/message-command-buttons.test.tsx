// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { MessageBody } from "@/app/components/message-body";
import { BUTTON_COOLDOWN_MS } from "@/lib/command-buttons";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function view(text: string, onCommand = vi.fn()) {
  const { container } = render(<MessageBody text={text} onCommand={onCommand} />);
  return { container, onCommand, buttons: [...container.querySelectorAll<HTMLButtonElement>(".cmd-button")] };
}

describe("command buttons in MessageBody", () => {
  it("renders a button that runs its command", () => {
    const { buttons, onCommand } = view("Everyone: <button>/roll 1d20</button>");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe("/roll 1d20");
    fireEvent.click(buttons[0]);
    expect(onCommand).toHaveBeenCalledWith("/roll 1d20");
  });

  it("shows the command next to a label, and in the tooltip", () => {
    const { buttons } = view('<button label="Roll for initiative">/roll 1d20+3</button>');
    expect(buttons[0].querySelector(".cmd-button-label")?.textContent).toBe("Roll for initiative");
    expect(buttons[0].querySelector(".cmd-button-cmd")?.textContent).toBe("/roll 1d20+3");
    expect(buttons[0].title).toContain("/roll 1d20+3");
  });

  it("leaves commands that are not allowed as the text that was typed", () => {
    const { container, buttons } = view('<button label="Free loot">/purge 100</button>');
    expect(buttons).toHaveLength(0);
    expect(container.textContent).toBe('<button label="Free loot">/purge 100</button>');
  });

  it("does not render buttons in code or quotes", () => {
    const { buttons, container } = view(
      "`<button>/roll 1d20</button>`\n> <button>/flip</button>\n```\n<button>/8ball</button>\n```",
    );
    expect(buttons).toHaveLength(0);
    expect(container.querySelector("blockquote")?.textContent).toBe("<button>/flip</button>");
    expect(container.querySelector(".inline-code")?.textContent).toBe("<button>/roll 1d20</button>");
  });

  it("renders at most five per message", () => {
    const { buttons, container } = view(Array.from({ length: 7 }, (_, i) => `<button>/roll d${i + 4}</button>`).join(" "));
    expect(buttons).toHaveLength(5);
    expect(container.textContent).toContain("<button>/roll d9</button>");
  });

  it("works inside formatting", () => {
    const { buttons } = view("**Ready? <button>/flip</button>**");
    expect(buttons).toHaveLength(1);
  });

  it("cools down after a press", () => {
    vi.useFakeTimers();
    const { buttons, onCommand } = view("<button>/flip</button>");
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[0]);
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(buttons[0].disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(BUTTON_COOLDOWN_MS);
    });
    expect(buttons[0].disabled).toBe(false);
    fireEvent.click(buttons[0]);
    expect(onCommand).toHaveBeenCalledTimes(2);
  });

  it("is inert where nothing can run it", () => {
    const { container } = render(<MessageBody text="<button>/flip</button>" />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(".cmd-button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].disabled).toBe(true);
  });
});
