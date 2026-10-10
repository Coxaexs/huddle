// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AuthGate } from "@/app/components/auth-gate";

vi.mock("@/app/lib/client", () => ({
  apiFetch: vi.fn().mockResolvedValue({ valid: true }),
}));

describe("AuthGate invite link autofill", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    (window as any).location = originalLocation;
  });

  function setUrl(url: string) {
    const parsed = new URL(url);
    delete (window as any).location;
    (window as any).location = {
      ...parsed,
      search: parsed.search,
      href: parsed.href,
      origin: parsed.origin,
      pathname: parsed.pathname,
    };
  }

  it("automatically opens in signup mode with invite prefilled from ?invite= parameter", async () => {
    setUrl("https://chat.hoffle.online/hangout?invite=welcome123");
    render(<AuthGate bootstrap={false} onSignedIn={vi.fn()} />);

    // Heading should be signup mode ("Join with an invite")
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Join with an invite");

    // Invite code input should be prefilled
    const inviteInput = screen.getByLabelText("Invite code") as HTMLInputElement;
    expect(inviteInput.value).toBe("WELCOME123");
  });

  it("automatically opens in signup mode with invite prefilled from ?code= parameter", async () => {
    setUrl("https://chat.hoffle.online/hangout?code=testcode456");
    render(<AuthGate bootstrap={false} onSignedIn={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Join with an invite");
    const inviteInput = screen.getByLabelText("Invite code") as HTMLInputElement;
    expect(inviteInput.value).toBe("TESTCODE456");
  });

  it("automatically opens in signup mode with invite prefilled from bare ?CODE query string", async () => {
    setUrl("https://chat.hoffle.online/hangout?HX3F-9K2Q");
    render(<AuthGate bootstrap={false} onSignedIn={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Join with an invite");
    const inviteInput = screen.getByLabelText("Invite code") as HTMLInputElement;
    expect(inviteInput.value).toBe("HX3F-9K2Q");
  });

  it("defaults to signin mode with empty invite when no invite parameter is present", async () => {
    setUrl("https://chat.hoffle.online/hangout");
    render(<AuthGate bootstrap={false} onSignedIn={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Sign in");
    expect(screen.queryByLabelText("Invite code")).toBeNull();
  });
});
