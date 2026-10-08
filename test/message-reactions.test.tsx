// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MessageReactions } from "@/app/components/chat/message-reactions";
import { expectNoA11yViolations } from "./a11y";

afterEach(cleanup);

const reactions = [
  { emoji: "👍", count: 2, mine: true, users: [{ id: "u1", username: "a", displayName: "Alice", avatar: "A", color: "#000" }] },
  { emoji: ":partyparrot:", count: 1, mine: false },
];

function view(props: Partial<React.ComponentProps<typeof MessageReactions>> = {}) {
  const all = {
    reactions,
    emojiMap: { partyparrot: "https://cdn.example/parrot.gif" },
    viewerEmoji: null,
    pickerOpen: false,
    onToggle: vi.fn(),
    onOpenViewer: vi.fn(),
    onOpenPicker: vi.fn(),
    ...props,
  };
  return { ...render(<MessageReactions {...all} />), ...all };
}

describe("MessageReactions", () => {
  it("shows counts, marks yours, and draws custom emoji as images", () => {
    const { container } = view();
    const pills = container.querySelectorAll(".outline-reaction-pill");
    expect(pills).toHaveLength(2);
    expect(pills[0].className).toContain("mine");
    expect(pills[0].getAttribute("title")).toBe("Alice reacted with 👍");
    expect(pills[1].querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/parrot.gif");
  });

  it("toggles on click and opens who-reacted on right-click", () => {
    const { container, onToggle, onOpenViewer } = view();
    const pill = container.querySelectorAll(".outline-reaction-pill")[0];
    fireEvent.click(pill);
    expect(onToggle).toHaveBeenCalledWith("👍");
    fireEvent.contextMenu(pill);
    expect(onOpenViewer).toHaveBeenCalledWith(expect.anything(), "👍");
  });

  it("marks the pill whose viewer is open, and the add button while picking", () => {
    const { container } = view({ viewerEmoji: "👍", pickerOpen: true });
    expect(container.querySelectorAll(".outline-reaction-pill")[0].className).toContain("viewer-open");
    expect(container.querySelector(".add-reaction-btn")?.className).toContain("mine");
  });

  it("opens the picker to react, or with shift to add a quick reaction", () => {
    const { onOpenPicker } = view();
    const add = screen.getByTitle(/Add reaction/);
    fireEvent.click(add);
    expect(onOpenPicker).toHaveBeenLastCalledWith(expect.anything(), "react");
    fireEvent.click(add, { shiftKey: true });
    expect(onOpenPicker).toHaveBeenLastCalledWith(expect.anything(), "addToQuickReactions");
  });

  it("has no accessibility violations", async () => {
    const { container } = view();
    await expectNoA11yViolations(container);
  });
});
