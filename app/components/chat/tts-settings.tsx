"use client";

import { useState } from "react";
import {
  clampTtsVoice,
  DEFAULT_TTS_VOICE,
  getTtsVoice,
  playTts,
  setTtsPlaybackEnabled,
  setTtsVoice,
  synthesize,
  TTS_PITCH_RANGE,
  TTS_TEMPO_RANGE,
  ttsPlaybackEnabled,
  type TtsLanguage,
  type TtsVoice,
} from "../../lib/tts/client";

const SAMPLE: Record<TtsLanguage, string> = {
  en: "Hey everyone, this is how I sound.",
  tr: "Merhaba millet, sesim böyle duyuluyor.",
};

/**
 * Settings → Text-to-speech: whether /tts messages are read aloud here, and
 * the voice your own /tts and /say use (tempo, pitch, effect), with a preview.
 * The same values as /tts on|off and /ttsvoice, saved on every change.
 */
export function TtsSettings() {
  const [voice, setVoice] = useState<TtsVoice>(() => getTtsVoice());
  const [playback, setPlayback] = useState(() => ttsPlaybackEnabled());
  const [lang, setLang] = useState<TtsLanguage>("en");
  const [text, setText] = useState(SAMPLE.en);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const update = (patch: Partial<TtsVoice>) => {
    const next = clampTtsVoice({ ...voice, ...patch });
    setVoice(next);
    setTtsVoice(next);
  };

  const preview = async () => {
    setStatus("loading");
    setError("");
    try {
      await playTts(await synthesize(text.trim() || SAMPLE[lang], lang, voice));
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "The voice could not load.");
    }
  };

  const describeTempo = (t: number) => (t < 0.97 ? "slower" : t > 1.03 ? "faster" : "normal");
  const describePitch = (p: number) => (p < 0.97 ? "deeper" : p > 1.03 ? "higher" : "normal");

  return (
    <div className="tts-settings">
      <p className="modal-hint">
        Speech is made on your device: Turkish with EMA Lightning, English with
        Paradee (or Piper for the male voice). The first use downloads the
        voice once. These are the same
        settings as <code>/tts on|off</code> and <code>/ttsvoice</code>.
      </p>

      <label className="tts-settings-check">
        <input
          type="checkbox"
          checked={playback}
          onChange={(event) => {
            setPlayback(event.target.checked);
            setTtsPlaybackEnabled(event.target.checked);
          }}
        />
        Read /tts messages aloud on this device
      </label>

      <h3 className="tts-settings-heading">Your voice</h3>
      <p className="modal-hint">Used for your own /tts messages (everyone hears it the same way) and /say in voice.</p>

      <label htmlFor="tts-speaker">English voice</label>
      <select
        id="tts-speaker"
        value={voice.speaker ?? "default"}
        onChange={(event) => update({ speaker: event.target.value === "male" ? "male" : "default" })}
      >
        <option value="default">Female</option>
        <option value="male">Male</option>
      </select>
      <p className="modal-hint">Turkish has one voice for now.</p>

      <label htmlFor="tts-tempo">
        Tempo <span className="tts-settings-value">{voice.tempo.toFixed(2)}× · {describeTempo(voice.tempo)}</span>
      </label>
      <input
        id="tts-tempo"
        type="range"
        min={TTS_TEMPO_RANGE[0]}
        max={TTS_TEMPO_RANGE[1]}
        step={0.05}
        value={voice.tempo}
        onChange={(event) => update({ tempo: Number(event.target.value) })}
      />

      <label htmlFor="tts-pitch">
        Pitch <span className="tts-settings-value">{voice.pitch.toFixed(2)}× · {describePitch(voice.pitch)}</span>
      </label>
      <input
        id="tts-pitch"
        type="range"
        min={TTS_PITCH_RANGE[0]}
        max={TTS_PITCH_RANGE[1]}
        step={0.05}
        value={voice.pitch}
        onChange={(event) => update({ pitch: Number(event.target.value) })}
      />

      <label htmlFor="tts-effect">Effect</label>
      <select
        id="tts-effect"
        value={voice.effect ?? "none"}
        onChange={(event) => update({ effect: event.target.value === "robot" ? "robot" : "none" })}
      >
        <option value="none">Natural</option>
        <option value="robot">Robot</option>
      </select>

      <h3 className="tts-settings-heading">Preview</h3>
      <div className="tts-settings-preview">
        <select
          aria-label="Preview language"
          value={lang}
          onChange={(event) => {
            const next = event.target.value === "tr" ? "tr" : "en";
            if (text === SAMPLE[lang]) setText(SAMPLE[next]);
            setLang(next);
          }}
        >
          <option value="en">English</option>
          <option value="tr">Türkçe</option>
        </select>
        <input
          aria-label="Preview text"
          value={text}
          maxLength={200}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="button" className="primary" onClick={() => void preview()} disabled={status === "loading"}>
          {status === "loading" ? "Loading voice…" : "Play"}
        </button>
      </div>
      {status === "error" && <p className="modal-hint tts-settings-error" role="alert">{error}</p>}

      <button
        type="button"
        className="tts-settings-reset"
        onClick={() => {
          setVoice(DEFAULT_TTS_VOICE);
          setTtsVoice(DEFAULT_TTS_VOICE);
        }}
      >
        Reset to the normal voice
      </button>
    </div>
  );
}
