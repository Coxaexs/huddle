// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CustomDialog, type DialogOptions } from "@/app/components/custom-dialog";

afterEach(cleanup);

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

const cancelButton = () => screen.getByRole("button", { name: "Cancel" });
const confirmButton = () => screen.getByRole("button", { name: "Confirm" });
const closeButton = () => screen.getByRole("button", { name: "Close dialog" });

describe("CustomDialog focus management", () => {
  it("moves focus into the dialog when it opens", async () => {
    open();
    // Without this a keyboard user is still behind the modal, tabbing through
    // the page they cannot see.
    await waitFor(() => expect(document.activeElement).toBe(confirmButton()));
  });

  it("focuses the field for a prompt, selected so typing replaces it", async () => {
    open({ type: "prompt", defaultValue: "old-name" });
    const input = screen.getByRole("textbox");
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect((input as HTMLInputElement).selectionStart).toBe(0);
  });

  it("focuses Cancel rather than Delete for a destructive confirm", async () => {
    open({ isDanger: true, confirmText: "Delete" });
    // Landing on the destructive action means one stray Enter destroys data.
    await waitFor(() => expect(document.activeElement).toBe(cancelButton()));
  });

  it("cycles Tab from the last control back to the first", async () => {
    open();
    await waitFor(() => expect(document.activeElement).toBe(confirmButton()));

    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    // aria-modal promises the rest of the page is unreachable, so the cycle must
    // not escape into it.
    expect(document.activeElement).toBe(closeButton());
  });

  it("cycles Shift+Tab from the first control to the last", async () => {
    open();
    closeButton().focus();

    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirmButton());
  });

  it("pulls focus back in when it has escaped the dialog", async () => {
    open();
    // Simulate focus sitting outside, e.g. after a re-render elsewhere.
    document.body.focus();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(document.activeElement).toBe(closeButton());
  });

  it("returns focus to whatever opened it", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = open();
    await waitFor(() => expect(document.activeElement).not.toBe(opener));

    unmount();
    // Closing must not drop the user back at the top of the document.
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe("CustomDialog keyboard actions", () => {
  it("dismisses on Escape", () => {
    const { onDismiss } = open();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("confirms on Enter with the typed value for a prompt", () => {
    const { onConfirm } = open({ type: "prompt" });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "new-name" } });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith("new-name");
  });

  it("confirms with no value for a plain confirm", () => {
    const { onConfirm } = open();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("does not confirm while an alert is dismissed with Escape", () => {
    const { onConfirm, onDismiss } = open({ type: "alert" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("leaves unrelated keys alone", () => {
    const { onConfirm, onDismiss } = open();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "a" });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("CustomDialog structure", () => {
  it("renders nothing when closed", () => {
    render(
      <CustomDialog options={null} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides the Cancel button for an alert, which has nothing to cancel", () => {
    open({ type: "alert" });
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("hides the decorative icon from assistive tech", () => {
    open();
    // The button's aria-label already says what it does; the icon inside would
    // otherwise be announced as well.
    const icon = closeButton().querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });
});
