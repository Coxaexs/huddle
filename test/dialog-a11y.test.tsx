// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CustomDialog, type DialogOptions } from "@/app/components/custom-dialog";
import { expectNoA11yViolations } from "./a11y";

afterEach(cleanup);

/** Renders the dialog with sane callbacks, returning the spies. */
function open(options: Partial<DialogOptions> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const onDismiss = vi.fn();
  const view = render(
    <CustomDialog
      options={{ title: "Rename channel", type: "confirm", ...options }}
      onConfirm={onConfirm}
      onCancel={onCancel}
      onDismiss={onDismiss}
    />,
  );
  return { ...view, onConfirm, onCancel, onDismiss };
}

describe("CustomDialog accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = open({ message: "This cannot be undone." });
    await expectNoA11yViolations(container);
  });

  it("has no axe violations as a prompt with a field", async () => {
    const { container } = open({ type: "prompt", placeholder: "New name" });
    await expectNoA11yViolations(container);
  });

  it("labels the dialog by its title and describes it with its message", () => {
    open({ message: "This cannot be undone." });
    const dialog = screen.getByRole("dialog");

    const titleId = dialog.getAttribute("aria-labelledby");
    const descriptionId = dialog.getAttribute("aria-describedby");
    expect(titleId).toBeTruthy();
    expect(descriptionId).toBeTruthy();

    // The ids must actually resolve, or assistive tech announces nothing.
    expect(document.getElementById(titleId!)).toBeTruthy();
    expect(document.getElementById(descriptionId!)?.textContent).toBe(
      "This cannot be undone.",
    );
  });

  it("omits the description reference when there is no message", () => {
    open({ message: undefined });
    // A dangling idref is worse than no idref.
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBeNull();
  });

  it("gives each instance its own ids", () => {
    const first = render(
      <CustomDialog options={{ title: "One", type: "alert" }} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    const second = render(
      <CustomDialog options={{ title: "Two", type: "alert" }} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    const ids = screen
      .getAllByRole("dialog")
      .map((dialog) => dialog.getAttribute("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);

    first.unmount();
    second.unmount();
  });

  it("marks itself modal", () => {
    open();
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  });
});
