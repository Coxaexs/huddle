"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { LOCALES, type Locale } from "@/lib/i18n";
import { useI18n } from "../lib/i18n-context";

export interface LanguagePickerProps {
  /** Extra classes for the wrapper, so a caller can fit it into its own row. */
  className?: string;
  /** Overrides the accessible name; defaults to the translated "Language". */
  label?: string;
}

/**
 * The picker is a listbox, not a row of buttons.
 *
 * A dropdown of six languages could be six real `<button>`s, but then every
 * option is a Tab stop (six presses to get past one setting), and "which one is
 * current" has to be rebuilt out of `aria-pressed`. The ARIA listbox pattern is
 * the honest model for "choose one of these": a real `<button>` trigger, a real
 * `<ul>` with `role="listbox"`, one tab stop, arrow keys to move, Enter to pick.
 * The options are `<li role="option">` rather than buttons because an element
 * with `role="option"` must not also carry button semantics; the interaction is
 * handled at the listbox level, which is what screen readers expect here.
 */
export function LanguagePicker({ className, label }: LanguagePickerProps) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rawId = useId();
  // `useId` is what keeps the server and client markup agreeing; the rest of the
  // id is sanitized so it stays readable in devtools and safe in a URL fragment.
  const listId = `hoffle-language-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const accessibleName = label ?? t("settings.language");

  // A locale that is somehow not in the list must not produce index -1 and an
  // undefined render; English is the fallback position.
  const selectedIndex = Math.max(
    0,
    LOCALES.findIndex((entry) => entry.code === locale),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  function openList(focusIndex: number) {
    setActiveIndex(focusIndex);
    setOpen(true);
  }

  function closeList(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(code: Locale) {
    // `setLocale` persists and re-renders through the provider, so nothing local
    // has to track the selection.
    setLocale(code);
    closeList(true);
  }

  useEffect(() => {
    if (!open) return;
    // Moving focus onto the listbox is what lets `aria-activedescendant` announce
    // each option as the arrow keys move: the active descendant pattern keeps one
    // focus owner (the list) instead of moving focus between options.
    listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Keep the active option in view when it is driven by the keyboard; a six
    // item list rarely scrolls, but a longer one must not lose the cursor.
    const active = document.getElementById(optionId(listId, LOCALES[activeIndex].code));
    active?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, listId]);

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // Enter and Space already toggle via the button's own activation; the arrow
    // keys are the ones the button does not handle, and they should land on the
    // current selection rather than at the top of the list.
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openList(selectedIndex);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, LOCALES.length - 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        return;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        return;
      case "End":
        event.preventDefault();
        setActiveIndex(LOCALES.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(LOCALES[activeIndex].code);
        return;
      case "Escape":
        event.preventDefault();
        closeList(true);
        return;
      case "Tab":
        // Tabbing out is a normal way to leave: close, but let focus continue
        // where the user was sending it instead of trapping them.
        setOpen(false);
        return;
      default:
        return;
    }
  }

  return (
    <div
      ref={rootRef}
      className={className ? `language-picker ${className}` : "language-picker"}
      data-open={open ? "true" : "false"}
    >
      <button
        ref={triggerRef}
        type="button"
        className="language-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        // The visible text is an endonym, which is not a sentence: a screen
        // reader needs "Language: Español", not a bare "Español" out of context.
        aria-label={`${accessibleName}: ${LOCALES[selectedIndex].name}`}
        onClick={() => {
          if (open) closeList(false);
          else openList(selectedIndex);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <Globe size={16} aria-hidden="true" />
        <span className="language-picker-value">{LOCALES[selectedIndex].name}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          className="language-picker-list"
          aria-label={accessibleName}
          aria-activedescendant={optionId(listId, LOCALES[activeIndex].code)}
          onKeyDown={onListKeyDown}
        >
          {LOCALES.map((entry, index) => (
            <li
              key={entry.code}
              id={optionId(listId, entry.code)}
              role="option"
              aria-selected={entry.code === locale}
              className={
                index === activeIndex ? "language-picker-option is-active" : "language-picker-option"
              }
              // Pointer movement steers the same cursor the arrow keys use, so
              // hover and keyboard can never point at two different options.
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => choose(entry.code)}
            >
              {entry.code === locale && <Check size={14} aria-hidden="true" />}
              <span className="language-picker-option-name">{entry.name}</span>
              {/* The tag is shown as a hint: someone hunting for "pt-BR" finds it
                  faster by code than by scanning endonyms for "Português". */}
              <span className="language-picker-option-code">{entry.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The DOM id `aria-activedescendant` points at for one option. */
function optionId(listId: string, code: Locale): string {
  return `${listId}-${code}`;
}

