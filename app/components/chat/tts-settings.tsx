"use client";

import { useEffect, useState } from "react";
import { ALANIA_VOICES } from "@/lib/speech";
import { useI18n } from "../../lib/i18n-context";
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
  const { t, locale } = useI18n();
  const initialLang: TtsLanguage = locale === "tr" ? "tr" : "en";
  const [voice, setVoice] = useState<TtsVoice>(() => getTtsVoice());
  const [playback, setPlayback] = useState(() => ttsPlaybackEnabled());
  const [lang, setLang] = useState<TtsLanguage>(initialLang);
  const [text, setText] = useState(SAMPLE[initialLang]);
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
      setError(err instanceof Error ? err.message : t("tts.loadFailed"));
    }
  };

  const describeTempo = (v: number) => (v < 0.97 ? t("tts.slower") : v > 1.03 ? t("tts.faster") : t("tts.normal"));
  const describePitch = (p: number) => (p < 0.97 ? t("tts.deeper") : p > 1.03 ? t("tts.higher") : t("tts.normal"));

  return (
    <div className="tts-settings">
      <p className="modal-hint">{t("tts.intro")}</p>

      <label className="tts-settings-check">
        <input
          type="checkbox"
          checked={playback}
          onChange={(event) => {
            setPlayback(event.target.checked);
            setTtsPlaybackEnabled(event.target.checked);
          }}
        />
        {t("tts.readAloud")}
      </label>

      <h3 className="tts-settings-heading">{t("tts.yourVoice")}</h3>
      <p className="modal-hint">{t("tts.yourVoiceHint")}</p>

      <label htmlFor="tts-speaker">{t("tts.englishVoice")}</label>
      <select
        id="tts-speaker"
        value={voice.speaker ?? "default"}
        onChange={(event) => update({ speaker: event.target.value === "male" ? "male" : "default" })}
      >
        <option value="default">{t("tts.female")}</option>
        <option value="male">{t("tts.male")}</option>
      </select>

      <label htmlFor="tts-turkish-voice">{t("tts.turkishVoice")}</label>
      <select
        id="tts-turkish-voice"
        value={voice.turkish}
        onChange={(event) => update({ turkish: event.target.value as TtsVoice["turkish"] })}
        disabled={speechServer === false}
      >
        {(["female", "male"] as const).map((gender) => (
          <optgroup key={gender} label={gender === "female" ? t("tts.female") : t("tts.male")}>
            {ALANIA_VOICES.filter((option) => option.gender === gender).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} — {option.description.toLowerCase()}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {speechServer === false && (
        <p className="modal-hint">{t("tts.noAlaniaKey")}</p>
      )}

      <label htmlFor="tts-tempo">
        {t("tts.tempo")} <span className="tts-settings-value">{voice.tempo.toFixed(2)}× · {describeTempo(voice.tempo)}</span>
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
        {t("tts.pitch")} <span className="tts-settings-value">{voice.pitch.toFixed(2)}× · {describePitch(voice.pitch)}</span>
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

      <label htmlFor="tts-effect">{t("tts.effect")}</label>
      <select
        id="tts-effect"
        value={voice.effect ?? "none"}
        onChange={(event) => update({ effect: event.target.value === "robot" ? "robot" : "none" })}
      >
        <option value="none">{t("tts.effectNatural")}</option>
        <option value="robot">{t("tts.effectRobot")}</option>
      </select>

      <h3 className="tts-settings-heading">{t("tts.preview")}</h3>
      <div className="tts-settings-preview">
        <select
          aria-label={t("tts.previewLanguage")}
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
          aria-label={t("tts.previewText")}
          value={text}
          maxLength={200}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="button" className="primary" onClick={() => void preview()} disabled={status === "loading"}>
          {status === "loading" ? t("tts.loadingVoice") : t("tts.play")}
        </button>
      </div>
      {status === "error" && <p className="modal-hint tts-settings-error" role="alert">{error}</p>}

      <h3 className="tts-settings-heading">{t("tts.liveCaptions")}</h3>
      <p className="modal-hint">{t("tts.liveCaptionsHint")}</p>
      <label htmlFor="stt-engine">{t("tts.recognizer")}</label>
      <select
        id="stt-engine"
        value={captionPrefs.engine}
        onChange={(event) => {
          const value = event.target.value;
          updateCaptions({ engine: value === "duyu" || value === "browser" ? value : "auto" });
        }}
      >
        <option value="auto">{t("tts.recognizerAuto")}</option>
        <option value="duyu" disabled={speechServer === false}>Duyu</option>
        <option value="browser">{t("tts.recognizerBrowser")}</option>
      </select>
      {captionPrefs.engine !== "browser" && speechServer !== false && (
        <>
          <label htmlFor="stt-language">{t("tts.duyuLanguage")}</label>
          <select
            id="stt-language"
            value={captionPrefs.language}
            onChange={(event) => updateCaptions({ language: event.target.value === "auto" ? "auto" : "tr" })}
          >
            <option value="tr">{t("tts.langTurkish")}</option>
            <option value="auto">{t("tts.langDetect")}</option>
          </select>
        </>
      )}
      {speechServer === false && <p className="modal-hint">{t("tts.noDuyuKey")}</p>}

      <button
        type="button"
        className="tts-settings-reset"
        onClick={() => {
          setVoice(DEFAULT_TTS_VOICE);
          setTtsVoice(DEFAULT_TTS_VOICE);
        }}
      >
        {t("tts.reset")}
      </button>
    </div>
  );
}
