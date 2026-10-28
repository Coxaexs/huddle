// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { computeGrowth } from "@/lib/admin-growth";
import { expectNoA11yViolations } from "./a11y";

const growth = computeGrowth(
  {
    users: [
      { id: "a", created_at: "2026-10-05T10:00:00Z", signup_source: "invite" },
      { id: "b", created_at: "2026-10-20T10:00:00Z", signup_source: "open" },
    ],
    activeDays: [
      { user_id: "a", day: "2026-10-05" },
      { user_id: "a", day: "2026-10-06" },
      { user_id: "a", day: "2026-10-21" },
      { user_id: "b", day: "2026-10-20" },
    ],
    postingDays: [{ user_id: "a", day: "2026-10-21" }],
    voiceUsers: ["a"],
    friendUsers: [],
    inviters: [],
  },
  new Date("2026-10-21T12:00:00Z"),
);

vi.mock("@/app/lib/client", () => ({ apiFetch: vi.fn(async () => growth), basePath: "/hangout" }));
vi.mock("../app/lib/client", () => ({ apiFetch: vi.fn(async () => growth), basePath: "/hangout" }));

const { GrowthTab } = await import("@/app/admin/growth-tab");

afterEach(cleanup);

describe("GrowthTab", () => {
  it("shows actives, the funnel and the cohort table", async () => {
    const { container } = render(<GrowthTab />);
    expect(await screen.findByText("Active this week")).toBeTruthy();
    expect(screen.getByText("Came back another day")).toBeTruthy();
    expect(screen.getByText(/Invite link/)).toBeTruthy();
    // b signed up yesterday: too soon for a first-week rate.
    expect(screen.getAllByText("too soon").length).toBeGreaterThan(0);
    // a's week: came back the next day, 1 of 1.
    expect(screen.getAllByTitle("1 of 1").length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
