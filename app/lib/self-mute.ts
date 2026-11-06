/**
 * The mute and deafen you chose yourself, kept for the next room and the next
 * launch.
 *
 * Per machine, like the rest of the input settings. Storage can refuse (private
 * mode), in which case the choice just lasts until the page closes.
 */
const MUTE_KEY = "huddle-self-mute";
const DEAFEN_KEY = "huddle-self-deafen";

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "on";
  } catch {
    return false;
  }
}

function save(key: string, on: boolean): void {
  try {
    window.localStorage.setItem(key, on ? "on" : "off");
  } catch {
    // Session only.
  }
}

export const readSelfMute = () => read(MUTE_KEY);
export const saveSelfMute = (muted: boolean) => save(MUTE_KEY, muted);
export const readSelfDeafen = () => read(DEAFEN_KEY);
export const saveSelfDeafen = (deafened: boolean) => save(DEAFEN_KEY, deafened);
