/**
 * Web Audio API synthesized audio cues for Discord-like feedback:
 * - Mute / Unmute
 * - Deafen / Undeafen
 * - Screen Share Start / Stop
 * - Outgoing DM Call Phone Ringing Tone
 * - Call Connected / Call Ended
 */

let audioCtx: AudioContext | null = null;

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
    return audioCtx;
  } catch {
    return null;
  }
}

/** Crisp descending tone when microphone is muted */
export function playMuteSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.09);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  } catch {
    // Ignore audio play errors
  }
}

/** Crisp ascending tone when microphone is unmuted */
export function playUnmuteSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.09);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  } catch {
    // Ignore audio play errors
  }
}

/** Low descending double chime when deafened */
export function playDeafenSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "triangle";
    osc2.type = "sine";

    osc1.frequency.setValueAtTime(280, now);
    osc1.frequency.exponentialRampToValueAtTime(160, now + 0.14);

    osc2.frequency.setValueAtTime(200, now);
    osc2.frequency.exponentialRampToValueAtTime(120, now + 0.14);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.15);
    osc2.stop(now + 0.15);
  } catch {
    // Ignore
  }
}

/** High ascending double chime when undeafened */
export function playUndeafenSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "triangle";

    osc1.frequency.setValueAtTime(220, now);
    osc1.frequency.exponentialRampToValueAtTime(440, now + 0.14);

    osc2.frequency.setValueAtTime(330, now);
    osc2.frequency.exponentialRampToValueAtTime(550, now + 0.14);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.15);
    osc2.stop(now + 0.15);
  } catch {
    // Ignore
  }
}

/** Joyful chime when screen share starts */
export function playScreenShareStartSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [
      { f: 440, t: 0 },
      { f: 554.37, t: 0.08 },
      { f: 659.25, t: 0.16 },
    ].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + t);
      gain.gain.setValueAtTime(0.12, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.13);
    });
  } catch {
    // Ignore
  }
}

/** Gentle chime when screen share stops or someone leaves screen share */
export function playScreenShareStopSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [
      { f: 659.25, t: 0 },
      { f: 440, t: 0.09 },
    ].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + t);
      gain.gain.setValueAtTime(0.12, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.13);
    });
  } catch {
    // Ignore
  }
}

// Active calling ring tone oscillator references
let ringInterval: number | null = null;
let ringGainNode: GainNode | null = null;

/** Plays realistic standard phone ring tone (440Hz + 480Hz dual tone cadence) */
export function startCallingTone() {
  stopCallingTone();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playOneBurst = () => {
    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0.09, now);
      // Fade in slightly
      gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
      // Hold for 1.6s
      gain.gain.setValueAtTime(0.12, now + 1.55);
      // Fade out
      gain.gain.linearRampToValueAtTime(0.001, now + 1.65);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      ringGainNode = gain;
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.7);
      osc2.stop(now + 1.7);
    } catch {
      // Ignore
    }
  };

  playOneBurst();
  ringInterval = window.setInterval(playOneBurst, 3500);
}

/** Stops the phone ring tone */
export function stopCallingTone() {
  if (ringInterval !== null) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  if (ringGainNode) {
    try {
      ringGainNode.gain.setValueAtTime(0, 0);
    } catch {
      // Ignore
    }
    ringGainNode = null;
  }
}

/** Positive connected chime when DM call is answered */
export function playCallAnswerSound() {
  stopCallingTone();
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [
      { f: 523.25, t: 0 },
      { f: 659.25, t: 0.1 },
      { f: 783.99, t: 0.2 },
    ].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + t);
      gain.gain.setValueAtTime(0.15, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.16);
    });
  } catch {
    // Ignore
  }
}

/** Disconnect tone when call ends */
export function playCallEndSound() {
  stopCallingTone();
  stopIncomingCallTone();
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(290, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  } catch {
    // Ignore
  }
}

// Incoming call ringtone references
let incomingRingInterval: number | null = null;
let incomingRingGainNode: GainNode | null = null;

/** Plays recognizable musical chime cadence for incoming DM calls */
export function startIncomingCallTone() {
  stopIncomingCallTone();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playChimeBurst = () => {
    try {
      const now = ctx.currentTime;
      // Vibrant modern chime pattern: C5, E5, G5, B5, C6
      const notes = [
        { f: 523.25, t: 0, d: 0.12 },
        { f: 659.25, t: 0.12, d: 0.12 },
        { f: 783.99, t: 0.24, d: 0.14 },
        { f: 987.77, t: 0.38, d: 0.16 },
        { f: 1046.5, t: 0.54, d: 0.32 },
      ];

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.14, now);
      masterGain.connect(ctx.destination);
      incomingRingGainNode = masterGain;

      notes.forEach(({ f, t, d }) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now + t);

        noteGain.gain.setValueAtTime(0.15, now + t);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + t + d);

        osc.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(now + t);
        osc.stop(now + t + d + 0.05);
      });
    } catch {
      // Ignore
    }
  };

  playChimeBurst();
  incomingRingInterval = window.setInterval(playChimeBurst, 2400);
}

/** Stops the incoming call ringtone */
export function stopIncomingCallTone() {
  if (incomingRingInterval !== null) {
    clearInterval(incomingRingInterval);
    incomingRingInterval = null;
  }
  if (incomingRingGainNode) {
    try {
      incomingRingGainNode.gain.setValueAtTime(0, 0);
    } catch {
      // Ignore
    }
    incomingRingGainNode = null;
  }
}

