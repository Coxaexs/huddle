/**
 * Web Audio API synthesized audio cues for Discord-like feedback:
 * - Mute / Unmute
 * - Deafen / Undeafen
 * - Screen Share Start / Stop
 * - Outgoing DM Call Phone Ringing Tone
 * - Call Connected / Call Ended
 * - Someone joining or leaving your voice room, and you disconnecting
 * - Push to talk and camera on / off
 *
 * Each one can be switched off in Settings → Voice & Video → Sounds. The sounds
 * themselves are in `voice-cue-sounds.ts`, and themes with their own set in
 * `themed-cues.ts`, which is asked first.
 */

import { savedDevice } from "./devices";
import { cueOutput, type CueId, type RingId } from "./cue-kit";
import { themedCue, themedRing } from "./themed-cues";
import { STANDARD } from "./voice-cue-sounds";

export type VoiceSoundId =
  | "deafen"
  | "undeafen"
  | "mute"
  | "unmute"
  | "disconnect"
  | "pttOn"
  | "pttOff"
  | "userJoin"
  | "userLeave"
  | "cameraOn"
  | "cameraOff"
  | "shareStart"
  | "shareStop"
  | "callAnswer"
  | "callEnd"
  | "ringOut"
  | "ringIn";

/** In the order the settings list them; the first four are always shown. */
export const VOICE_SOUNDS: Array<{ id: VoiceSoundId; label: string }> = [
  { id: "deafen", label: "Deafen" },
  { id: "undeafen", label: "Undeafen" },
  { id: "mute", label: "Mute" },
  { id: "unmute", label: "Unmute" },
  { id: "userJoin", label: "User join" },
  { id: "userLeave", label: "User leave" },
  { id: "disconnect", label: "Voice disconnected" },
  { id: "pttOn", label: "Push to talk activate" },
  { id: "pttOff", label: "Push to talk deactivate" },
  { id: "cameraOn", label: "Camera on" },
  { id: "cameraOff", label: "Camera off" },
  { id: "shareStart", label: "Stream started" },
  { id: "shareStop", label: "Stream stopped" },
  { id: "callAnswer", label: "Call answered" },
  { id: "callEnd", label: "Call ended" },
  { id: "ringOut", label: "Outgoing ring" },
  { id: "ringIn", label: "Incoming ring" },
];

const SOUNDS_KEY = "huddle:voice-sounds";

/** Only the switched-off sounds are stored, so new sounds start on. */
function switchedOff(): Partial<Record<VoiceSoundId, false>> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SOUNDS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function voiceSoundOn(id: VoiceSoundId): boolean {
  if (typeof window === "undefined") return false;
  return switchedOff()[id] !== false;
}

export function setVoiceSoundOn(id: VoiceSoundId, on: boolean): void {
  try {
    const off = switchedOff();
    if (on) delete off[id];
    else off[id] = false;
    window.localStorage.setItem(SOUNDS_KEY, JSON.stringify(off));
  } catch {
    // Storage blocked: applies until reload.
  }
}

let audioCtx: AudioContext | null = null;
/** The output the context was last pointed at ("" is the system default). */
let audioSink = "";

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

/** Cues play on the speaker picked in Voice settings, like the voices do. */
function followSpeaker(ctx: AudioContext) {
  const sink = savedDevice("speaker");
  const context = ctx as SinkContext;
  if (sink === audioSink || !context.setSinkId) return;
  audioSink = sink;
  void context.setSinkId(sink).catch(() => {
    audioSink = "";
  });
}

/**
 * A running context keeps an audio thread rendering silence for as long as the
 * page is open, so it sleeps between cues and wakes on the next one. A ringtone
 * reuses its context on a timer, so it stays awake while one rings.
 */
const IDLE_SUSPEND_MS = 10_000;
let idleTimer: number | null = null;

function sleepWhenIdle() {
  if (idleTimer !== null) window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    idleTimer = null;
    if (ringInterval !== null || incomingRingInterval !== null) {
      sleepWhenIdle();
      return;
    }
    if (audioCtx?.state === "running") void audioCtx.suspend().catch(() => undefined);
  }, IDLE_SUSPEND_MS);
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    if (audioCtx) {
      followSpeaker(audioCtx);
      sleepWhenIdle();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function play(id: CueId) {
  if (!voiceSoundOn(id)) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const cue = themedCue(id) ?? STANDARD.cues[id];
    cue.play(ctx, cueOutput(ctx, cue), ctx.currentTime + 0.01);
  } catch {
    // A failed cue is silent, never an error.
  }
}

/** Fades a ringtone out instead of cutting it mid-note. */
function silence(gain: GainNode | null) {
  if (!gain) return;
  try {
    const now = gain.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, 0.025);
  } catch {
    // Ignore
  }
}

/** Starts one ringtone burst; the returned gain fades it out. */
function ringBurst(ctx: AudioContext, id: RingId): GainNode | null {
  try {
    const ring = themedRing(id) ?? STANDARD.rings[id];
    const out = cueOutput(ctx, ring);
    ring.play(ctx, out, ctx.currentTime + 0.01);
    return out;
  } catch {
    return null;
  }
}

/** The theme's ring period, read once when ringing starts. */
const ringPeriod = (id: RingId) => (themedRing(id) ?? STANDARD.rings[id]).period;

export const playMuteSound = () => play("mute");
export const playUnmuteSound = () => play("unmute");
export const playDeafenSound = () => play("deafen");
export const playUndeafenSound = () => play("undeafen");
export const playScreenShareStartSound = () => play("shareStart");
export const playScreenShareStopSound = () => play("shareStop");
export const playUserJoinSound = () => play("userJoin");
export const playUserLeaveSound = () => play("userLeave");
export const playVoiceDisconnectSound = () => play("disconnect");
export const playPttOnSound = () => play("pttOn");
export const playPttOffSound = () => play("pttOff");
export const playCameraOnSound = () => play("cameraOn");
export const playCameraOffSound = () => play("cameraOff");

// Active calling ring tone references
let ringInterval: number | null = null;
let ringGainNode: GainNode | null = null;

/** Rings while your DM call waits to be picked up. */
export function startCallingTone() {
  stopCallingTone();
  if (!voiceSoundOn("ringOut")) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const burst = () => {
    ringGainNode = ringBurst(ctx, "ringOut");
  };
  burst();
  ringInterval = window.setInterval(burst, ringPeriod("ringOut"));
}

/** Stops the phone ring tone */
export function stopCallingTone() {
  if (ringInterval !== null) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  silence(ringGainNode);
  ringGainNode = null;
}

/** Positive connected chime when DM call is answered */
export function playCallAnswerSound() {
  stopCallingTone();
  play("callAnswer");
}

/** Disconnect tone when call ends */
export function playCallEndSound() {
  stopCallingTone();
  stopIncomingCallTone();
  play("callEnd");
}

// Incoming call ringtone references
let incomingRingInterval: number | null = null;
let incomingRingGainNode: GainNode | null = null;

/** Rings while someone is calling you. */
export function startIncomingCallTone() {
  stopIncomingCallTone();
  if (!voiceSoundOn("ringIn")) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const burst = () => {
    incomingRingGainNode = ringBurst(ctx, "ringIn");
  };
  burst();
  incomingRingInterval = window.setInterval(burst, ringPeriod("ringIn"));
}

/** Stops the incoming call ringtone */
export function stopIncomingCallTone() {
  if (incomingRingInterval !== null) {
    clearInterval(incomingRingInterval);
    incomingRingInterval = null;
  }
  silence(incomingRingGainNode);
  incomingRingGainNode = null;
}

const PREVIEWS: Record<VoiceSoundId, () => void> = {
  deafen: playDeafenSound,
  undeafen: playUndeafenSound,
  mute: playMuteSound,
  unmute: playUnmuteSound,
  disconnect: playVoiceDisconnectSound,
  pttOn: playPttOnSound,
  pttOff: playPttOffSound,
  userJoin: playUserJoinSound,
  userLeave: playUserLeaveSound,
  cameraOn: playCameraOnSound,
  cameraOff: playCameraOffSound,
  shareStart: playScreenShareStartSound,
  shareStop: playScreenShareStopSound,
  callAnswer: playCallAnswerSound,
  callEnd: playCallEndSound,
  // One burst of the ring, stopped just before the next would start.
  ringOut: () => {
    startCallingTone();
    window.setTimeout(stopCallingTone, ringPeriod("ringOut") - 100);
  },
  ringIn: () => {
    startIncomingCallTone();
    window.setTimeout(stopIncomingCallTone, ringPeriod("ringIn") - 100);
  },
};

/** Plays a sound for the settings list, even while it is switched off. */
export function previewVoiceSound(id: VoiceSoundId) {
  const wasOn = voiceSoundOn(id);
  if (!wasOn) setVoiceSoundOn(id, true);
  try {
    PREVIEWS[id]();
  } finally {
    if (!wasOn) setVoiceSoundOn(id, false);
  }
}
