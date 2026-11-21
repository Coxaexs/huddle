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

/**
 * Whether the microphone stays muted after a moderator changes this user's
 * server mute: forced mute always mutes; lifting it restores the user's own
 * mute/deafen choice (and a stage audience seat stays muted until invited up).
 */
export function mutedAfterForcedMute(options: {
  forcedMute: boolean;
  selfMuted: boolean;
  deafened: boolean;
  speakAllowed?: boolean;
}): boolean {
  if (options.forcedMute) return true;
  return options.selfMuted || options.deafened || options.speakAllowed === false;
}

/**
 * The mic gate: whether the microphone track is live right now. A server mute
 * always closes it; otherwise a confirmed whisper opens it whatever mute or
 * push-to-talk says, push-to-talk opens it only while the key is held, and
 * without push-to-talk it follows the mute state.
 */
export function micOpen(options: {
  forcedMute: boolean;
  whispering: boolean;
  pushToTalk: boolean;
  pttHeld: boolean;
  muted: boolean;
}): boolean {
  if (options.forcedMute) return false;
  if (options.whispering) return true;
  return options.pushToTalk ? options.pttHeld : !options.muted;
}
