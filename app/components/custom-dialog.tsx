"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

export interface DialogOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  maxLength?: number;
  type: "prompt" | "confirm" | "alert";
}

interface CustomDialogProps {
  options: DialogOptions | null;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
  /** Backdrop click, the X or Escape: closes without choosing the cancel button's action. */
  onDismiss?: () => void;
}

/**
 * Selector for the elements Tab may land on inside the dialog.
 *
 * `[tabindex]:not([tabindex="-1"])` is included because custom widgets focus
 * themselves with tabindex="0"; "-1" ones are programmatic targets and must stay
 * out of the cycle. Visibility is not tested: jsdom reports no layout, so any
 * check based on it would make the trap invisible to the test suite.
 */
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Focusable elements inside `container`, in tab order, skipping disabled ones. */
function focusableWithin(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute("disabled") && !element.hasAttribute("hidden"),
  );
}

export function CustomDialog({ options, onConfirm, onCancel, onDismiss }: CustomDialogProps) {
  const dismiss = onDismiss ?? onCancel;
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Unique per instance: two dialogs on the page would otherwise both point at
  // whichever element claimed id="dialog-title" first.
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (options) setInputValue(options.defaultValue || "");
  }, [options]);

  const isOpen = options !== null;

  useEffect(() => {
    if (!isOpen) return;

    // Remember who opened this so focus can go back there on close. Without
    // it, closing a dialog drops a keyboard user at the top of the document.
    const opener = document.activeElement as HTMLElement | null;

    // Initial focus. A destructive confirm deliberately does *not* take focus:
    // landing on "Delete" means one stray Enter destroys something.
    const target = inputRef.current
      ? inputRef.current
      : options?.isDanger
        ? cancelRef.current
        : confirmRef.current;

    // A short delay lets the dialog mount and any CSS transition start, so the
    // browser does not scroll the page trying to reach a not-yet-placed node.
    const timer = setTimeout(() => {
      target?.focus();
      if (inputRef.current) inputRef.current.select();
    }, 50);

    return () => {
      clearTimeout(timer);
      // Only restore when focus is inside the dialog or on the body; stealing it
      // back from wherever the user deliberately moved would be worse.
      const active = document.activeElement;
      const focusEscaped =
        !cardRef.current?.contains(active) && active !== document.body;
      if (!focusEscaped) opener?.focus?.();
    };
  }, [isOpen, options?.isDanger]);

  /**
   * Keyboard handling for the card.
   *
   * Tab is trapped because `aria-modal="true"` promises assistive tech that the
   * rest of the page is inert — letting Tab walk into the page behind the
   * dialog makes that promise a lie.
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!options) return;

      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm(options.type === "prompt" ? inputValue : undefined);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }

      if (event.key !== "Tab") return;

      const cycle = focusableWithin(cardRef.current);
      if (!cycle.length) return;

      const first = cycle[0];
      const last = cycle[cycle.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = Boolean(active && cardRef.current?.contains(active));

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismiss, inputValue, onConfirm, options],
  );

  if (!options) return null;

  return (
    <div className="custom-dialog-backdrop" onClick={dismiss}>
      <div
        ref={cardRef}
        className="custom-dialog-card"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Only reference a description when there is one; a dangling idref is
        // worse than none.
        aria-describedby={options.message ? descriptionId : undefined}
      >
        <div className="custom-dialog-header">
          <h3 id={titleId}>{options.title}</h3>
          <button type="button" className="popup-close-x" onClick={dismiss} aria-label="Close dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {options.message && (
          <div className="custom-dialog-body">
            <p id={descriptionId}>{options.message}</p>
          </div>
        )}

        {options.type === "prompt" && (
          <div className="custom-dialog-input-wrap">
            <input
              ref={inputRef}
              type="text"
              className="custom-dialog-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={options.placeholder || ""}
              maxLength={options.maxLength}
              // The title is already the dialog's label, so the field needs its
              // own for anything reading the form control directly.
              aria-label={options.placeholder || options.title}
            />
          </div>
        )}

        <div className="custom-dialog-actions">
          {options.type !== "alert" && (
            <button
              ref={cancelRef}
              type="button"
              className="custom-dialog-btn secondary"
              onClick={onCancel}
            >
              {options.cancelText || "Cancel"}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={`custom-dialog-btn primary ${options.isDanger ? "danger" : ""}`}
            onClick={() => onConfirm(options.type === "prompt" ? inputValue : undefined)}
          >
            {options.confirmText || (options.type === "confirm" ? "Confirm" : "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}

