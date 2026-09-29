/**
 * Messenger's Sounds settings: pick what plays for each event. Every sound
 * is synthesized (Web Audio), so there are no files to ship. Choices live on
 * this device.
 */

export type SoundEvent = "message" | "signin" | "nudge" | "wink" | "game";

export const SOUND_EVENTS: Array<{ id: SoundEvent; label: string; hint: string }> = [
  { id: "message", label: "New message", hint: "Someone messages you while you're elsewhere" },
  { id: "signin", label: "Contact signs in", hint: "A contact comes online" },
  { id: "nudge", label: "Nudge", hint: "Someone shakes your window" },
  { id: "wink", label: "Winks", hint: "The sound track of each wink" },
  { id: "game", label: "Games", hint: "Your turn, mines found, wins" },
];

export type SoundPreset = "classic" | "chime" | "pop" | "bell" | "blip" | "doorbell" | "none";

export const SOUND_PRESETS: Array<{ id: SoundPreset; name: string }> = [
  { id: "classic", name: "Messenger (classic)" },
  { id: "chime", name: "Chime" },
  { id: "pop", name: "Pop" },
  { id: "bell", name: "Bell" },
  { id: "blip", name: "Blip" },
  { id: "doorbell", name: "Doorbell" },
  { id: "none", name: "(None)" },
];

/** Winks carry their own sound track, so they're classic or silent. */
export function presetsFor(event: SoundEvent) {
  return event === "wink" ? SOUND_PRESETS.filter((p) => p.id === "classic" || p.id === "none") : SOUND_PRESETS;
}

const KEY = "huddle-msn-sound-choices";

function readAll(): Partial<Record<SoundEvent, SoundPreset>> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Record<SoundEvent, SoundPreset>>) : {};
    // The older on/off switch for message sounds.
    if (!raw && window.localStorage.getItem("huddle-msn-sounds") === "0") return { message: "none" };
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function soundChoice(event: SoundEvent): SoundPreset {
  const choice = readAll()[event];
  return SOUND_PRESETS.some((p) => p.id === choice) ? (choice as SoundPreset) : "classic";
}

export function setSoundChoice(event: SoundEvent, preset: SoundPreset) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [event]: preset }));
  } catch {
    // Storage blocked: applies until reload.
  }
}

// ---------------------------------------------------------------- synth

function withContext(play: (ctx: AudioContext, now: number, out: AudioNode) => number) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const length = play(ctx, ctx.currentTime, ctx.destination);
    window.setTimeout(() => void ctx.close().catch(() => undefined), length + 300);
  } catch {
    // Autoplay blocked or no audio: nothing to hear, nothing breaks.
  }
}

function note(ctx: AudioContext, out: AudioNode, at: number, freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** The original sound for each event: doo-dah, ding-dong, the nudge rattle. */
function classic(event: SoundEvent, variant?: string) {
  withContext((ctx, now, out) => {
    if (event === "message") {
      note(ctx, out, now, 659.3, 0.18, "sine", 0.13);
      note(ctx, out, now + 0.12, 987.8, 0.4, "sine", 0.13);
      return 600;
    }
    if (event === "signin") {
      note(ctx, out, now, 1046.5, 0.5, "sine", 0.16);
      note(ctx, out, now + 0.16, 784, 0.5, "sine", 0.16);
      return 800;
    }
    if (event === "nudge") {
      for (let i = 0; i < 8; i += 1) note(ctx, out, now + i * 0.055, 180 - i * 9, 0.045, "square", 0.12);
      return 600;
    }
    if (event === "game") {
      if (variant === "win") {
        [523, 659, 784, 1047].forEach((f, i) => note(ctx, out, now + i * 0.11, f, 0.3, "triangle", 0.15));
        return 800;
      }
      if (variant === "mine") {
        note(ctx, out, now, 220, 0.25, "square", 0.1, 110);
        note(ctx, out, now + 0.05, 880, 0.2, "triangle", 0.12, 1320);
        return 400;
      }
      note(ctx, out, now, 880, 0.12, "triangle", 0.12);
      note(ctx, out, now + 0.09, 1175, 0.18, "triangle", 0.12);
      return 400;
    }
    return 0;
  });
}

function preset(id: SoundPreset) {
  withContext((ctx, now, out) => {
    switch (id) {
      case "chime":
        [1319, 1568, 2093].forEach((f, i) => note(ctx, out, now + i * 0.08, f, 0.5, "sine", 0.1));
        return 800;
      case "pop":
        note(ctx, out, now, 400, 0.08, "sine", 0.3, 900);
        return 200;
      case "bell":
        note(ctx, out, now, 1760, 0.9, "sine", 0.12);
        note(ctx, out, now, 2640, 0.5, "sine", 0.05);
        note(ctx, out, now, 4400, 0.25, "sine", 0.03);
        return 1000;
      case "blip":
        note(ctx, out, now, 1200, 0.06, "square", 0.08);
        note(ctx, out, now + 0.08, 1600, 0.06, "square", 0.08);
        return 200;
      case "doorbell":
        note(ctx, out, now, 659, 0.6, "triangle", 0.16);
        note(ctx, out, now + 0.35, 523, 0.8, "triangle", 0.16);
        return 1200;
      default:
        return 0;
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

/** For the settings dialog's ▶ buttons. */
export function previewSound(event: SoundEvent, choice: SoundPreset) {
  if (choice === "none") return;
  if (choice === "classic") classic(event);
  else preset(choice);
}
