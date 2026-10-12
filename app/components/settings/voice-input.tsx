"use client";

import { VOICE_EFFECTS, type VoiceEffect } from "../../lib/voice-effects";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Download } from "lucide-react";
import { registerMedia, unregisterMedia } from "../../lib/devices";
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
              : "Record a test"}
        </button>
        <small className="modal-hint">
          {phase === "recording"
            ? "Talk normally — and try a swallow, a sip or a cough too."
            : `Records ${TEST_SECONDS} seconds and plays you back exactly as other people hear you.`}
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
/**
 * The Voice input controls: sensitivity, gain and suppression.
 *
 * Whenever you are in a call these read and steer the chain that is actually
 * running, so every change is audible to the room immediately. Outside a call
 * "Test microphone" opens a private chain with the same settings, which is the
 * only honest way to preview them.
 */
export function VoiceInput({
  settings,
  onChange,
  subscribe,
  inCall,
}: {
  settings: MicSettings;
  onChange: (next: Partial<MicSettings>) => void;
  subscribe?: (listener: (telemetry: MicTelemetry) => void) => () => void;
  inCall: boolean;
}) {
  const [telemetry, setTelemetry] = useState<MicTelemetry | null>(null);
  const [testing, setTesting] = useState(false);
  const testChainRef = useRef<MicChain | null>(null);

  useEffect(() => {
    if (!inCall || !subscribe) return;
    return subscribe(setTelemetry);
  }, [inCall, subscribe]);

  /** Bumped by every stop, so a microphone still opening knows it is too late. */
  const testRunRef = useRef(0);
  const stopTest = useCallback(() => {
    testRunRef.current += 1;
    testChainRef.current?.stop();
    testChainRef.current = null;
    setTesting(false);
    setTelemetry(null);
  }, []);

  useEffect(() => stopTest, [stopTest]);

  const startTest = async () => {
    if (testing) {
      stopTest();
      return;
    }
    try {
      const chain = await openMicrophone();
      chain.onTelemetry(setTelemetry);
      testChainRef.current = chain;
      setTesting(true);
    } catch {
      stopTest();
    }
  };

  // Changes have to reach the preview chain as well as the saved settings, or
  // the meter goes on showing the old behaviour while you drag the slider.
  const change = (next: Partial<MicSettings>) => {
    onChange(next);
    if (next.echoCancellation !== undefined && testChainRef.current) {
      // Part of the capture itself, so the preview needs a fresh microphone
      // too — the same thing the call does.
      testChainRef.current.stop();
      testChainRef.current = null;
      const run = testRunRef.current;
      openMicrophone().then((chain) => {
        // The dialog may have closed, or the test stopped, while it opened.
        if (run !== testRunRef.current) return chain.stop();
        chain.onTelemetry(setTelemetry);
        testChainRef.current = chain;
      }, stopTest);
      return;
    }
    testChainRef.current?.update(next);
  };

  const manual = settings.sensitivity !== "auto";
  const threshold = manual ? (settings.sensitivity as number) : null;

  return (
    <div className="mic-test-container">
      <div className="mic-test-header">
        <label className="flex items-center gap-1.5 font-semibold text-sm">
          <Mic size={16} /> Input
        </label>
        {inCall ? (
          <span className="modal-hint">Live</span>
        ) : (
          <button
            type="button"
            className={`discord-btn ${testing ? "danger-red" : "primary-indigo"}`}
            onClick={() => void startTest()}
          >
            {testing ? "Stop Testing" : "Test Microphone"}
          </button>
        )}
      </div>

      <InputMeter telemetry={telemetry} threshold={threshold} />

      <MicRecordTest
        settings={settings}
        previewChain={testChainRef}
        onTelemetry={inCall ? undefined : setTelemetry}
      />

      <label className="appearance-switch">
        <span>
          <strong>Automatic input volume</strong>
          <small>
            {settings.autoGain
              ? `Levelling your voice for you${
                  telemetry ? ` (${telemetry.gainDb.toFixed(0)} dB)` : ""
                }`
              : "Set the input gain yourself"}
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
          <strong>Noise gate</strong>
          <small>Stay silent between sentences instead of sending the room</small>
        </span>
        <input
          type="checkbox"
          checked={settings.gate}
          onChange={(event) => change({ gate: event.target.checked })}
        />
      </label>

      {settings.gate && (
        <>
          <label className="appearance-switch">
            <span>
              <strong>Automatic sensitivity</strong>
              <small>Work out what is you and what is the room</small>
            </span>
            <input
              type="checkbox"
              checked={!manual}
              onChange={(event) =>
                change({ sensitivity: event.target.checked ? "auto" : -50 })
              }
            />
          </label>

          {manual && (
            <label className="appearance-range">
              <span>
                Sensitivity <small>{threshold} dB</small>
              </span>
              <input
                type="range"
                min={SENSITIVITY_RANGE.min}
                max={SENSITIVITY_RANGE.max}
                step={1}
                value={threshold ?? -50}
                onChange={(event) =>
                  change({ sensitivity: Number(event.target.value) })
                }
              />
            </label>
          )}
        </>
      )}

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
            <option key={effect.id} value={effect.id}>
              {effect.label}
            </option>
          ))}
        </select>
      </label>

      <label className="appearance-switch">
        <span>
          <strong>Voice clarity</strong>
          <small>
            Cuts desk thumps, fan rumble and mic pops from under your voice,
            without thinning the voice itself.
          </small>
        </span>
        <input
          type="checkbox"
          checked={settings.clarity}
          onChange={(event) => change({ clarity: event.target.checked })}
        />
      </label>

      <label className="appearance-switch">
        <span>
          <strong>Echo cancellation</strong>
          <small>
            Keep this on with speakers. On headphones you can turn it off: there
            is no echo to cancel, and your voice stays fuller when people talk
            over each other.
          </small>
        </span>
        <input
          type="checkbox"
          checked={settings.echoCancellation}
          onChange={(event) => change({ echoCancellation: event.target.checked })}
        />
      </label>

      <label className="appearance-range">
        <span>
          <strong>Stream / Voice Delay</strong> <small>{settings.delayMs || 0} ms</small>
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
      <p className="modal-hint">
        Buffer outgoing microphone audio to synchronize voice with screenshare or add latency (0 - 2000 ms).
      </p>

      <label htmlFor="settings-suppression">Noise suppression</label>
      <select
        id="settings-suppression"
        value={settings.mode}
        onChange={(event) =>
          change({ mode: event.target.value as MicSettings["mode"] })
        }
      >
        <option value="off">Off</option>
        <option value="browser">Standard — your browser&apos;s filter</option>
        <option value="rnnoise">Enhanced — removes fans, keyboards, hum</option>
        <option value="voice">Remove background noise &amp; voices — runs on your device</option>
      </select>
      <p className="modal-hint">
        Enhanced and Remove background noise &amp; voices run a small neural
        network on your own machine, so no GPU server is needed. The second one
        also learns
        how loud you are at the mic and silences quieter, farther-away speech —
        a TV or someone across the room. If people say your first word gets
        cut off, switch back to Enhanced.
      </p>
    </div>
  );
}