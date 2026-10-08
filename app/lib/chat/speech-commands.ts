/**
 * /tts, /say, /ttsvoice and /ttsstop. The shell hands over what they need
 * (where you are, whether you are muted, the voice hook, a way to show a
 * notice and to ask which language) so the rules live in one testable place.
 */
import { apiFetch } from "../client";
import {
  clampTtsVoice,
  detectLanguage,
  getTtsVoice,
  setTtsPlaybackEnabled,
  setTtsVoice,
  speakableText,
  synthesize,
  TTS_PITCH_RANGE,
  TTS_TEMPO_RANGE,
  type TtsLanguage,
  type TtsVoice,
} from "../tts/client";
import { SAY_MAX_CHARS, type useVoice } from "../../hooks/use-voice";

export type SpeechCommand = "tts" | "say" | "ttsvoice" | "ttsstop";

export const SPEECH_COMMANDS: ReadonlySet<string> = new Set<SpeechCommand>(["tts", "say", "ttsvoice", "ttsstop"]);

export interface SpeechContext {
  /** The text channel the command was typed in. */
  activeChannelId: string | null;
  /** The voice room this tab is in, if any. */
  voiceChannelId: string | null;
  /** A moderator server-muted this account: no speech is made at all. */
  serverMuted: boolean;
  voice: Pick<ReturnType<typeof useVoice>, "forcedMute" | "canSpeak" | "speakIntoCall">;
  notify: (text: string) => void;
  /** Asks the sender Turkish or English; null when they close the question. */
  askLanguage: (text: string) => Promise<TtsLanguage | null>;
}

/**
 * The language to speak `text` in: a leading "tr"/"en" picks it; with
 * `detect` (/say), clear text picks itself; otherwise the sender is asked.
 * Null when the question is dismissed.
 */
export async function speechLanguage(
  text: string,
  detect: boolean,
  ask: SpeechContext["askLanguage"],
): Promise<{ lang: TtsLanguage; text: string } | null> {
  const forced = /^(tr|en)\s+([\s\S]+)$/i.exec(text);
  if (forced) return { lang: forced[1].toLowerCase() as TtsLanguage, text: forced[2].trim() };
  const detected = detect ? detectLanguage(text) : null;
  if (detected) return { lang: detected, text };
  const lang = await ask(text);
  return lang ? { lang, text } : null;
}

export async function runSpeechCommand(name: SpeechCommand, value: string, ctx: SpeechContext): Promise<void> {
  if (name === "ttsvoice") return runVoiceSettings(value, ctx);
  if (name === "ttsstop") return runStop(ctx);

  // /tts <message> posts a message read aloud in the channel; /say <text> speaks it into your call.
  if (name === "tts" && /^(on|off)$/i.test(value)) {
    const on = value.toLowerCase() === "on";
    setTtsPlaybackEnabled(on);
    ctx.notify(on ? "/tts messages will be read aloud here." : "/tts messages will no longer be read aloud here.");
    return;
  }
  if (!value) {
    ctx.notify(name === "tts" ? "Type a message after /tts, e.g. /tts hello everyone" : "Type what to say after /say, e.g. /say on my way");
    return;
  }
  if (ctx.serverMuted) {
    ctx.notify(`A moderator muted you, so /${name} is off too.`);
    return;
  }
  if (name === "say" && !ctx.voiceChannelId) {
    ctx.notify("Join a voice channel first, then /say speaks for you there.");
    return;
  }
  if (name === "say") {
    const words = value.replace(/^(tr|en)\s+/i, "");
    if (words.length > SAY_MAX_CHARS) {
      ctx.notify(`/say is limited to ${SAY_MAX_CHARS} characters (that was ${words.length}).`);
      return;
    }
    if (ctx.voice.forcedMute) {
      ctx.notify("A moderator muted you, so /say is off too.");
      return;
    }
    if (!ctx.voice.canSpeak()) {
      ctx.notify("Too much /say is already queued; wait for some of it to play.");
      return;
    }
  }
  const choice = await speechLanguage(value, name === "say", ctx.askLanguage);
  if (!choice) return;

  if (name === "tts") {
    if (!ctx.activeChannelId) return;
    await apiFetch("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        channelId: ctx.activeChannelId,
        content: choice.text,
        payload: { tts: { lang: choice.lang, voice: getTtsVoice() } },
      }),
    });
    return;
  }

  const clean = speakableText(choice.text);
  if (!clean) return;
  try {
    const speech = await synthesize(clean, choice.lang, getTtsVoice());
    const result = await ctx.voice.speakIntoCall(speech.audio, speech.sampleRate);
    if (result === "no-call") ctx.notify("Join a voice channel first, then /say speaks for you there.");
    if (result === "no-server") ctx.notify("/say needs the voice server, and this call is using direct connections right now.");
    if (result === "server-muted") ctx.notify("A moderator muted you, so /say is off too.");
    if (result === "busy") ctx.notify("Too much /say is already queued; wait for some of it to play.");
    if (result === "too-long") ctx.notify(`/say is limited to ${SAY_MAX_CHARS} characters.`);
  } catch (error) {
    ctx.notify(error instanceof Error ? `Text-to-speech failed: ${error.message}` : "Text-to-speech failed.");
  }
}

/** /ttsvoice [tempo n] [pitch n] [robot | effect robot|none] | reset */
function runVoiceSettings(value: string, ctx: SpeechContext) {
  const current = getTtsVoice();
  const describe = (v: TtsVoice) => `tempo ${v.tempo}, pitch ${v.pitch}${v.effect === "robot" ? ", robot" : ""}`;
  if (/^reset$/i.test(value)) {
    setTtsVoice({ tempo: 1, pitch: 1, effect: "none" });
    ctx.notify("Your /tts and /say voice is back to normal.");
    return;
  }
  const tempo = /tempo\s+([\d.]+)/i.exec(value);
  const pitch = /pitch\s+([\d.]+)/i.exec(value);
  const effect = /\b(?:effect\s+)?(robot|none|normal)\b/i.exec(value);
  if (!tempo && !pitch && !effect) {
    ctx.notify(
      `Your voice: ${describe(current)}. Change it with /ttsvoice tempo ${TTS_TEMPO_RANGE[0]}-${TTS_TEMPO_RANGE[1]} pitch ${TTS_PITCH_RANGE[0]}-${TTS_PITCH_RANGE[1]} (lower = slower / deeper), /ttsvoice robot, or /ttsvoice reset.`,
    );
    return;
  }
  const next = clampTtsVoice({
    tempo: tempo ? Number(tempo[1]) : current.tempo,
    pitch: pitch ? Number(pitch[1]) : current.pitch,
    effect: effect ? (effect[1].toLowerCase() === "robot" ? "robot" : "none") : current.effect,
  });
  setTtsVoice(next);
  ctx.notify(`Your /tts and /say voice: ${describe(next)}.`);
}

/** /ttsstop: an admin cuts off /tts here and /say in their voice room. */
async function runStop(ctx: SpeechContext) {
  const channelIds = [ctx.activeChannelId, ctx.voiceChannelId].filter((id): id is string => Boolean(id));
  try {
    await apiFetch("/api/tts/stop", { method: "POST", body: JSON.stringify({ channelIds }) });
  } catch (error) {
    ctx.notify(error instanceof Error ? error.message : "Could not stop text-to-speech.");
  }
}
