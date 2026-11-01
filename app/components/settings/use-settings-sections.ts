"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface SettingsSection {
  id: string;
  label: string;
}

const SELECTOR = "[data-settings-anchor]";

function sectionsIn(root: HTMLElement): SettingsSection[] {
  return [...root.querySelectorAll<HTMLElement>(SELECTOR)].map((element) => ({
    id: element.dataset.settingsAnchor || "",
    label: element.dataset.settingsLabel || element.dataset.settingsAnchor || "",
  }));
}

function same(a: SettingsSection[], b: SettingsSection[]) {
  return a.length === b.length && a.every((section, index) => section.id === b[index].id && section.label === b[index].label);
}

/**
 * The open settings page's sections (elements marked data-settings-anchor),
 * for the sidebar to list under the page. `current` follows the scroll, and
 * `jump` scrolls a section into view, opening it when it is a <details>.
 */
export function useSettingsSections(scrollRef: RefObject<HTMLElement | null>, page: string) {
  const [sections, setSections] = useState<SettingsSection[]>([]);
  const [current, setCurrent] = useState("");
  /** While a jump's smooth scroll runs, the spy would light up every section it passes. */
  const jumpingUntilRef = useRef(0);

  // Sections come and go with the page and with its own toggles.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const read = () => {
      const found = sectionsIn(root);
      setSections((existing) => (same(existing, found) ? existing : found));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [scrollRef, page]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || sections.length === 0) {
      setCurrent("");
      return;
    }
    const spy = () => {
      if (Date.now() < jumpingUntilRef.current) return;
      const line = root.getBoundingClientRect().top + 64;
      const elements = [...root.querySelectorAll<HTMLElement>(SELECTOR)];
      let seen = elements[0]?.dataset.settingsAnchor || "";
      for (const element of elements) {
        if (element.getBoundingClientRect().top <= line) seen = element.dataset.settingsAnchor || seen;
      }
      // Scrolled to the end: the last sections may be too short to reach the top.
      if (root.scrollTop > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
        seen = elements.at(-1)?.dataset.settingsAnchor || seen;
      }
      setCurrent(seen);
    };
    spy();
    root.addEventListener("scroll", spy, { passive: true });
    return () => root.removeEventListener("scroll", spy);
  }, [scrollRef, sections]);

  const jump = useCallback(
    (id: string) => {
      const element = scrollRef.current?.querySelector<HTMLElement>(`[data-settings-anchor="${CSS.escape(id)}"]`);
      if (!element) return;
      if (element instanceof HTMLDetailsElement) element.open = true;
      jumpingUntilRef.current = Date.now() + 700;
      setCurrent(id);
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [scrollRef],
  );

  return { sections, current, jump };
}
