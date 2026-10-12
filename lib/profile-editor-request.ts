/** Set by anything that wants Settings to open straight on the profile editor. */
let requested = false;

export function requestProfileEditor() {
  requested = true;
}

export function takeProfileEditorRequest() {
  const was = requested;
  requested = false;
  return was;
}
