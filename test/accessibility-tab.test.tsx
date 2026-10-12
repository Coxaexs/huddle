// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { AccessibilityTab } from "@/app/components/settings/accessibility-tab";
import { expectNoA11yViolations } from "./a11y";

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.style.removeProperty("--chat-font-size");
  delete document.documentElement.dataset.underlineLinks;
  delete document.documentElement.dataset.displayNameStyles;
});

function AccessibilityHarness({ initialSize = 16 }: { initialSize?: number }) {
  const [chatFontSize, setChatFontSize] = useState(initialSize);
  const [alwaysUnderlineLinks, setAlwaysUnderlineLinks] = useState(false);
  const [displayNameStyles, setDisplayNameStyles] = useState(true);
  const [motion, setMotion] = useState(true);

  return (
    <AccessibilityTab
      tab="accessibility"
      avatar="K"
      chatFontSize={chatFontSize}
      displayName="kivu"
      alwaysUnderlineLinks={alwaysUnderlineLinks}
      setChatFontSize={setChatFontSize}
      setAlwaysUnderlineLinks={setAlwaysUnderlineLinks}
      displayNameStyles={displayNameStyles}
      setDisplayNameStyles={setDisplayNameStyles}
      motion={motion}
      setMotion={setMotion}
    />
  );
}

describe("AccessibilityTab", () => {
  it("renders with the default chat font size and preview text", () => {
    render(<AccessibilityHarness />);
    expect(screen.getByTestId("chat-font-size-value").textContent).toBe("16px");
    expect(screen.getByText("what happened to all the beans")).toBeTruthy();
  });

  it("changes font size when slider input changes", () => {
    render(<AccessibilityHarness />);
    const slider = screen.getByLabelText("Chat font size");
    fireEvent.change(slider, { target: { value: "20" } });
    expect(screen.getByTestId("chat-font-size-value").textContent).toBe("20px");
  });

  it("changes font size when clicking preset tick buttons", () => {
    render(<AccessibilityHarness />);
    const button24 = screen.getByRole("button", { name: "24px" });
    fireEvent.click(button24);
    expect(screen.getByTestId("chat-font-size-value").textContent).toBe("24px");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<AccessibilityHarness />);
    await expectNoA11yViolations(container);
  });
});
