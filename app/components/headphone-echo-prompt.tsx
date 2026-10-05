"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones } from "lucide-react";
import { DEVICE_SAVED_EVENT, savedDevice } from "../lib/devices";
import { deviceName } from "./device-switch-prompt";
import { showToast } from "./toast";

/**
 * Echo cancellation, matched to what you are listening on.
 *
 * On loudspeakers it is essential: without it everyone hears themselves come
 * back out of your microphone. On headphones there is no echo to cancel, but
 * the browser's canceller still ducks your voice whenever someone else talks
 * at the same moment — the half-duplex, "on the phone" feel. So when the
 * output looks like headphones, offer once (per device) to switch it off; and
 * when it is off and the output turns out to be loudspeakers, turn it straight
 * back on, because that mistake is one the whole room pays for.
 */

export type OutputKind = "headphones" | "speakers" | "unknown";

const HEADPHONES =
  /head ?(phone|set)|earphone|ear ?bud|\bbuds|airpods|kulakl|kopfh|auricular|casque|cuffie|hands-?free|\b(wh|wf)-\d|bose|jabra|arctis|hyperx|kraken|blackshark|astro a\d|beats|sennheiser|\bhs\d{2}|corsair (void|virtuoso)|g pro x|cloud (ii|alpha|flight|stinger)/i;
const SPEAKERS =
  /speaker|hoparl|lautsprecher|altavo|haut-parleur|altoparlant|hdmi|displayport|display audio|\btv\b|monitor/i;

/** Best guess at what an output device is, from its label alone. */
export function outputKind(label: string): OutputKind {
  const name = label.replace(/^(default|communications)\s*-\s*/i, "");
  if (HEADPHONES.test(name)) return "headphones";
  if (SPEAKERS.test(name)) return "speakers";
  return "unknown";
}

const askedKey = (label: string) => `huddle-ec-asked:${label}`;

function answered(label: string): boolean {
  try {
    return window.localStorage.getItem(askedKey(label)) !== null;
  } catch {
    return true; // Nowhere to remember the answer: do not ask every call.
  }
}

function remember(label: string, answer: "off" | "keep"): void {
  try {
    window.localStorage.setItem(askedKey(label), answer);
  } catch {
    // Private mode; the question comes back next time.
  }
}

/** The label of the output we are actually playing to, or null if unknowable. */
async function currentOutputLabel(): Promise<string | null> {
  const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!media?.enumerateDevices) return null;
  const outputs = (await media.enumerateDevices()).filter((device) => device.kind === "audiooutput");
  const chosen = savedDevice("speaker");
  // Chromium lists the system default as its own "default" entry, labelled
  // with the real device; elsewhere there is no telling what the default is.
  const device = outputs.find((output) => output.deviceId === (chosen || "default"));
  return device?.label || null;
}

export function HeadphoneEchoPrompt({
  inCall,
  echoCancellation,
  onEchoCancellation,
}: {
  inCall: boolean;
  echoCancellation: boolean;
  onEchoCancellation: (on: boolean) => void;
}) {
  const [offer, setOffer] = useState<string | null>(null);
  const latest = useRef({ echoCancellation, onEchoCancellation });
  latest.current = { echoCancellation, onEchoCancellation };

  useEffect(() => {
    if (!inCall) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    const check = async () => {
      const label = await currentOutputLabel().catch(() => null);
      if (cancelled || !label) return;
      const kind = outputKind(label);
      const { echoCancellation, onEchoCancellation } = latest.current;
      if (!echoCancellation && kind === "speakers") {
        onEchoCancellation(true);
        setOffer(null);
        showToast(
          `Echo cancellation is back on for ${deviceName(label.replace(/^default\s*-\s*/i, ""))}, so nobody hears themselves through it.`,
          "info",
        );
        return;
      }
      setOffer(echoCancellation && kind === "headphones" && !answered(label) ? label : null);
    };
    void check();
    const media = navigator.mediaDevices;
    media?.addEventListener?.("devicechange", check);
    window.addEventListener(DEVICE_SAVED_EVENT, check);
    return () => {
      cancelled = true;
      media?.removeEventListener?.("devicechange", check);
      window.removeEventListener(DEVICE_SAVED_EVENT, check);
    };
  }, [inCall, echoCancellation]);

  if (!offer) return null;

  const name = deviceName(offer.replace(/^default\s*-\s*/i, ""));
  const turnOff = () => {
    remember(offer, "off");
    latest.current.onEchoCancellation(false);
    setOffer(null);
    showToast("Echo cancellation off. You'll stay full-voiced when people talk over each other.", "success");
  };
  const keep = () => {
    remember(offer, "keep");
    setOffer(null);
  };

  return (
    <div className="device-prompt" role="alertdialog" aria-label="Listening on headphones">
      <span className="device-prompt-icon">
        <Headphones size={20} />
      </span>
      <div className="device-prompt-body">
        <strong>On headphones?</strong>
        <span className="device-prompt-name">{name}</span>
        <span>
          Echo cancellation isn&apos;t needed on headphones, and turning it off
          keeps your voice full when people talk over each other.
        </span>
        <div className="device-prompt-actions">
          <button type="button" className="discord-btn primary-indigo" onClick={turnOff}>
            Turn it off
          </button>
          <button type="button" className="discord-btn secondary-gray" onClick={keep}>
            I&apos;m on speakers
          </button>
        </div>
      </div>
    </div>
  );
}
