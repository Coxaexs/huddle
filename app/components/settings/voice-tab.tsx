"use client";

import { useState } from "react";
import type { HeadTrackingStatus } from "../../lib/head-tracking";
import type { RelayStatus } from "../../hooks/use-voice";
import { headTrackingHint } from "../table-audio-menu";
import { saveDevice, type DeviceLists } from "../../lib/devices";
import { type MicSettings, type MicTelemetry } from "../../lib/mic-chain";
import { VoiceInput } from "./voice-input";
import { ComboButton } from "./roles-tab";
import { Tab } from "./types";

export function VoiceTab({
  tab,
  relay,
  onCheckRelay,
  onTableMode,
  tableMode,
  setSpatialOutput,
  spatialOutput,
  headTrackingOffered,
  setHeadTracking,
  headTracking,
  setHeadTrackingSource,
  headTrackingSource,
  headTrackingStatus,
  airpodsOffered,
  recenterHead,
  inCall,
  tableParticipants,
  tableHostId,
  onTableHostId,
  micId,
  setMicId,
  onMicrophoneChange,
  devices,
  mic,
  changeMic,
  subscribeMicTelemetry,
  speakerId,
  setSpeakerId,
  cameraId,
  setCameraId,
  pushToTalk,
  onPushToTalk,
  setCapturingKey,
  capturingKey,
  onPttKey,
  pttKey,
  whisperKey,
  onWhisperKey,
  screenShareAudio,
  onScreenShareAudioChange,
  muteKey,
  onMuteKey,
  deafenKey,
  onDeafenKey,
  onMicTestHold,
}: {
  tab: Tab;
  relay: RelayStatus | undefined;
  onCheckRelay: (() => void) | undefined;
  onTableMode: ((enabled: boolean) => void) | undefined;
  tableMode: boolean;
  setSpatialOutput: ((output: "headphones" | "speakers") => void) | undefined;
  spatialOutput: "headphones" | "speakers";
  headTrackingOffered: boolean;
  setHeadTracking: ((enabled: boolean) => void) | undefined;
  headTracking: boolean;
  setHeadTrackingSource: ((source: "airpods" | "webcam") => void) | undefined;
  headTrackingSource: "airpods" | "webcam";
  headTrackingStatus: { status: HeadTrackingStatus; live: boolean; };
  airpodsOffered: boolean;
  recenterHead: (() => void) | undefined;
  inCall: boolean;
  tableParticipants: { connectionId: string; displayName: string; }[];
  tableHostId: string;
  onTableHostId: ((id: string) => void) | undefined;
  micId: string;
  setMicId: React.Dispatch<React.SetStateAction<string>>;
  onMicrophoneChange: (() => void) | undefined;
  devices: DeviceLists;
  mic: MicSettings;
  changeMic: (next: Partial<MicSettings>) => void;
  subscribeMicTelemetry: ((listener: (telemetry: MicTelemetry) => void) => () => void) | undefined;
  speakerId: string;
  setSpeakerId: React.Dispatch<React.SetStateAction<string>>;
  cameraId: string;
  setCameraId: React.Dispatch<React.SetStateAction<string>>;
  pushToTalk: boolean;
  onPushToTalk: ((enabled: boolean) => void) | undefined;
  setCapturingKey: React.Dispatch<React.SetStateAction<boolean>>;
  capturingKey: boolean;
  onPttKey: ((code: string) => void) | undefined;
  pttKey: string;
  whisperKey: string;
  onWhisperKey: ((code: string) => void) | undefined;
  screenShareAudio: boolean;
  onScreenShareAudioChange: ((enabled: boolean) => void) | undefined;
  muteKey: string;
  onMuteKey: ((combo: string) => void) | undefined;
  deafenKey: string;
  onDeafenKey: ((combo: string) => void) | undefined;
  onMicTestHold?: (active: boolean) => void;
}) {
  const [capturingWhisper, setCapturingWhisper] = useState(false);
  return (
    <>
      {tab === "voice" && (
        <>
          <VoiceInput
            settings={mic}
            onChange={changeMic}
            subscribe={subscribeMicTelemetry}
            inCall={inCall}
            micId={micId}
            onMicId={(id) => {
              setMicId(id);
              saveDevice("microphone", id);
              void onMicrophoneChange?.();
            }}
            microphones={devices.microphones}
            speakerId={speakerId}
            onSpeakerId={setSpeakerId}
            speakers={devices.speakers}
            pushToTalk={pushToTalk}
            onPushToTalk={onPushToTalk}
            pttKey={pttKey}
            onPttKey={onPttKey}
            capturingKey={capturingKey}
            setCapturingKey={setCapturingKey}
            onMicTestHold={onMicTestHold}
          />

          <section className="vs-section vs-section-video">
            <h3 className="field-label">Video</h3>
            <label htmlFor="settings-camera">Camera</label>
            <select
              id="settings-camera"
              value={cameraId}
              onChange={(event) => {
                setCameraId(event.target.value);
                saveDevice("camera", event.target.value);
              }}
            >
              <option value="">System default</option>
              {devices.cameras.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
            <label className="appearance-switch">
              <span>
                <strong>Share audio with my screen</strong>
                <small>Sends the sound of the tab, app or system along with a screen share</small>
              </span>
              <input
                type="checkbox"
                checked={screenShareAudio}
                onChange={(event) => onScreenShareAudioChange?.(event.target.checked)}
              />
            </label>
          </section>

          <details className="vs-more">
            <summary>Keybinds</summary>
            <div className="vs-more-body">
              <p className="modal-hint">
                Work while you are in a voice room, and are ignored while you are
                typing. Hold modifiers and press a key to rebind.
              </p>
              <ComboButton
                label="Toggle mute"
                combo={muteKey}
                onChange={(combo) => onMuteKey?.(combo)}
              />
              <ComboButton
                label="Toggle deafen"
                combo={deafenKey}
                onChange={(combo) => onDeafenKey?.(combo)}
              />
              <button
                type="button"
                className="ptt-key-button"
                title="Hold this key to whisper to the person you last picked in the call"
                onClick={() => setCapturingWhisper(true)}
                onKeyDown={(event) => {
                  if (!capturingWhisper) return;
                  event.preventDefault();
                  onWhisperKey?.(event.code === "Escape" ? "" : event.code);
                  setCapturingWhisper(false);
                }}
              >
                {capturingWhisper
                  ? "Press a key… (Esc clears)"
                  : whisperKey
                    ? `Whisper key: ${whisperKey.replace(/^Key/, "")}`
                    : "Set a whisper key"}
              </button>
            </div>
          </details>

          {onTableMode && (
            <details className="vs-more">
              <summary>Spatial audio</summary>
              <div className="vs-more-body">
                <label className="appearance-switch">
                  <span>
                    <strong>Table Mode</strong>
                    <small>Places voices around you. Only changes what you hear.</small>
                  </span>
                  <input type="checkbox" checked={tableMode}
                    onChange={(event) => onTableMode(event.target.checked)} />
                </label>
                {tableMode && setSpatialOutput && (
                  <>
                    <label htmlFor="spatial-output">Listening on</label>
                    <select id="spatial-output" value={spatialOutput}
                      onChange={(event) => setSpatialOutput(event.target.value === "speakers" ? "speakers" : "headphones")}>
                      <option value="headphones">Headphones · 3D sound</option>
                      <option value="speakers">Speakers · stereo</option>
                    </select>
                  </>
                )}
                {tableMode && headTrackingOffered && setHeadTracking && (
                  <>
                    <label className="appearance-switch">
                      <span>
                        <strong>Follow my head</strong>
                        <small>{headTrackingHint({ headTracking, headTrackingStatus, headTrackingSource, airpodsOffered })}</small>
                      </span>
                      <input type="checkbox" checked={headTracking}
                        onChange={(event) => setHeadTracking(event.target.checked)} />
                    </label>
                    {setHeadTrackingSource && (
                      <select aria-label="Head tracking source" value={headTrackingSource}
                        onChange={(event) => setHeadTrackingSource(event.target.value === "webcam" ? "webcam" : "airpods")}>
                        <option value="airpods">AirPods (no camera)</option>
                        <option value="webcam">Webcam</option>
                      </select>
                    )}
                    {headTracking && headTrackingStatus.live && (
                      <button type="button" onClick={recenterHead}>Face forward</button>
                    )}
                  </>
                )}
                {tableMode && inCall && (
                  <>
                    <label htmlFor="table-host">Dungeon Master</label>
                    <select id="table-host" value={tableParticipants.some((p) => p.connectionId === tableHostId) ? tableHostId : ""} onChange={(event) => onTableHostId?.(event.target.value)}>
                      <option value="">Automatic seats by join order</option>
                      {tableParticipants.map((person) => (
                        <option key={person.connectionId} value={person.connectionId}>{person.displayName}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </details>
          )}

          {relay && (
            <details className="vs-more">
              <summary>Connection</summary>
              <div className="vs-more-body">
                <p className="modal-hint" role="status">{relay.detail}</p>
                {onCheckRelay && (
                  <button
                    type="button"
                    onClick={onCheckRelay}
                    disabled={relay.state === "checking"}
                  >
                    {relay.state === "checking" ? "Checking…" : "Check again"}
                  </button>
                )}
              </div>
            </details>
          )}

          <p className="modal-hint vs-footnote">
            Saved on this device. Switching the microphone in a call doesn&apos;t drop the call.
          </p>
        </>
      )}
    </>
  );
}
