"use client";

import type { HeadTrackingStatus } from "../../lib/head-tracking";
import type { RelayStatus } from "../../hooks/use-voice";
import { headTrackingHint } from "../table-audio-menu";
import { saveDevice, supportsOutputSelection, type DeviceLists } from "../../lib/devices";
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
  screenShareAudio,
  onScreenShareAudioChange,
  muteKey,
  onMuteKey,
  deafenKey,
  onDeafenKey,
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
  screenShareAudio: boolean;
  onScreenShareAudioChange: ((enabled: boolean) => void) | undefined;
  muteKey: string;
  onMuteKey: ((combo: string) => void) | undefined;
  deafenKey: string;
  onDeafenKey: ((combo: string) => void) | undefined;
}) {
  return (
    <>
      {tab === "voice" && (
            <>
              <p className="modal-hint">
                Choices are remembered on this device. Changing the microphone
                while you are in a call swaps it without dropping the call.
              </p>

              {relay && (
                <>
                  <label>Voice relay</label>
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
                </>
              )}

              {onTableMode && (
                <>
                  <label>
                    <input type="checkbox" checked={tableMode}
                      onChange={(event) => onTableMode(event.target.checked)} />
                    Table Mode / Spatial Audio
                  </label>
                  <p className="modal-hint">Places voices around you. Only changes what you hear.</p>
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
                      <label>
                        <input type="checkbox" checked={headTracking}
                          onChange={(event) => setHeadTracking(event.target.checked)} />
                        Follow my head
                      </label>
                      {setHeadTrackingSource && (
                        <select aria-label="Head tracking source" value={headTrackingSource}
                          onChange={(event) => setHeadTrackingSource(event.target.value === "webcam" ? "webcam" : "airpods")}>
                          <option value="airpods">AirPods (no camera)</option>
                          <option value="webcam">Webcam</option>
                        </select>
                      )}
                      <p className="modal-hint">{headTrackingHint({ headTracking, headTrackingStatus, headTrackingSource, airpodsOffered })}</p>
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
                </>
              )}

              <label htmlFor="settings-mic">Microphone</label>
              <select
                id="settings-mic"
                value={micId}
                onChange={(event) => {
                  setMicId(event.target.value);
                  saveDevice("microphone", event.target.value);
                  void onMicrophoneChange?.();
                }}
              >
                <option value="">System default</option>
                {devices.microphones.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>

              <VoiceInput
                settings={mic}
                onChange={changeMic}
                subscribe={subscribeMicTelemetry}
                inCall={inCall}
              />

              {supportsOutputSelection() ? (
                <>
                  <label htmlFor="settings-speaker">Output</label>
                  <select
                    id="settings-speaker"
                    value={speakerId}
                    onChange={(event) => {
                      setSpeakerId(event.target.value);
                      saveDevice("speaker", event.target.value);
                    }}
                  >
                    <option value="">System default</option>
                    {devices.speakers.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <p className="modal-hint">
                  This browser plays through whichever output the system
                  chooses — pick it there instead.
                </p>
              )}

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
                  <strong>Push to talk</strong>
                  <small>Transmit only while holding a key</small>
                </span>
                <input
                  type="checkbox"
                  checked={pushToTalk}
                  onChange={(event) => onPushToTalk?.(event.target.checked)}
                />
              </label>

              {pushToTalk && (
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
                  {capturingKey
                    ? "Press a key…"
                    : `Push-to-talk key: ${pttKey.replace(/^Key/, "")}`}
                </button>
              )}

              <span className="field-label">Screen Share</span>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={screenShareAudio}
                  onChange={(event) => onScreenShareAudioChange?.(event.target.checked)}
                />
                Share audio when sharing screen
              </label>
              <p className="modal-hint">
                Captures system, tab, or application audio along with your screen share by default.
              </p>

              <span className="field-label">Shortcuts</span>
              <p className="modal-hint">
                These work while you are in a voice room, and are ignored while
                you are typing. Hold modifiers and press a key to rebind.
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
            </>
          )}
    </>
  );
}
