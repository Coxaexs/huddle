// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DiscoverPage } from "@/app/components/discover-page";
import type { PublicDiscoverServer } from "@/lib/discover";
import { expectNoA11yViolations } from "./a11y";

afterEach(cleanup);

const SAMPLE_SERVERS: PublicDiscoverServer[] = [
  {
    id: "srv-1",
    name: "Waterdeep Campaign",
    icon: "WC",
    color: "#e67e22",
    iconUrl: null,
    bannerUrl: null,
    description: "Weekly 5e campaign with battlemaps and voice sessions.",
    discoverCategory: "dnd",
    memberCount: 24,
    vanityCode: "WATERDEEP",
    webPublic: true,
    joinUrl: "https://chat.hoffle.online/i/WATERDEEP",
  },
  {
    id: "srv-2",
    name: "Late Night Coders",
    icon: "LC",
    color: "#10b981",
    iconUrl: null,
    bannerUrl: null,
    description: "Pair programming, open-source hacking and TypeScript talk.",
    discoverCategory: "tech",
    memberCount: 42,
    vanityCode: null,
    webPublic: false,
    joinUrl: "https://chat.hoffle.online/?discover=srv-2",
  },
];

describe("DiscoverPage", () => {
  it("renders English public server directory, filters by category and search, and passes axe", async () => {
    const { container } = render(
      <DiscoverPage lang="en" initialServers={SAMPLE_SERVERS} fetchOnMount={false} />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Find your next hangout/i);
    expect(screen.getByText("Waterdeep Campaign")).toBeTruthy();
    expect(screen.getByText("Late Night Coders")).toBeTruthy();

    // Category filter works cleanly
    fireEvent.click(screen.getByRole("button", { name: "D&D & Tabletop" }));
    expect(screen.getByText("Waterdeep Campaign")).toBeTruthy();
    expect(screen.queryByText("Late Night Coders")).toBeNull();

    // Reset filter and search by keyword
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Search public servers"), {
      target: { value: "typescript" },
    });
    expect(screen.queryByText("Waterdeep Campaign")).toBeNull();
    expect(screen.getByText("Late Night Coders")).toBeTruthy();

    await expectNoA11yViolations(container);
  });

  it("renders Turkish public server directory cleanly with zero axe violations", async () => {
    const { container } = render(
      <DiscoverPage lang="tr" initialServers={SAMPLE_SERVERS} fetchOnMount={false} />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/topluluğunu bul/i);
    expect(screen.getByText("Waterdeep Campaign")).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});
