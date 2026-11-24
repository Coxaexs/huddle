// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DndLandingPage } from "@/app/components/dnd-landing-page";
import { expectNoA11yViolations } from "./a11y";

afterEach(cleanup);

describe("DndLandingPage", () => {
  it("renders the English D&D landing page cleanly with zero axe violations", async () => {
    const { container } = render(<DndLandingPage lang="en" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/voice chat/i);
    const ctas = screen.getAllByRole("link", { name: "Open Hoffle" });
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    expect(ctas[0].getAttribute("href")).toBe("https://chat.hoffle.online");
    await expectNoA11yViolations(container);
  });

  it("renders the Turkish D&D landing page cleanly with zero axe violations", async () => {
    const { container } = render(<DndLandingPage lang="tr" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/D&D/i);
    const ctas = screen.getAllByRole("link", { name: "Hoffle'ı Aç" });
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    expect(ctas[0].getAttribute("href")).toBe("https://chat.hoffle.online");
    await expectNoA11yViolations(container);
  });
});
