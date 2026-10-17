"use client";

import { VOICE_EFFECTS, type VoiceEffect } from "../../lib/voice-effects";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Headphones } from "lucide-react";
import { registerMedia, saveDevice, supportsOutputSelection, unregisterMedia, type DeviceOption } from "../../lib/devices";
import { canRecordMicTest, recordingExtension, recordMicTest, TEST_SECONDS } from "../../lib/mic-recording";
import { GAIN_RANGE, openMicrophone, SENSITIVITY_RANGE, type MicChain, type MicSettings, type MicTelemetry } from "../../lib/mic-chain";

/** Where the meter bottoms out. Quieter than this is indistinguishable silence. */
export const METER_FLOOR_DB = -80;
export const meterPercent = (db: number) =>
  Math.max(0, Math.min(100, ((db - METER_FLOOR_DB) / -METER_FLOOR_DB) * 100));
/**
 * A live picture of what the microphone is doing, with the gate threshold drawn
 * on top of it.
 *
 * A sensitivity slider without a meter is guesswork — you cannot pick a
 * threshold without seeing where your own room noise sits relative to your
 * voice — so the two are deliberately one control.
 */
export function InputMeter({
  telemetry,
  threshold,
}: {
  telemetry: MicTelemetry | null;
  threshold: number | null;
}) {
  const level = telemetry ? meterPercent(telemetry.inputDb) : 0;
  const open = telemetry?.gateOpen ?? false;

  return (
    <div className="input-meter">
      <div className="input-meter-track">
        <div
          className={`input-meter-fill${open ? " open" : ""}`}
          style={{ width: `${level}%` }}
        />
        {threshold !== null && (
          <div
            className="input-meter-threshold"
            style={{ left: `${meterPercent(threshold)}%` }}
          />
        )}
      </div>
    </div>
  );
}
/**
 * Record a few seconds and hear yourself the way the room does: through the
 * whole input chain and Opus. The untouched capture is kept alongside it, and
 * both can be saved, so a complaint like "we can hear you swallow" can be
 * looked at rather than guessed at.
 *
 * It records from the preview chain when one is running; otherwise it opens
 * its own for the length of the recording. In a call that is a second capture
 * of the same microphone, with the same settings — the call itself is never
 * touched.
 */
export function MicRecordTest({
  settings,
  previewChain,
  onTelemetry,
}: {
  settings: MicSettings;
  previewChain: React.MutableRefObject<MicChain | null>;
  onTelemetry?: (telemetry: MicTelemetry) => void;
}) {
  type Phase = "idle" | "recording" | "ready";
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    processed: string;
    raw: string;
    ext: string;
    settings: MicSettings;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Object URLs hold the recording in memory until revoked.
  useEffect(() => () => {
    if (result) {
      URL.revokeObjectURL(result.processed);
      URL.revokeObjectURL(result.raw);
    }
  }, [result]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const element = audioRef.current;
    registerMedia(element);
    return () => unregisterMedia(element);
  }, [result]);

  if (!canRecordMicTest()) return null;

  const start = async () => {
    if (phase === "recording") {
      abortRef.current?.abort();
      return;
    }
    setError("");
    setResult(null);
    const abort = new AbortController();
    abortRef.current = abort;
    let own: MicChain | null = null;
    try {
      let chain = previewChain.current;
      if (!chain) {
        own = await openMicrophone();
        chain = own;
        if (onTelemetry) own.onTelemetry(onTelemetry);
      }
      if (abort.signal.aborted) return;
      setElapsed(0);
      setPhase("recording");
      const recording = await recordMicTest(chain, {
        seconds: TEST_SECONDS,
        onProgress: setElapsed,
        signal: abort.signal,
      });
      setResult({
        processed: URL.createObjectURL(recording.processed),
        raw: URL.createObjectURL(recording.raw),
        ext: recordingExtension(recording.processed),
        settings,
      });
      setPhase("ready");
    } catch (recordError) {
      setError(
        recordError instanceof Error ? recordError.message : "The microphone could not be recorded.",
      );
      setPhase("idle");
    } finally {
      own?.stop();
      if (abortRef.current === abort) abortRef.current = null;
    }
  };

  const save = () => {
    if (!result) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const files: Array<[string, string]> = [
      [result.processed, `hoffle-mic-test-${stamp}-heard.${result.ext}`],
      [result.raw, `hoffle-mic-test-${stamp}-raw.${result.ext}`],
      [
        URL.createObjectURL(
          new Blob([JSON.stringify({ settings: result.settings, userAgent: navigator.userAgent }, null, 2)], {
            type: "application/json",
          }),
        ),
        `hoffle-mic-test-${stamp}-settings.json`,
      ],
    ];
    files.forEach(([href, name], index) => {
      // Spaced out: some browsers drop all but the first of several downloads
      // started in the same instant.
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = href;
        link.download = name;
        link.click();
        if (index === files.length - 1) window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
      }, index * 400);
    });
  };

  return (
    <div className="mic-record-test">
      <div className="mic-record-row">
        <button
          type="button"
          className={`discord-btn ${phase === "recording" ? "danger-red" : "secondary-gray"}`}
          onClick={() => void start()}
        >
          {phase === "recording"
            ? `Stop (${Math.ceil(TEST_SECONDS - elapsed)}s)`
            : phase === "ready"
              ? "Record again"
              : "Record a sample"}
        </button>
        <small className="modal-hint">
          {phase === "recording"
            ? "Talk normally — and try a swallow, a sip or a cough too."
            : `Records ${TEST_SECONDS} seconds you can play back or save — handy when someone says you sound odd.`}
        </small>
      </div>
      {phase === "recording" && (
        <div className="mic-record-progress">
          <div style={{ width: `${(elapsed / TEST_SECONDS) * 100}%` }} />
        </div>
      )}
      {result && (
        <div className="mic-record-row">
          <audio ref={audioRef} controls src={result.processed} autoPlay />
          <button type="button" className="discord-btn secondary-gray" onClick={save} title="Saves what they hear, your raw microphone and your settings">
            <Download size={14} /> Save
          </button>
        </div>
      )}
      {error && <small className="mic-record-error">{error}</small>}
    </div>
  );
}

type InputMode = "activity" | "ptt" | "open";

/**
 * Devices, the mic check, how your mic opens, and noise suppression — the part
 * of Voice & Video most people ever touch. Everything else sits folded away
 * under "More voice options".
 *
 * Whenever you are in a call these read and steer the chain that is actually
 * running, so every change is audible to the room immediately. "Let's check"
 * opens a private chain with the same settings and plays it straight back to
 * you, the way Discord does: no recording, no waiting. In a call you are
 * deafened (and so muted) for as long as it runs, so you hear only yourself
 * and the room does not hear the test.
 */
export function VoiceInput({
  settings,
  onChange,
  subscribe,
  inCall,
  micId,
  onMicId,
  microphones,
  speakerId,
  onSpeakerId,
  speakers,
  pushToTalk,
  onPushToTalk,
  pttKey,
  onPttKey,
  capturingKey,
  setCapturingKey,
  onMicTestHold,
}: {
  settings: MicSettings;
  onChange: (next: Partial<MicSettings>) => void;
  subscribe?: (listener: (telemetry: MicTelemetry) => void) => () => void;
  inCall: boolean;
  micId: string;
  onMicId: (id: string) => void;
  microphones: DeviceOption[];
  speakerId: string;
  onSpeakerId: (id: string) => void;
  speakers: DeviceOption[];
  pushToTalk: boolean;
  onPushToTalk: ((enabled: boolean) => void) | undefined;
  pttKey: string;
  onPttKey: ((code: string) => void) | undefined;
  capturingKey: boolean;
  setCapturingKey: React.Dispatch<React.SetStateAction<boolean>>;
  /** Deafen for the length of a mic check, then put back what was there. */
  onMicTestHold?: (active: boolean) => void;
}) {
  const [telemetry, setTelemetry] = useState<MicTelemetry | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const testChainRef = useRef<MicChain | null>(null);
  const loopbackRef = useRef<HTMLAudioElement | null>(null);
  const holdRef = useRef(onMicTestHold);
  holdRef.current = onMicTestHold;
  const heldRef = useRef(false);

  // The loopback is a registered element so it plays on the chosen output.
  useEffect(() => {
    const element = loopbackRef.current;
    registerMedia(element);
    return () => unregisterMedia(element);
  }, []);

  useEffect(() => {
    if (!inCall || !subscribe || checking) return;
    return subscribe(setTelemetry);
  }, [inCall, subscribe, checking]);

  /** Bumped by every stop, so a microphone still opening knows it is too late. */
  const testRunRef = useRef(0);
  const attach = (chain: MicChain) => {
    chain.onTelemetry(setTelemetry);
    testChainRef.current = chain;
    const element = loopbackRef.current;
    if (element) {
      element.srcObject = chain.stream;
      void element.play().catch(() => undefined);
    }
  };

  const stopCheck = useCallback(() => {
    testRunRef.current += 1;
    testChainRef.current?.stop();
    testChainRef.current = null;
    const element = loopbackRef.current;
    if (element) {
      element.pause();
      element.srcObject = null;
    }
    if (heldRef.current) {
      heldRef.current = false;
      holdRef.current?.(false);
    }
    setChecking(false);
    setTelemetry(null);
  }, []);

  useEffect(() => stopCheck, [stopCheck]);

  const startCheck = async () => {
    if (checking) {
      stopCheck();
      return;
    }
    setCheckError("");
    const run = testRunRef.current;
    setChecking(true);
    if (inCall && holdRef.current) {
      heldRef.current = true;
      holdRef.current(true);
    }
    try {
      const chain = await openMicrophone();
      if (run !== testRunRef.current) return chain.stop();
      attach(chain);
    } catch (error) {
      stopCheck();
      setCheckError(error instanceof Error ? error.message : "The microphone could not be opened.");
    }
  };

  /** Some changes are part of the capture itself, so the check needs a fresh microphone. */
  const reopen = () => {
    if (!testChainRef.current) return;
    testChainRef.current.stop();
    testChainRef.current = null;
    const run = testRunRef.current;
    openMicrophone().then((chain) => {
      // The dialog may have closed, or the check stopped, while it opened.
      if (run !== testRunRef.current) return chain.stop();
      attach(chain);
    }, stopCheck);
  };

  // Picking another microphone mid-check switches what you hear.
  useEffect(() => {
    reopen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micId]);

  // Changes have to reach the check's chain as well as the saved settings, or
  // you go on hearing the old behaviour while you drag the slider.
  const change = (next: Partial<MicSettings>) => {
    onChange(next);
    if (next.echoCancellation !== undefined) reopen();
    else testChainRef.current?.update(next);
  };

  const manual = settings.sensitivity !== "auto";
  const threshold = manual ? (settings.sensitivity as number) : null;
  const mode: InputMode = pushToTalk ? "ptt" : settings.gate ? "activity" : "open";
  const setMode = (next: InputMode) => {
    if (next === "ptt") {
      onPushToTalk?.(true);
      return;
    }
    if (pushToTalk) onPushToTalk?.(false);
    if (settings.gate !== (next === "activity")) change({ gate: next === "activity" });
  };
  const modes: Array<[InputMode, string]> = [
    ["activity", "Voice activity"],
    ...(onPushToTalk ? [["ptt", "Push to talk"] as [InputMode, string]] : []),
    ["open", "Always on"],
  ];

  return (
    <>
      <section className="vs-section">
        <h3 className="field-label">Devices</h3>
        <div className="vs-device-grid">
          <div>
            <label htmlFor="settings-mic">Input device</label>
            <select id="settings-mic" value={micId} onChange={(event) => onMicId(event.target.value)}>
              <option value="">System default</option>
              {microphones.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="settings-speaker">Output device</label>
            {supportsOutputSelection() ? (
              <select
                id="settings-speaker"
                value={speakerId}
                onChange={(event) => {
                  onSpeakerId(event.target.value);
                  saveDevice("speaker", event.target.value);
                }}
              >
                <option value="">System default</option>
                {speakers.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                ))}
              </select>
            ) : (
              <p className="modal-hint vs-device-note">
                This browser uses whatever output your system picks — change it there.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="vs-section">
        <h3 className="field-label">Mic test</h3>
        <div className="vs-mic-check">
          <button
            type="button"
            className={`discord-btn ${checking ? "danger-red" : "primary-indigo"}`}
            onClick={() => void startCheck()}
          >
            {checking ? "Stop checking" : "Let's check"}
          </button>
          <InputMeter telemetry={telemetry} threshold={mode === "activity" ? threshold : null} />
        </div>
        <p className="modal-hint">
          {checking ? (
            <>
              <Headphones size={13} className="vs-inline-icon" /> You&apos;re hearing yourself the way
              others do{inCall ? " — the call is deafened until you stop" : ""}. Use headphones,
              or speakers will feed back.
            </>
          ) : inCall ? (
            "The meter is your live call mic. Let's check deafens you and plays you back."
          ) : (
            "Plays your mic straight back to you, with all your settings applied."
          )}
        </p>
        {checkError && <small className="mic-record-error">{checkError}</small>}
        <audio ref={loopbackRef} hidden />
      </section>

      <section className="vs-section">
        <h3 className="field-label">Input mode</h3>
        <div className="appearance-choice-row vs-mode-row" role="radiogroup" aria-label="Input mode">
          {modes.map(([id, label]) => (
            <button
              type="button"
              role="radio"
              aria-checked={mode === id}
              key={id}
              className={mode === id ? "active" : ""}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "activity" && (
          <>
            <label className="appearance-switch">
              <span>
                <strong>Automatic sensitivity</strong>
                <small>Works out what is you and what is the room</small>
              </span>
              <input
                type="checkbox"
                checked={!manual}
                onChange={(event) => change({ sensitivity: event.target.checked ? "auto" : -50 })}
              />
            </label>
            {manual && (
              <label className="appearance-range vs-sensitivity">
                <span>
                  Sensitivity <small>{threshold} dB · the red line on the meter</small>
                </span>
                <input
                  type="range"
                  min={SENSITIVITY_RANGE.min}
                  max={SENSITIVITY_RANGE.max}
                  step={1}
                  value={threshold ?? -50}
                  onChange={(event) => change({ sensitivity: Number(event.target.value) })}
                />
              </label>
            )}
          </>
        )}

        {mode === "ptt" && (
          <button
            type="button"
            className="ptt-key-button"
            onClick={() => setCapturingKey(true)}
            onKeyDown={(event) => {
              if (!capturingKey) return;
              event.preventDefault();
              onPttKey?.(event.code);
              setCapturingKey(false);
            }}
          >
            {capturingKey ? "Press a key…" : `Push-to-talk key: ${pttKey.replace(/^Key/, "")}`}
          </button>
        )}

        {mode === "open" && (
          <p className="modal-hint">Your mic sends all the time, including the room between sentences.</p>
        )}
      </section>

      <section className="vs-section">
        <label htmlFor="settings-suppression" className="field-label">Noise suppression</label>
        <select
          id="settings-suppression"
          value={settings.mode}
          onChange={(event) => change({ mode: event.target.value as MicSettings["mode"] })}
        >
          <option value="off">Off</option>
          <option value="browser">Standard</option>
          <option value="rnnoise">Enhanced — removes fans, keyboards, hum</option>
          <option value="voice">Strong — also removes voices in the background</option>
        </select>
        <p className="modal-hint">
          {settings.mode === "voice"
            ? "Silences quieter, farther-away speech like a TV. If your first word gets cut off, use Enhanced."
            : settings.mode === "rnnoise"
              ? "Runs on your own device."
              : settings.mode === "browser"
                ? "Your browser's built-in filter."
                : "Everything your mic picks up is sent."}
        </p>
      </section>

      <details className="vs-more">
        <summary>More voice options</summary>
        <div className="vs-more-body">
          <label className="appearance-switch">
            <span>
              <strong>Automatic input volume</strong>
              <small>
                {settings.autoGain
                  ? `Levels your voice for you${telemetry ? ` (${telemetry.gainDb.toFixed(0)} dB)` : ""}`
                  : "Set the input volume yourself"}
              </small>
            </span>
            <input
              type="checkbox"
              checked={settings.autoGain}
              onChange={(event) => change({ autoGain: event.target.checked })}
            />
          </label>
          {!settings.autoGain && (
            <label className="appearance-range">
              <span>
                Input volume <small>{settings.gainDb > 0 ? "+" : ""}{settings.gainDb} dB</small>
              </span>
              <input
                type="range"
                min={GAIN_RANGE.min}
                max={GAIN_RANGE.max}
                step={1}
                value={settings.gainDb}
                onChange={(event) => change({ gainDb: Number(event.target.value) })}
              />
            </label>
          )}

          <label className="appearance-switch">
            <span>
              <strong>Echo cancellation</strong>
              <small>Keep on with speakers. On headphones, off keeps your voice fuller.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.echoCancellation}
              onChange={(event) => change({ echoCancellation: event.target.checked })}
            />
          </label>

          <label className="appearance-switch">
            <span>
              <strong>Voice clarity</strong>
              <small>Cuts desk thumps, fan rumble and mic pops</small>
            </span>
            <input
              type="checkbox"
              checked={settings.clarity}
              onChange={(event) => change({ clarity: event.target.checked })}
            />
          </label>

          <label className="appearance-switch voice-effect-row">
            <span>
              <strong>Voice effect</strong>
              <small>
                {VOICE_EFFECTS.find((effect) => effect.id === settings.voiceEffect)?.hint}
                {settings.voiceEffect !== "none" && " · everyone in the call hears it"}
              </small>
            </span>
            <select
              className="voice-effect-select"
              value={settings.voiceEffect}
              onChange={(event) => change({ voiceEffect: event.target.value as VoiceEffect })}
            >
              {VOICE_EFFECTS.map((effect) => (
                <option key={effect.id} value={effect.id}>{effect.label}</option>
              ))}
            </select>
          </label>

          <label className="appearance-range">
            <span>
              <strong>Voice delay</strong> <small>{settings.delayMs || 0} ms</small>
            </span>
            <input
              type="range"
              min={0}
              max={2000}
              step={25}
              value={settings.delayMs || 0}
              onChange={(event) => change({ delayMs: Number(event.target.value) })}
            />
          </label>
          <p className="modal-hint">Holds your voice back to line it up with a screen share. Leave at 0 otherwise.</p>

          <MicRecordTest
            settings={settings}
            previewChain={testChainRef}
            onTelemetry={inCall ? undefined : setTelemetry}
          />
        </div>
      </details>
    </>
  );
}
