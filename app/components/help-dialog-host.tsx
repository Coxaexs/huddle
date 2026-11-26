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
    window.addEventListener(HELP_EVENT, onOpen);
    return () => window.removeEventListener(HELP_EVENT, onOpen);
  }, []);
  if (!open) return null;
  return <HelpDialog onClose={() => setOpen(false)} onOpenShortcuts={onOpenShortcuts} onOpenTutorial={onOpenTutorial} />;
}
