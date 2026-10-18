// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  describe("with open signup on", () => {
    it("opens on Create account with no invite field and an Invite code tab", () => {
      setUrl("https://chat.hoffle.online/hangout");
      render(<AuthGate bootstrap={false} openSignup onSignedIn={vi.fn()} />);

      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Create your account");
      expect(screen.queryByLabelText("Invite code")).toBeNull();
      expect(screen.getByRole("tab", { name: "Create account" }).getAttribute("aria-selected")).toBe("true");

      fireEvent.click(screen.getByRole("tab", { name: "Invite code" }));
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Join with an invite");
      expect(screen.getByLabelText("Invite code")).toBeTruthy();

      fireEvent.click(screen.getByRole("tab", { name: "Sign in" }));
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Sign in");
    });

    it("an invite link still lands on the Invite code tab with the code filled in", () => {
      setUrl("https://chat.hoffle.online/hangout?invite=welcome123");
      render(<AuthGate bootstrap={false} openSignup onSignedIn={vi.fn()} />);

      expect(screen.getByRole("tab", { name: "Invite code" }).getAttribute("aria-selected")).toBe("true");
      expect((screen.getByLabelText("Invite code") as HTMLInputElement).value).toBe("WELCOME123");
    });

    it("sends no code from Create account", async () => {
      const { apiFetch } = await import("@/app/lib/client");
      setUrl("https://chat.hoffle.online/hangout");
      render(<AuthGate bootstrap={false} openSignup onSignedIn={vi.fn()} />);

      fireEvent.change(screen.getByLabelText("Username"), { target: { value: "newbie" } });
      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-enough-pw" } });
      const create = screen.getByRole("button", { name: "Create my account" }) as HTMLButtonElement;
      expect(create.disabled).toBe(true);
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(create);

      const call = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/api/auth/signup");
      expect(call).toBeTruthy();
      expect(JSON.parse(String((call![1] as { body: string }).body)).invite).toBe("");
    });
  });
});
