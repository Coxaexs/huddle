/**
 * Push notifications in the native Android app (mobile/), via Firebase Cloud
 * Messaging. Browser Web Push can't run inside the app's WebView, so the app
 * registers its FCM device token with the server instead (/api/push/native).
 *
 * iOS is skipped: a sideloaded app has no push entitlement, so Apple won't
 * issue it a token. In a browser everything here is a no-op.
 */
import { apiFetch } from "./client";
import { nativePlatform } from "./native-voice";

interface PushPlugin {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  createChannel(channel: {
    id: string;
    name: string;
    description?: string;
    importance?: 1 | 2 | 3 | 4 | 5;
    visibility?: -1 | 0 | 1;
    vibration?: boolean;
    sound?: string;
  }): Promise<void>;
  addListener(
    event: "registration",
    handler: (token: { value: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

let token: string | null = null;
let started = false;

function pushPlugin(): PushPlugin | null {
  if (nativePlatform() !== "android") return null;
  const cap = (window as unknown as {
    Capacitor?: { registerPlugin?: <T>(name: string) => T };
  }).Capacitor;
  return cap?.registerPlugin ? cap.registerPlugin<PushPlugin>("PushNotifications") : null;
}

/** Asks for notification permission (once) and sends this phone's token to the server. */
export async function registerNativePush(): Promise<void> {
  const push = pushPlugin();
  if (!push || started) return;
  started = true;
  try {
    // Must match the channel ids lib/fcm.ts sends to.
    await push.createChannel({
      id: "huddle-messages",
      name: "Messages",
      description: "Direct messages, mentions and replies",
      importance: 4,
      visibility: 0,
      vibration: true,
    });
    await push.createChannel({
      id: "huddle-calls",
      name: "Calls",
      description: "Incoming voice calls",
      importance: 5,
      visibility: 1,
      vibration: true,
    });

    let permission = (await push.checkPermissions()).receive;
    if (permission === "prompt" || permission === "prompt-with-rationale") {
      permission = (await push.requestPermissions()).receive;
    }
    if (permission !== "granted") return;

    await push.addListener("registration", (result) => {
      token = result.value;
      void apiFetch("/api/push/native", {
        method: "POST",
        body: JSON.stringify({ token: result.value }),
      }).catch(() => undefined);
    });
    await push.register();
  } catch {
    // No Firebase config in this build, or the user said no: stay quiet.
    started = false;
  }
}

/** On sign out: stop this phone getting the account's notifications. */
export async function unregisterNativePush(): Promise<void> {
  if (!token) return;
  const current = token;
  token = null;
  started = false;
  await apiFetch(`/api/push/native?token=${encodeURIComponent(current)}`, {
    method: "DELETE",
  }).catch(() => undefined);
}
