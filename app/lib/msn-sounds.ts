/**
 * Messenger's Sounds settings: authentic retro 2000s sound synthesis
 * (MSN Messenger 6/7 and Windows 2000/XP system sounds).
 * Synthesized with high-fidelity Web Audio API acoustic modeling so there are
 * zero network delays, zero 404s, and instant 0ms latency playback.
 */

export type SoundEvent = "message" | "send" | "signin" | "nudge" | "error" | "mute" | "unmute" | "wink" | "game";

export const SOUND_EVENTS: Array<{ id: SoundEvent; label: string; hint: string }> = [
  { id: "message", label: "New message", hint: "Someone messages you (MSN classic ba-dum chime)" },
  { id: "send", label: "Message sent", hint: "Subtle pop when your message sends" },
  { id: "signin", label: "Contact signs in", hint: "A contact comes online (MSN guitar strum)" },
  { id: "nudge", label: "Nudge", hint: "Someone shakes your window (heavy rattle)" },
  { id: "error", label: "Error / Alert", hint: "Windows error chord / critical stop" },
  { id: "mute", label: "Mute microphone", hint: "Windows hardware disconnect / switch off" },
  { id: "unmute", label: "Unmute microphone", hint: "Windows hardware connect / switch on" },
  { id: "wink", label: "Winks", hint: "The sound track of each wink" },
  { id: "game", label: "Games", hint: "Your turn, mines found, wins" },
];

export type SoundPreset =
  | "classic"
  | "win_error"
  | "win_ding"
  | "win_tada"
  | "win_hardware"
  | "chime"
  | "pop"
  | "bell"
  | "blip"
  | "doorbell"
  | "none";

export const SOUND_PRESETS: Array<{ id: SoundPreset; name: string }> = [
  { id: "classic", name: "MSN Messenger (Classic)" },
  { id: "win_error", name: "Windows Error (Critical Stop)" },
  { id: "win_ding", name: "Windows Ding" },
  { id: "win_tada", name: "Windows Ta-Da! (Win)" },
  { id: "win_hardware", name: "Windows Hardware Disconnect" },
  { id: "chime", name: "Retro Chime" },
  { id: "pop", name: "Pop" },
  { id: "bell", name: "Bell" },
  { id: "blip", name: "8-bit Blip" },
  { id: "doorbell", name: "Doorbell" },
  { id: "none", name: "(None)" },
];

/** Winks carry their own soundtrack, so they're classic or silent. */
export function presetsFor(event: SoundEvent) {
  return event === "wink" ? SOUND_PRESETS.filter((p) => p.id === "classic" || p.id === "none") : SOUND_PRESETS;
}

const KEY = "huddle-msn-sound-choices";
const VOL_KEY = "huddle_msn_volume";
const RETRO_KEY = "huddle_retro_sounds";

function readAll(): Partial<Record<SoundEvent, SoundPreset>> {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Record<SoundEvent, SoundPreset>>) : {};
    if (!raw && window.localStorage.getItem("huddle-msn-sounds") === "0") return { message: "none" };
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function soundChoice(event: SoundEvent): SoundPreset {
  const choices = readAll();
  const choice = choices[event];
  if (choice && SOUND_PRESETS.some((p) => p.id === choice)) {
    return choice as SoundPreset;
  }
  // Default choices per event
  if (event === "error") return "win_error";
  if (event === "mute") return "win_hardware";
  if (event === "unmute") return "classic";
  if (event === "send") return "classic";
  return "classic";
}

export function setSoundChoice(event: SoundEvent, preset: SoundPreset) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [event]: preset }));
  } catch {
    // Storage blocked: applies until reload.
  }
}

export function getMsnVolume(): number {
  try {
    if (typeof window === "undefined") return 0.7;
    const raw = window.localStorage.getItem(VOL_KEY);
    if (!raw) return 0.7;
    const v = parseFloat(raw);
    return isNaN(v) ? 0.7 : Math.max(0, Math.min(1, v));
  } catch {
    return 0.7;
  }
}

export function setMsnVolume(volume: number): void {
  try {
    if (typeof window === "undefined") return;
    const clamped = Math.max(0, Math.min(1, volume));
    window.localStorage.setItem(VOL_KEY, clamped.toFixed(2));
  } catch {
    // Non-fatal
  }
}

export function isRetroSoundThemeEnabled(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(RETRO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRetroSoundThemeEnabled(enabled: boolean): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RETRO_KEY, enabled ? "1" : "0");
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------- Web Audio Synthesis Engine

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

function withContext(play: (ctx: AudioContext, now: number, master: AudioNode) => void) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const master = ctx.createGain();
    const vol = getMsnVolume();
    master.gain.setValueAtTime(Math.max(0.0001, Math.min(1, vol)), ctx.currentTime);
    master.connect(ctx.destination);

    play(ctx, ctx.currentTime, master);
  } catch {
    // Autoplay blocked or unsupported audio.
  }
}

// Helper: play a clean noise burst (for percussion/mallet clicks)
function playNoise(ctx: AudioContext, out: AudioNode, at: number, dur: number, filterFreq: number, filterQ: number, vol: number) {
  const bufSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buf;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(filterFreq, at);
  filter.Q.setValueAtTime(filterQ, at);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  source.connect(filter).connect(gain).connect(out);
  source.start(at);
  source.stop(at + dur);
}

// Helper: general tone generator with envelope
function tone(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  slideTo?: number,
  attack = 0.005,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);

  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(vol, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.03);
}

/**
 * 1. MSN Messenger Incoming Message ("doo-dah")
 * Two acoustic mallet/chime strikes: E5 (659.25Hz) -> B5 (987.77Hz)
 * Synthesizes mallet transients, fundamental + harmonic partials, and warm decay.
 */
function synthMsnMessage(ctx: AudioContext, now: number, out: AudioNode) {
  const strikes = [
    { at: now, freq: 659.25, dur: 0.22, vol: 0.45 },
    { at: now + 0.115, freq: 987.77, dur: 0.58, vol: 0.52 },
  ];

  strikes.forEach(({ at, freq, dur, vol }) => {
    // Mallet strike transient (click)
    playNoise(ctx, out, at, 0.006, 2800, 3.5, vol * 0.25);

    // High inharmonic chime overtone (decays very quickly)
    tone(ctx, out, at, freq * 4.24, 0.04, "sine", vol * 0.12, undefined, 0.001);

    // Fundamental (warm acoustic bar body)
    tone(ctx, out, at, freq, dur, "sine", vol, undefined, 0.003);

    // 2nd Harmonic
    tone(ctx, out, at, freq * 2, dur * 0.75, "sine", vol * 0.35, undefined, 0.002);

    // 3rd Harmonic
    tone(ctx, out, at, freq * 3, dur * 0.45, "sine", vol * 0.1, undefined, 0.002);
  });
}

/**
 * 2. MSN Messenger Message Sent
 * Subtle ascending bubble pop / swish
 */
function synthMsnSend(ctx: AudioContext, now: number, out: AudioNode) {
  tone(ctx, out, now, 380, 0.05, "sine", 0.25, 860, 0.002);
  tone(ctx, out, now + 0.01, 760, 0.04, "sine", 0.08, 1720, 0.002);
}

/**
 * 3. MSN Messenger Sign-in Guitar Strum
 * 5-string fingerpicked acoustic guitar arpeggio (D4 -> G4 -> B4 -> D5 -> G5)
 * Synthesizes plectrum pluck transients, string harmonics, and acoustic guitar body resonance.
 */
function synthMsnSignIn(ctx: AudioContext, now: number, out: AudioNode) {
  const notes = [
    { freq: 293.66, delay: 0.0, dur: 0.85, vol: 0.32 }, // D4
    { freq: 392.0, delay: 0.034, dur: 0.8, vol: 0.34 }, // G4
    { freq: 493.88, delay: 0.068, dur: 0.75, vol: 0.36 }, // B4
    { freq: 587.33, delay: 0.102, dur: 0.7, vol: 0.38 }, // D5
    { freq: 783.99, delay: 0.136, dur: 0.95, vol: 0.42 }, // G5
  ];

  // Guitar wooden body resonator filter
  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = "bandpass";
  bodyFilter.frequency.setValueAtTime(440, now);
  bodyFilter.Q.setValueAtTime(2.6, now);
  bodyFilter.connect(out);

  notes.forEach(({ freq, delay, dur, vol }) => {
    const at = now + delay;
    // Pick transient
    playNoise(ctx, out, at, 0.009, 2400, 3.0, vol * 0.22);

    // Fundamental plucked string
    tone(ctx, out, at, freq, dur, "sine", vol, undefined, 0.002);

    // 2nd Harmonic
    tone(ctx, out, at, freq * 2, dur * 0.65, "sine", vol * 0.45, undefined, 0.002);

    // 3rd Harmonic
    tone(ctx, out, at, freq * 3, dur * 0.35, "sine", vol * 0.15, undefined, 0.002);

    // Body resonance injection (sawtooth filtered through acoustic body)
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = "sawtooth";
    bodyOsc.frequency.setValueAtTime(freq, at);
    bodyGain.gain.setValueAtTime(0.0001, at);
    bodyGain.gain.linearRampToValueAtTime(vol * 0.18, at + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.5);
    bodyOsc.connect(bodyGain).connect(bodyFilter);
    bodyOsc.start(at);
    bodyOsc.stop(at + dur * 0.5 + 0.02);
  });
}

/**
 * 4. MSN Messenger Nudge Rattle
 * Heavy visceral screen shake: sub-bass impact, dual mechanical flutter oscillators,
 * stereo panning modulation, and window-frame clatter micro-clicks.
 */
function synthMsnNudge(ctx: AudioContext, now: number, out: AudioNode) {
  // 1. Sub-bass punch (desk impact)
  tone(ctx, out, now, 92, 0.22, "sine", 0.65, 38, 0.003);

  // 2. Mechanical window flutter / motor vibration
  const dur = 0.52;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const flutterGain = ctx.createGain();

  osc1.type = "triangle";
  osc1.frequency.setValueAtTime(130, now);

  osc2.type = "square";
  osc2.frequency.setValueAtTime(260, now);

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(220, now);
  filter.Q.setValueAtTime(2.2, now);

  // 18 Hz amplitude modulation (shaking flutter)
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.setValueAtTime(19, now);
  lfoGain.gain.setValueAtTime(0.25, now);

  flutterGain.gain.setValueAtTime(0.0001, now);
  flutterGain.gain.linearRampToValueAtTime(0.45, now + 0.015);
  flutterGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  lfo.connect(lfoGain);
  lfoGain.connect(flutterGain.gain);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(flutterGain);
  flutterGain.connect(out);

  osc1.start(now);
  osc2.start(now);
  lfo.start(now);
  osc1.stop(now + dur);
  osc2.stop(now + dur);
  lfo.stop(now + dur);

  // 3. Crisp window clatter micro-clicks (glass & bezel shaking)
  for (let i = 0; i < 14; i++) {
    const clickTime = now + 0.02 + i * 0.032 + (Math.random() * 0.008 - 0.004);
    playNoise(ctx, out, clickTime, 0.006, 3600, 3.0, 0.18);
  }
}

/**
 * 5. Windows Error / Critical Stop ("Chord" & "Stop")
 * The unmistakable Windows 2000/XP Critical Stop:
 * Discordant diminished chord + heavy bass punch + resonant lowpass tail.
 */
function synthWindowsError(ctx: AudioContext, now: number, out: AudioNode) {
  // Heavy low impact punch
  playNoise(ctx, out, now, 0.012, 1200, 1.5, 0.45);
  tone(ctx, out, now, 125, 0.22, "sine", 0.65, 45, 0.002);

  // The iconic discordant diminished orchestral chord
  const chord = [
    { freq: 130.81, vol: 0.35 }, // C3
    { freq: 185.0, vol: 0.32 },  // F#3 (tritone dissonance)
    { freq: 220.0, vol: 0.28 },  // A3
    { freq: 261.63, vol: 0.32 }, // C4
    { freq: 311.13, vol: 0.26 }, // Eb4 (minor third)
  ];

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(880, now);
  filter.Q.setValueAtTime(2.8, now);
  filter.connect(out);

  const dur = 0.58;
  chord.forEach(({ freq, vol }) => {
    // Sawtooth layer
    const oscSaw = ctx.createOscillator();
    const gainSaw = ctx.createGain();
    oscSaw.type = "sawtooth";
    oscSaw.frequency.setValueAtTime(freq, now);

    gainSaw.gain.setValueAtTime(0.0001, now);
    gainSaw.gain.linearRampToValueAtTime(vol * 0.8, now + 0.003);
    gainSaw.gain.exponentialRampToValueAtTime(0.015, now + 0.28);
    gainSaw.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    oscSaw.connect(gainSaw).connect(filter);
    oscSaw.start(now);
    oscSaw.stop(now + dur);

    // Triangle layer for core body
    const oscTri = ctx.createOscillator();
    const gainTri = ctx.createGain();
    oscTri.type = "triangle";
    oscTri.frequency.setValueAtTime(freq, now);

    gainTri.gain.setValueAtTime(0.0001, now);
    gainTri.gain.linearRampToValueAtTime(vol * 0.6, now + 0.003);
    gainTri.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.7);

    oscTri.connect(gainTri).connect(filter);
    oscTri.start(now);
    oscTri.stop(now + dur * 0.7);
  });
}

/**
 * 6. Windows Ding
 * Crystal-clear metallic bell chime with long shimmer decay.
 */
function synthWindowsDing(ctx: AudioContext, now: number, out: AudioNode) {
  const modes = [
    { freq: 1760, vol: 0.42, dur: 1.25 },
    { freq: 3520, vol: 0.18, dur: 0.8 },
    { freq: 5280, vol: 0.08, dur: 0.5 },
    { freq: 7920, vol: 0.04, dur: 0.3 },
  ];

  // Strike transient
  playNoise(ctx, out, now, 0.005, 4500, 4.0, 0.15);

  modes.forEach(({ freq, vol, dur }) => {
    tone(ctx, out, now, freq, dur, "sine", vol, undefined, 0.001);
  });
}

/**
 * 7. Windows Ta-Da!
 * Triumphant fanfare: G4 -> C5 -> E5 -> big C-major chord flourish with vibrato.
 */
function synthWindowsTada(ctx: AudioContext, now: number, out: AudioNode) {
  const steps = [
    { freq: 392.0, at: now, dur: 0.08, vol: 0.35 },        // G4
    { freq: 523.25, at: now + 0.08, dur: 0.08, vol: 0.38 }, // C5
    { freq: 659.25, at: now + 0.16, dur: 0.11, vol: 0.42 }, // E5
  ];

  steps.forEach(({ freq, at, dur, vol }) => {
    tone(ctx, out, at, freq, dur, "triangle", vol, undefined, 0.002);
    tone(ctx, out, at, freq * 2, dur * 0.8, "sine", vol * 0.25, undefined, 0.002);
  });

  // Triumphant chord fanfare flourish
  const chordStart = now + 0.26;
  const chordDur = 0.85;
  const chordFreqs = [261.63, 392.0, 523.25, 659.25, 783.99]; // C4, G4, C5, E5, G5

  const brassFilter = ctx.createBiquadFilter();
  brassFilter.type = "lowpass";
  brassFilter.frequency.setValueAtTime(1400, chordStart);
  brassFilter.Q.setValueAtTime(2.0, chordStart);
  brassFilter.connect(out);

  chordFreqs.forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, chordStart);

    gain.gain.setValueAtTime(0.0001, chordStart);
    gain.gain.linearRampToValueAtTime(0.18, chordStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, chordStart + chordDur);

    osc.connect(gain).connect(brassFilter);
    osc.start(chordStart);
    osc.stop(chordStart + chordDur);
  });
}

/**
 * 8. Windows Hardware Disconnect (Mute)
 * Descending two-tone chime: E5 -> C#5 with mechanical switch click
 */
function synthWindowsHardwareDisconnect(ctx: AudioContext, now: number, out: AudioNode) {
  playNoise(ctx, out, now, 0.008, 2200, 2.5, 0.18);
  tone(ctx, out, now, 659.25, 0.12, "triangle", 0.38, undefined, 0.002);
  tone(ctx, out, now, 1318.5, 0.08, "sine", 0.15, undefined, 0.002);

  tone(ctx, out, now + 0.11, 554.37, 0.42, "triangle", 0.42, undefined, 0.002);
  tone(ctx, out, now + 0.11, 1108.74, 0.28, "sine", 0.18, undefined, 0.002);
}

/**
 * 9. Windows Hardware Connect (Unmute)
 * Ascending two-tone chime: C#5 -> E5 with mechanical switch click
 */
function synthWindowsHardwareConnect(ctx: AudioContext, now: number, out: AudioNode) {
  playNoise(ctx, out, now, 0.008, 2600, 3.0, 0.2);
  tone(ctx, out, now, 554.37, 0.11, "triangle", 0.38, undefined, 0.002);
  tone(ctx, out, now, 1108.74, 0.08, "sine", 0.16, undefined, 0.002);

  tone(ctx, out, now + 0.10, 659.25, 0.42, "triangle", 0.45, undefined, 0.002);
  tone(ctx, out, now + 0.10, 1318.5, 0.28, "sine", 0.2, undefined, 0.002);
}

/**
 * 10. Deafen & Undeafen tones
 */
function synthWindowsDeafen(ctx: AudioContext, now: number, out: AudioNode) {
  tone(ctx, out, now, 440, 0.12, "sine", 0.35, undefined, 0.003);
  tone(ctx, out, now + 0.11, 261.63, 0.35, "sine", 0.4, undefined, 0.003);
}

function synthWindowsUndeafen(ctx: AudioContext, now: number, out: AudioNode) {
  tone(ctx, out, now, 261.63, 0.11, "sine", 0.35, undefined, 0.003);
  tone(ctx, out, now + 0.10, 523.25, 0.35, "sine", 0.4, undefined, 0.003);
}

// ---------------------------------------------------------------- Dispatcher

function classic(event: SoundEvent, variant?: string) {
  withContext((ctx, now, out) => {
    switch (event) {
      case "message":
        synthMsnMessage(ctx, now, out);
        break;
      case "send":
        synthMsnSend(ctx, now, out);
        break;
      case "signin":
        synthMsnSignIn(ctx, now, out);
        break;
      case "nudge":
        synthMsnNudge(ctx, now, out);
        break;
      case "error":
        synthWindowsError(ctx, now, out);
        break;
      case "mute":
        synthWindowsHardwareDisconnect(ctx, now, out);
        break;
      case "unmute":
        synthWindowsHardwareConnect(ctx, now, out);
        break;
      case "game":
        if (variant === "win") {
          synthWindowsTada(ctx, now, out);
        } else if (variant === "mine") {
          synthWindowsError(ctx, now, out);
        } else {
          synthWindowsDing(ctx, now, out);
        }
        break;
      default:
        synthMsnMessage(ctx, now, out);
        break;
    }
  });
}

function preset(id: SoundPreset) {
  withContext((ctx, now, out) => {
    switch (id) {
      case "win_error":
        synthWindowsError(ctx, now, out);
        break;
      case "win_ding":
        synthWindowsDing(ctx, now, out);
        break;
      case "win_tada":
        synthWindowsTada(ctx, now, out);
        break;
      case "win_hardware":
        synthWindowsHardwareDisconnect(ctx, now, out);
        break;
      case "chime":
        [1319, 1568, 2093].forEach((f, i) => tone(ctx, out, now + i * 0.08, f, 0.5, "sine", 0.16));
        break;
      case "pop":
        tone(ctx, out, now, 420, 0.08, "sine", 0.35, 950);
        break;
      case "bell":
        tone(ctx, out, now, 1760, 0.9, "sine", 0.2);
        tone(ctx, out, now, 2640, 0.5, "sine", 0.08);
        tone(ctx, out, now, 4400, 0.25, "sine", 0.04);
        break;
      case "blip":
        tone(ctx, out, now, 1200, 0.06, "square", 0.15);
        tone(ctx, out, now + 0.07, 1600, 0.06, "square", 0.15);
        break;
      case "doorbell":
        tone(ctx, out, now, 659.25, 0.6, "triangle", 0.28);
        tone(ctx, out, now + 0.32, 523.25, 0.8, "triangle", 0.28);
        break;
      default:
        break;
    }
  });
}

/** Plays whatever this device picked for the event. */
export function playSound(event: SoundEvent, variant?: string) {
  const choice = soundChoice(event);
  if (choice === "none" || event === "wink") return;
  if (choice === "classic") classic(event, variant);
  else preset(choice);
}

/** For the settings dialog's ▶ preview buttons. */
export function previewSound(event: SoundEvent, choice: SoundPreset) {
  if (choice === "none") return;
  if (choice === "classic") classic(event);
  else preset(choice);
}

export type RetroSoundId =
  | "message"
  | "send"
  | "signin"
  | "nudge"
  | "error"
  | "mute"
  | "unmute"
  | "deafen"
  | "undeafen"
  | "ding"
  | "tada"
  | "disconnect";

/** Direct playback helper for retro sound effects across the app. */
export function playRetroSound(id: RetroSoundId, customVol?: number) {
  withContext((ctx, now, out) => {
    let targetOut = out;
    if (customVol !== undefined) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(Math.max(0, Math.min(1, customVol)), now);
      g.connect(out);
      targetOut = g;
    }
    switch (id) {
      case "message":
        synthMsnMessage(ctx, now, targetOut);
        break;
      case "send":
        synthMsnSend(ctx, now, targetOut);
        break;
      case "signin":
        synthMsnSignIn(ctx, now, targetOut);
        break;
      case "nudge":
        synthMsnNudge(ctx, now, targetOut);
        break;
      case "error":
        synthWindowsError(ctx, now, targetOut);
        break;
      case "mute":
      case "disconnect":
        synthWindowsHardwareDisconnect(ctx, now, targetOut);
        break;
      case "unmute":
        synthWindowsHardwareConnect(ctx, now, targetOut);
        break;
      case "deafen":
        synthWindowsDeafen(ctx, now, targetOut);
        break;
      case "undeafen":
        synthWindowsUndeafen(ctx, now, targetOut);
        break;
      case "ding":
        synthWindowsDing(ctx, now, targetOut);
        break;
      case "tada":
        synthWindowsTada(ctx, now, targetOut);
        break;
    }
  });
}

/** Plays the iconic Windows Error chord. */
export function playRetroErrorSound() {
  playRetroSound("error");
}

export function playMsnMute() {
  playSound("mute");
}

export function playMsnUnmute() {
  playSound("unmute");
}

export function playMsnDeafen() {
  playRetroSound("deafen");
}

export function playMsnUndeafen() {
  playRetroSound("undeafen");
}
