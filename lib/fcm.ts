import { bindings } from "./storage";
import type { PushPayload } from "./push";

/**
 * Firebase Cloud Messaging (HTTP v1) for the native Android app.
 *
 * Configured with one secret, FCM_SERVICE_ACCOUNT: the JSON key of a Firebase
 * service account (Project settings → Service accounts → Generate new private
 * key). We sign a short-lived JWT with it using WebCrypto, swap it for an
 * OAuth access token, and cache that until shortly before it expires.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedAccount: { raw: string; account: ServiceAccount; key: CryptoKey } | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

export function fcmConfigured(): boolean {
  return Boolean((bindings() as { FCM_SERVICE_ACCOUNT?: string }).FCM_SERVICE_ACCOUNT?.trim());
}

function base64Url(bytes: Uint8Array | string): string {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function loadAccount(): Promise<{ account: ServiceAccount; key: CryptoKey } | null> {
  const raw = (bindings() as { FCM_SERVICE_ACCOUNT?: string }).FCM_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  if (cachedAccount?.raw === raw) return cachedAccount;
  const account = JSON.parse(raw) as ServiceAccount;
  const pem = account.private_key
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  cachedAccount = { raw, account, key };
  cachedToken = null;
  return cachedAccount;
}

/** Builds the signed JWT Google trades for an access token. Exported for tests. */
export async function signServiceAccountJwt(
  account: ServiceAccount,
  key: CryptoKey,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: account.token_uri || "https://oauth2.googleapis.com/token",
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;
}

async function accessToken(account: ServiceAccount, key: CryptoKey): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const assertion = await signServiceAccountJwt(account, key);
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`FCM auth failed: HTTP ${response.status}`);
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

/**
 * Sends one notification. Resolves to "gone" when Google says the device
 * token is dead (app uninstalled), so the caller can forget it.
 */
export async function sendFcm(token: string, payload: PushPayload): Promise<"ok" | "gone" | "failed"> {
  const loaded = await loadAccount();
  if (!loaded) return "failed";
  const { account, key } = loaded;
  const bearer = await accessToken(account, key);
  const data: Record<string, string> = {};
  if (payload.url) data.url = payload.url;
  if (payload.tag) data.tag = payload.tag;
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data,
          android: {
            priority: payload.urgent ? "HIGH" : "NORMAL",
            ttl: payload.urgent ? "60s" : "3600s",
            notification: {
              // Channels are created by the app (app/lib/native-push.ts).
              channel_id: payload.urgent ? "huddle-calls" : "huddle-messages",
              ...(payload.tag ? { tag: payload.tag } : {}),
            },
          },
        },
      }),
    },
  );
  if (response.ok) return "ok";
  if (response.status === 404) return "gone";
  const error = await response.text().catch(() => "");
  return /UNREGISTERED|registration-token-not-registered/.test(error) ? "gone" : "failed";
}
