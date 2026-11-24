"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Mic, Volume2 } from "lucide-react";
import {
  audioDevices,
  diffAudioDevices,
  saveDevice,
  savedDevice,
  supportsOutputSelection,
  type AudioDevice,
} from "../lib/devices";
import { showToast } from "./toast";
import { useI18n } from "../lib/i18n-context";

/** A newly plugged-in microphone and/or speaker, offered as a switch. */
interface Offer {
  microphone?: AudioDevice;
  speaker?: AudioDevice;
}

/** How long an unanswered offer stays up; not answering is "Not now". */
const OFFER_SECONDS = 20;

/** Chromium appends the USB vendor:product id, which means nothing to a person. */
export function deviceName(label: string): string {
  return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "");
}

/**
 * Picks what to offer from a batch of new devices. A headset arrives as a
 * microphone and a speaker at once, sharing a group id; those become one
 * offer for both, not two prompts.
 */
export function offerFor(added: AudioDevice[], outputSelectable: boolean): Offer | null {
  const microphones = added.filter(
    (device) => device.kind === "microphone" && device.deviceId !== savedDevice("microphone"),
  );
  const speakers = outputSelectable
    ? added.filter((device) => device.kind === "speaker" && device.deviceId !== savedDevice("speaker"))
    : [];
  const microphone = microphones[0];
  const speaker =
    speakers.find((device) => microphone && device.groupId && device.groupId === microphone.groupId) ??
    speakers[0];
  return microphone || speaker ? { microphone, speaker } : null;
}

/**
 * Discord-style hot-plug handling for audio devices.
 *
 * Plugging something in asks whether to switch to it; answering yes saves it
 * as your choice and, mid-call, moves the call onto it. Pulling out the device
 * you were using drops back to the system default straight away — silence is
 * never the right fallback — and plugging it back in asks again.
 */
export function DeviceSwitchPrompt({
  inCall,
  activeMicrophone,
  onMicrophoneChange,
}: {
  inCall: boolean;
  activeMicrophone: () => { deviceId: string; ended: boolean } | null;
  onMicrophoneChange: () => void;
}) {
  const { t } = useI18n();
  const [offer, setOffer] = useState<Offer | null>(null);
  // devicechange outlives any one render, so it reads the latest props here.
  const latest = useRef({ inCall, activeMicrophone, onMicrophoneChange, t });
  latest.current = { inCall, activeMicrophone, onMicrophoneChange, t };

  useEffect(() => {
    const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!media?.enumerateDevices || !media.addEventListener) return;
    let known: AudioDevice[] | null = null;
    let cancelled = false;

    const unplugged = (removed: AudioDevice[]) => {
      const { inCall, activeMicrophone, onMicrophoneChange, t: tr } = latest.current;
      for (const device of removed) {
        const name = deviceName(device.label);
        if (device.kind === "microphone") {
          const active = activeMicrophone();
          const wasLive = Boolean(active && (active.deviceId === device.deviceId || active.ended));
          const wasChosen = device.deviceId === savedDevice("microphone");
          if (wasChosen) saveDevice("microphone", "");
          if (!wasLive && !wasChosen) continue;
          if (inCall) onMicrophoneChange();
          showToast(tr("voice.devicePrompt.micDisconnected", { name }), "warning");
        } else if (device.deviceId === savedDevice("speaker")) {
          saveDevice("speaker", "");
          showToast(tr("voice.devicePrompt.speakerDisconnected", { name }), "warning");
        }
      }
      // An offer for something that is gone again is no offer at all.
      const gone = new Set(removed.map((device) => device.deviceId));
      setOffer((current) => {
        if (!current) return current;
        const next = {
          microphone: current.microphone && !gone.has(current.microphone.deviceId) ? current.microphone : undefined,
          speaker: current.speaker && !gone.has(current.speaker.deviceId) ? current.speaker : undefined,
        };
        return next.microphone || next.speaker ? next : null;
      });
    };

    const check = async () => {
      let now: AudioDevice[];
      try {
        now = audioDevices(await media.enumerateDevices());
      } catch {
        return;
      }
      if (cancelled) return;
      const before = known;
      known = now;
      // The first reading is the baseline. So is one taken before any media
      // permission: every device was anonymous then, and granting permission
      // is not the same as plugging them all in.
      if (!before || !before.length) return;
      const { added, removed } = diffAudioDevices(before, now);
      if (removed.length) unplugged(removed);
      const next = added.length ? offerFor(added, supportsOutputSelection()) : null;
      if (next) setOffer(next);
    };

    void check();
    media.addEventListener("devicechange", check);
    return () => {
      cancelled = true;
      media.removeEventListener("devicechange", check);
    };
  }, []);

  useEffect(() => {
    if (!offer) return;
    const timer = window.setTimeout(() => setOffer(null), OFFER_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [offer]);

  if (!offer) return null;

  const { microphone, speaker } = offer;
  const headset = Boolean(microphone && speaker && microphone.groupId === speaker.groupId);
  const title = headset
    ? deviceName(microphone!.label)
    : [microphone && deviceName(microphone.label), speaker && deviceName(speaker.label)].filter(Boolean).join(" · ");
  const question =
    microphone && speaker
      ? t("voice.devicePrompt.useBoth")
      : microphone
        ? t("voice.devicePrompt.useMic")
        : t("voice.devicePrompt.useSpeaker");

  const accept = () => {
    if (microphone) {
      saveDevice("microphone", microphone.deviceId);
      if (latest.current.inCall) latest.current.onMicrophoneChange();
    }
    if (speaker) saveDevice("speaker", speaker.deviceId);
    setOffer(null);
    showToast(t("voice.devicePrompt.switched", { name: title }), "success");
  };

  return (
    <div className="device-prompt" role="alertdialog" aria-label={t("voice.devicePrompt.title")}>
      <span className="device-prompt-icon">
        {headset ? <Headphones size={20} /> : microphone ? <Mic size={20} /> : <Volume2 size={20} />}
      </span>
      <div className="device-prompt-body">
        <strong>{t("voice.devicePrompt.title")}</strong>
        <span className="device-prompt-name">{title}</span>
        <span>{question}</span>
        <div className="device-prompt-actions">
          <button type="button" className="discord-btn primary-indigo" onClick={accept}>
            {t("voice.devicePrompt.switch")}
          </button>
          <button type="button" className="discord-btn secondary-gray" onClick={() => setOffer(null)}>
            {t("voice.devicePrompt.notNow")}
          </button>
        </div>
      </div>
    </div>
  );
}
