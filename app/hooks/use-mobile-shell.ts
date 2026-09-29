"use client";

import { useEffect, useRef } from "react";

/**
 * Phone behaviour for the app shell (the iOS/Android apps and mobile browsers).
 *
 * Keyboard: iOS doesn't shrink the page when the keyboard opens, it slides the
 * page up underneath it, so the composer ended up behind the keys. We size the
 * shell to the *visual* viewport instead (--app-height) and pin the page back
 * to the top, so the composer always sits right above the keyboard.
 *
 * Swipes: from anywhere in the chat, swipe right for the channel drawer and
 * left for the member list (or to close whichever is open), like Discord.
 */
export function useMobileShell(options: {
  navOpen: boolean;
  membersOpen: boolean;
  setNavOpen: (open: boolean) => void;
  setMembersOpen: (open: boolean) => void;
}) {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const root = document.documentElement;
    // The iOS app's web view can report a zero safe-area inset; CSS uses this
    // to guarantee room for the status bar there.
    const platform = (window as unknown as {
      Capacitor?: { getPlatform?: () => string };
    }).Capacitor?.getPlatform?.();
    if (platform === "ios" || platform === "android") root.dataset.native = platform;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const apply = () => {
      // Only a real on-screen keyboard counts. An iPad with a hardware
      // keyboard (Folio / Magic Keyboard) keeps a ~50-70px shortcut bar up
      // whenever a text box is focused; resizing for that just made the whole
      // layout jump, so below the threshold we keep the full height.
      const covered = window.innerHeight - viewport.height;
      const keyboardOpen = covered > 150;
      root.style.setProperty(
        "--app-height",
        `${Math.round(keyboardOpen ? viewport.height : window.innerHeight)}px`,
      );
      root.dataset.keyboard = keyboardOpen ? "open" : "closed";
      // Keyboard open: iOS has scrolled the page up; undo it so fixed
      // headers stay on screen.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
    };
  }, []);

  useEffect(() => {
    let start: { x: number; y: number; at: number } | null = null;

    const ignored = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return true;
      // Things that use horizontal drags themselves, and open dialogs.
      return Boolean(
        target.closest(
          'input, textarea, select, canvas, video, [contenteditable="true"], [role="dialog"], [role="slider"], ' +
            ".voice-stage, .custom-dialog, .settings-modal, .emoji-picker, .gif-picker, .msn-popover, .message-actions, .thread-panel, [data-no-swipe]",
        ) || hasHorizontalScroll(target),
      );
    };

    const onStart = (event: TouchEvent) => {
      if (window.innerWidth > 760 || event.touches.length !== 1 || ignored(event.target)) {
        start = null;
        return;
      }
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, at: Date.now() };
    };

    const onEnd = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const quick = Date.now() - start.at < 600;
      start = null;
      // A deliberate sideways flick, not a scroll.
      if (!quick || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      const { navOpen, membersOpen, setNavOpen, setMembersOpen } = latest.current;
      if (dx > 0) {
        if (membersOpen) setMembersOpen(false);
        else if (!navOpen) setNavOpen(true);
      } else if (navOpen) {
        setNavOpen(false);
      } else if (!membersOpen) {
        setMembersOpen(true);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);
}

function hasHorizontalScroll(element: Element): boolean {
  for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      node.scrollWidth > node.clientWidth + 2
    ) {
      return true;
    }
  }
  return false;
}
