/**
 * The mute you chose yourself, kept for the next room and the next launch.
 *
 * Per machine, like the rest of the input settings. Storage can refuse (private
 * mode), in which case the choice just lasts until the page closes.
 */
const KEY = "huddle-self-mute";

export function readSelfMute(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function saveSelfMute(muted: boolean): void {
  try {
    window.localStorage.setItem(KEY, muted ? "on" : "off");
  } catch {
    // Session only.
  }
}
