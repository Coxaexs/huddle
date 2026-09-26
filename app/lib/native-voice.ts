/**
 * Talks to the native Huddle apps (mobile/, Capacitor) about voice calls.
 *
 * In a browser this is all a no-op. Inside the Android app it drives the
 * "In voice" notification and the floating bubble; inside the iOS app, the
 * CallKit call UI. Buttons pressed there come back through `onNativeVoiceAction`.
 */

export type NativeVoiceAction = "mute" | "deafen" | "disconnect";

interface VoiceState {
  channelName: string;
  muted: boolean;
  deafened: boolean;
}

interface HuddleVoicePlugin {
  start(state: VoiceState): Promise<void>;
  update(state: VoiceState): Promise<void>;
  stop(): Promise<void>;
  canDrawOverlays(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<void>;
  addListener(
    event: "action",
    handler: (data: { action: NativeVoiceAction }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: <T>(name: string) => T;
}

let plugin: HuddleVoicePlugin | null | undefined;

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
}

function voicePlugin(): HuddleVoicePlugin | null {
  if (plugin !== undefined) return plugin;
  const cap = capacitor();
  plugin = cap?.registerPlugin ? cap.registerPlugin<HuddleVoicePlugin>("HuddleVoice") : null;
  return plugin;
}

/** "android" | "ios" inside the native apps, null in a browser. */
export function nativePlatform(): "android" | "ios" | null {
  const platform = capacitor()?.getPlatform?.();
  return platform === "android" || platform === "ios" ? platform : null;
}

export function syncNativeVoice(state: VoiceState | null, wasInVoice: boolean) {
  const native = voicePlugin();
  if (!native) return;
  const call = state ? (wasInVoice ? native.update(state) : native.start(state)) : native.stop();
  void call.catch(() => undefined);
}

export function onNativeVoiceAction(handler: (action: NativeVoiceAction) => void): () => void {
  const native = voicePlugin();
  if (!native) return () => undefined;
  const pending = native.addListener("action", (data) => handler(data.action));
  return () => {
    void pending.then((listener) => listener.remove()).catch(() => undefined);
  };
}

/** Android only: whether the floating bubble is allowed to draw over other apps. */
export async function canShowVoiceBubble(): Promise<boolean> {
  const native = voicePlugin();
  if (!native || nativePlatform() !== "android") return true;
  try {
    return (await native.canDrawOverlays()).granted;
  } catch {
    return true;
  }
}

export function requestVoiceBubblePermission() {
  void voicePlugin()?.requestOverlayPermission().catch(() => undefined);
}
