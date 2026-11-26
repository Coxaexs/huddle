"use client";

import { useEffect, useState } from "react";
import { HELP_EVENT } from "../lib/help-request";
import { deferred } from "./chat/shell/deferred";

const HelpDialog = deferred(() => import("./help-dialog").then((m) => m.HelpDialog));

/** Mounted once in the chat shell; opens the Help dialog when requestHelp() is called. */
export function HelpDialogHost({
  onOpenShortcuts,
  onOpenTutorial,
}: {
  onOpenShortcuts: () => void;
  onOpenTutorial: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    // The desktop app's Help menu sends this through its hotkey channel.
    const onHotkey = (event: Event) => {
      if ((event as CustomEvent<string>).detail === "open-help") setOpen(true);
    };
    window.addEventListener(HELP_EVENT, onOpen);
    window.addEventListener("huddle-hotkey", onHotkey);
    return () => {
      window.removeEventListener(HELP_EVENT, onOpen);
      window.removeEventListener("huddle-hotkey", onHotkey);
    };
  }, []);
  if (!open) return null;
  return <HelpDialog onClose={() => setOpen(false)} onOpenShortcuts={onOpenShortcuts} onOpenTutorial={onOpenTutorial} />;
}
