/** Set by anything that wants Settings to open on a given page (see settings-dialog.tsx). */
let requested: string | null = null;

export function requestSettingsTab(tab: string) {
  requested = tab;
}

export function takeSettingsTabRequest(): string | null {
  const was = requested;
  requested = null;
  return was;
}
