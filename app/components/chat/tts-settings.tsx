"use client";

import { useEffect, useState } from "react";
import { ALANIA_VOICES } from "@/lib/speech";
import { duyuAvailable, getCaptionPrefs, setCaptionPrefs, type CaptionPrefs } from "../../lib/stt/duyu";
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
 * Also which recognizer live captions use (Duyu or the browser's own).
 */
export function TtsSettings() {
  const [voice, setVoice] = useState<TtsVoice>(() => getTtsVoice());
  const [playback, setPlayback] = useState(() => ttsPlaybackEnabled());
  const [lang, setLang] = useState<TtsLanguage>("en");
  const [text, setText] = useState(SAMPLE.en);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [captionPrefs, setCaptionPrefsState] = useState<CaptionPrefs>(() => getCaptionPrefs());
  /** null while asking the server whether it has a speech key. */
  const [speechServer, setSpeechServer] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void duyuAvailable().then((ok) => live && setSpeechServer(ok));
    return () => {
      live = false;
    };
  }, []);
  const updateCaptions = (patch: Partial<CaptionPrefs>) => {
    const next = { ...captionPrefs, ...patch };
    setCaptionPrefsState(next);
    setCaptionPrefs(next);
  };

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
        Turkish is spoken by Alania (on the server) when it is available, else
        EMA Lightning on your device. English is made on your device with
        Paradee (or Piper for the male voice); the first use downloads the
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

      <label htmlFor="tts-turkish-voice">Turkish voice</label>
      <select
        id="tts-turkish-voice"
        value={voice.turkish}
        onChange={(event) => update({ turkish: event.target.value as TtsVoice["turkish"] })}
        disabled={speechServer === false}
      >
        {(["female", "male"] as const).map((gender) => (
          <optgroup key={gender} label={gender === "female" ? "Female" : "Male"}>
            {ALANIA_VOICES.filter((option) => option.gender === gender).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} — {option.description.toLowerCase()}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {speechServer === false && (
        <p className="modal-hint">This server has no Alania key, so Turkish uses the one on-device voice.</p>
      )}

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

      <h3 className="tts-settings-heading">Live captions</h3>
      <p className="modal-hint">
        What turns your speech into text when you caption your voice in a call. Duyu is Turkish speech
        recognition run by this server; the browser&apos;s own works in Chrome, Edge and Safari.
      </p>
      <label htmlFor="stt-engine">Recognizer</label>
      <select
        id="stt-engine"
        value={captionPrefs.engine}
        onChange={(event) => {
          const value = event.target.value;
          updateCaptions({ engine: value === "duyu" || value === "browser" ? value : "auto" });
        }}
      >
        <option value="auto">Automatic (Duyu when available)</option>
        <option value="duyu" disabled={speechServer === false}>Duyu</option>
        <option value="browser">Browser</option>
      </select>
      {captionPrefs.engine !== "browser" && speechServer !== false && (
        <>
          <label htmlFor="stt-language">Duyu language</label>
          <select
            id="stt-language"
            value={captionPrefs.language}
            onChange={(event) => updateCaptions({ language: event.target.value === "auto" ? "auto" : "tr" })}
          >
            <option value="tr">Turkish</option>
            <option value="auto">Detect</option>
          </select>
        </>
      )}
      {speechServer === false && <p className="modal-hint">This server has no Duyu key, so captions use the browser.</p>}

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
