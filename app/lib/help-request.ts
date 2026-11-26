/**
 * Opens the Help dialog from anywhere (the header's ? button, Settings, the
 * tour) without threading a prop through every layer. HelpDialogHost listens.
 */
export const HELP_EVENT = "hoffle:open-help";

export function requestHelp() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(HELP_EVENT));
}
