"use client";

import { useState } from "react";
import type { HeadTrackingStatus } from "../../lib/head-tracking";
import type { RelayStatus } from "../../hooks/use-voice";
import { headTrackingHint } from "../table-audio-menu";
import { saveDevice, type DeviceLists } from "../../lib/devices";
import { type MicSettings, type MicTelemetry } from "../../lib/mic-chain";
import { useI18n } from "../../lib/i18n-context";
import { VoiceInput } from "./voice-input";
import { VoiceSounds } from "./voice-sounds";
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
  const { t } = useI18n();
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

          <section className="vs-section vs-section-video" data-settings-anchor="video" data-settings-label={t("settings.voice.video")}>
            <h3 className="field-label">{t("settings.voice.video")}</h3>
            <label htmlFor="settings-camera">{t("settings.voice.camera")}</label>
            <select
              id="settings-camera"
              value={cameraId}
              onChange={(event) => {
                setCameraId(event.target.value);
                saveDevice("camera", event.target.value);
              }}
            >
              <option value="">{t("settings.voice.systemDefault")}</option>
              {devices.cameras.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
            <label className="appearance-switch">
              <span>
                <strong>{t("settings.voice.shareAudio")}</strong>
                <small>{t("settings.voice.shareAudioDesc")}</small>
              </span>
              <input
                type="checkbox"
                checked={screenShareAudio}
                onChange={(event) => onScreenShareAudioChange?.(event.target.checked)}
              />
            </label>
          </section>

          <VoiceSounds />

          <details className="vs-more" data-settings-anchor="keybinds" data-settings-label={t("settings.voice.keybinds")}>
            <summary>{t("settings.voice.keybinds")}</summary>
            <div className="vs-more-body">
              <p className="modal-hint">{t("settings.voice.keybindsDesc")}</p>
              <ComboButton
                label={t("settings.voice.toggleMute")}
                combo={muteKey}
                onChange={(combo) => onMuteKey?.(combo)}
              />
              <ComboButton
                label={t("settings.voice.toggleDeafen")}
                combo={deafenKey}
                onChange={(combo) => onDeafenKey?.(combo)}
              />
              <button
                type="button"
                className="ptt-key-button"
                title={t("settings.voice.whisperTitle")}
                onClick={() => setCapturingWhisper(true)}
                onKeyDown={(event) => {
                  if (!capturingWhisper) return;
                  event.preventDefault();
                  onWhisperKey?.(event.code === "Escape" ? "" : event.code);
                  setCapturingWhisper(false);
                }}
              >
                {capturingWhisper
                  ? t("settings.voice.pressKeyClear")
                  : whisperKey
                    ? t("settings.voice.whisperKey", { key: whisperKey.replace(/^Key/, "") })
                    : t("settings.voice.setWhisperKey")}
              </button>
            </div>
          </details>

          {onTableMode && (
            <details className="vs-more" data-settings-anchor="spatial" data-settings-label={t("settings.voice.spatialAudio")}>
              <summary>{t("settings.voice.spatialAudio")}</summary>
              <div className="vs-more-body">
                <label className="appearance-switch">
                  <span>
                    <strong>{t("settings.voice.tableMode")}</strong>
                    <small>{t("settings.voice.tableModeDesc")}</small>
                  </span>
                  <input type="checkbox" checked={tableMode}
                    onChange={(event) => onTableMode(event.target.checked)} />
                </label>
                {tableMode && setSpatialOutput && (
                  <>
                    <label htmlFor="spatial-output">{t("settings.voice.listeningOn")}</label>
                    <select id="spatial-output" value={spatialOutput}
                      onChange={(event) => setSpatialOutput(event.target.value === "speakers" ? "speakers" : "headphones")}>
                      <option value="headphones">{t("settings.voice.headphones3d")}</option>
                      <option value="speakers">{t("settings.voice.speakersStereo")}</option>
                    </select>
                  </>
                )}
                {tableMode && headTrackingOffered && setHeadTracking && (
                  <>
                    <label className="appearance-switch">
                      <span>
                        <strong>{t("settings.voice.followHead")}</strong>
                        <small>{headTrackingHint({ headTracking, headTrackingStatus, headTrackingSource, airpodsOffered })}</small>
                      </span>
                      <input type="checkbox" checked={headTracking}
                        onChange={(event) => setHeadTracking(event.target.checked)} />
                    </label>
                    {setHeadTrackingSource && (
                      <select aria-label={t("settings.voice.headTrackingSource")} value={headTrackingSource}
                        onChange={(event) => setHeadTrackingSource(event.target.value === "webcam" ? "webcam" : "airpods")}>
                        <option value="airpods">{t("settings.voice.airpods")}</option>
                        <option value="webcam">{t("settings.voice.webcam")}</option>
                      </select>
                    )}
                    {headTracking && headTrackingStatus.live && (
                      <button type="button" onClick={recenterHead}>{t("settings.voice.faceForward")}</button>
                    )}
                  </>
                )}
                {tableMode && inCall && (
                  <>
                    <label htmlFor="table-host">{t("settings.voice.dungeonMaster")}</label>
                    <select id="table-host" value={tableParticipants.some((p) => p.connectionId === tableHostId) ? tableHostId : ""} onChange={(event) => onTableHostId?.(event.target.value)}>
                      <option value="">{t("settings.voice.autoSeats")}</option>
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
            <details className="vs-more" data-settings-anchor="connection" data-settings-label={t("settings.voice.connection")}>
              <summary>{t("settings.voice.connection")}</summary>
              <div className="vs-more-body">
                <p className="modal-hint" role="status">{relay.detail}</p>
                {onCheckRelay && (
                  <button
                    type="button"
                    onClick={onCheckRelay}
                    disabled={relay.state === "checking"}
                  >
                    {relay.state === "checking" ? t("settings.voice.checking") : t("settings.voice.checkAgain")}
                  </button>
                )}
              </div>
            </details>
          )}

          <p className="modal-hint vs-footnote">{t("settings.voice.footnote")}</p>
        </>
      )}
    </>
  );
}
