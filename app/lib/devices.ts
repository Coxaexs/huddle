"use client";

/**
 * Microphone, speaker and camera selection, the way Discord does it.
 *
 * Choices live in localStorage per device rather than on the account: which
 * headset is plugged into this machine is a property of the machine, not of
 * you. Output selection needs `setSinkId`, which desktop Chromium has and
 * phones generally do not — the picker hides itself where it cannot work.
 */

export type DeviceKind = "microphone" | "speaker" | "camera";

const STORAGE_KEY: Record<DeviceKind, string> = {
  microphone: "huddle-device-mic",
  speaker: "huddle-device-speaker",
  camera: "huddle-device-camera",
};

export interface DeviceOption {
  deviceId: string;
  label: string;
}

export interface DeviceLists {
  microphones: DeviceOption[];
  speakers: DeviceOption[];
  cameras: DeviceOption[];
}

export function savedDevice(kind: DeviceKind): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY[kind]) || "";
}

export function saveDevice(kind: DeviceKind, deviceId: string): void {
  if (typeof window === "undefined") return;
  if (deviceId) window.localStorage.setItem(STORAGE_KEY[kind], deviceId);
  else window.localStorage.removeItem(STORAGE_KEY[kind]);
  if (kind === "speaker") applySinkToAll();
}

/** Constraints for getUserMedia that honour the saved microphone. */
export function microphoneConstraints(): MediaTrackConstraints {
  const deviceId = savedDevice("microphone");
  // Noise suppression is on by default; the Voice settings toggle can disable it.
  const noise =
    typeof window === "undefined" ||
    window.localStorage.getItem("huddle-noise") !== "off";
  return {
    echoCancellation: true,
    noiseSuppression: noise,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

export function cameraConstraints(): MediaTrackConstraints {
  const deviceId = savedDevice("camera");
  return {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

export function supportsOutputSelection(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof HTMLMediaElement !== "undefined" &&
    "setSinkId" in HTMLMediaElement.prototype
  );
}

/**
 * Every media element the app creates registers here, so choosing a speaker
 * (or unlocking audio on a phone) can reach all of them at once.
 */
const elements = new Set<HTMLMediaElement>();

type SinkCapable = HTMLMediaElement & {
  setSinkId?: (id: string) => Promise<void>;
};

export function registerMedia(element: HTMLMediaElement | null): void {
  if (!element || elements.has(element)) return;
  elements.add(element);
  // Phones ignore autoplay until a gesture; keeping the element inline and
  // retrying on play is what makes voice audible there.
  element.setAttribute("playsinline", "");
  applySink(element);
}

export function unregisterMedia(element: HTMLMediaElement | null): void {
  if (element) elements.delete(element);
}

export function applySink(element: HTMLMediaElement): void {
  const sink = savedDevice("speaker");
  if (!sink || !supportsOutputSelection()) return;
  void (element as SinkCapable).setSinkId?.(sink).catch(() => undefined);
}

function applySinkToAll(): void {
  for (const element of elements) applySink(element);
}

/**
 * Nudges every registered element into playing. Call it from a real click or
 * touch: that is the only moment a mobile browser will allow it.
 */
export function unlockAudio(): void {
  for (const element of elements) {
    if (element.paused) void element.play().catch(() => undefined);
  }
}

/** Labels are blank until the page has held a media permission at least once. */
export async function listDevices(): Promise<DeviceLists> {
  const empty: DeviceLists = { microphones: [], speakers: [], cameras: [] };
  if (!navigator.mediaDevices?.enumerateDevices) return empty;

  const devices = await navigator.mediaDevices.enumerateDevices();
  const label = (device: MediaDeviceInfo, index: number, noun: string) =>
    device.label || `${noun} ${index + 1}`;

  return {
    microphones: devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: label(device, index, "Microphone"),
      })),
    speakers: devices
      .filter((device) => device.kind === "audiooutput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: label(device, index, "Speaker"),
      })),
    cameras: devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: label(device, index, "Camera"),
      })),
  };
}

/**
 * Asks for microphone (and optionally camera) access purely so device labels
 * become readable, then drops the stream again.
 */
export async function primeDeviceLabels(video = false): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video,
    });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    // Without permission the selects still work, just with generic names.
  }
}
