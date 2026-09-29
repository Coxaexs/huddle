import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const env: { FCM_SERVICE_ACCOUNT?: string } = {};
vi.mock("./storage", () => ({ bindings: () => env }));

import { fcmConfigured, sendFcm, signServiceAccountJwt } from "./fcm";

let keys: CryptoKeyPair;
let pem: string;

function b64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromB64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const der = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  pem = `-----BEGIN PRIVATE KEY-----\n${b64(der).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete env.FCM_SERVICE_ACCOUNT;
});

const account = () => ({
  project_id: "huddle-test",
  client_email: "push@huddle-test.iam.gserviceaccount.com",
  private_key: pem,
});

describe("signServiceAccountJwt", () => {
  it("produces an RS256 JWT Google can verify", async () => {
    const jwt = await signServiceAccountJwt(account(), keys.privateKey, 1_000);
    const [header, claims, signature] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(fromB64Url(header)))).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(new TextDecoder().decode(fromB64Url(claims)))).toMatchObject({
      iss: "push@huddle-test.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_000,
      exp: 4_600,
    });
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      keys.publicKey,
      fromB64Url(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});

describe("sendFcm", () => {
  it("is off without a service account", async () => {
    expect(fcmConfigured()).toBe(false);
    expect(await sendFcm("token", { title: "t", body: "b" })).toBe("failed");
  });

  it("authenticates, then sends to the device on the right channel", async () => {
    // The JSON key file escapes newlines in private_key; make sure that parses.
    env.FCM_SERVICE_ACCOUNT = JSON.stringify(account());
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("oauth2")) {
        return Response.json({ access_token: "ya29.test", expires_in: 3600 });
      }
      return Response.json({ name: "projects/huddle-test/messages/1" });
    });

    const result = await sendFcm("device-token", {
      title: "Alice",
      body: "hi",
      url: "https://chat.hoffle.online/",
      tag: "dm-1",
      urgent: true,
    });
    expect(result).toBe("ok");
    expect(calls[1].url).toBe("https://fcm.googleapis.com/v1/projects/huddle-test/messages:send");
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer ya29.test");
    const message = JSON.parse(String(calls[1].init.body)).message;
    expect(message.token).toBe("device-token");
    expect(message.notification).toEqual({ title: "Alice", body: "hi" });
    expect(message.data).toEqual({ url: "https://chat.hoffle.online/", tag: "dm-1" });
    expect(message.android.priority).toBe("HIGH");
    expect(message.android.notification.channel_id).toBe("huddle-calls");
  });

  it("reports uninstalled devices as gone", async () => {
    env.FCM_SERVICE_ACCOUNT = JSON.stringify(account());
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("oauth2")
        ? Response.json({ access_token: "ya29.test", expires_in: 3600 })
        : new Response(JSON.stringify({ error: { details: [{ errorCode: "UNREGISTERED" }] } }), { status: 400 }),
    );
    expect(await sendFcm("old-token", { title: "t", body: "b" })).toBe("gone");
  });
});
