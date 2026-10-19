"use client";

import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import type { PublicUser } from "@/lib/users";
import { apiFetch } from "./client";

/**
 * Passkeys in the browser. The WebAuthn helper is loaded only when a passkey
 * is actually used, so the sign-in screen stays light.
 */
export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

const browser = () => import("@simplewebauthn/browser");

/** The browser's own "you cancelled" errors, which need no red message. */
export function passkeyCancelled(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  return name === "NotAllowedError" || name === "AbortError";
}

export async function signInWithPasskey(): Promise<{ user: PublicUser }> {
  const { startAuthentication } = await browser();
  const { options, challengeId } = await apiFetch<{
    options: PublicKeyCredentialRequestOptionsJSON;
    challengeId: string;
  }>("/api/auth/passkey", { method: "POST", body: JSON.stringify({ action: "options" }) });
  const response = await startAuthentication({ optionsJSON: options });
  return apiFetch("/api/auth/passkey", {
    method: "POST",
    body: JSON.stringify({ action: "verify", challengeId, response }),
  });
}

/** The second step of a password sign-in, answered with a passkey. */
export async function passkeySecondFactor(ticket: string): Promise<{ user: PublicUser }> {
  const { startAuthentication } = await browser();
  const { options, challengeId } = await apiFetch<{
    options: PublicKeyCredentialRequestOptionsJSON;
    challengeId: string;
  }>("/api/auth/two-factor", {
    method: "POST",
    body: JSON.stringify({ ticket, action: "passkey-options" }),
  });
  const response = await startAuthentication({ optionsJSON: options });
  return apiFetch("/api/auth/two-factor", {
    method: "POST",
    body: JSON.stringify({ ticket, action: "passkey", challengeId, response }),
  });
}

export async function addPasskey(password: string, name: string): Promise<void> {
  const { startRegistration } = await browser();
  const { options, challengeId } = await apiFetch<{
    options: PublicKeyCredentialCreationOptionsJSON;
    challengeId: string;
  }>("/api/settings/passkeys", { method: "POST", body: JSON.stringify({ action: "options", password }) });
  const response = await startRegistration({ optionsJSON: options });
  await apiFetch("/api/settings/passkeys", {
    method: "POST",
    body: JSON.stringify({ action: "register", challengeId, response, name }),
  });
}

/** A default name for a new passkey, from the device it is made on. */
export function suggestedPasskeyName(): string {
  if (typeof navigator === "undefined") return "Passkey";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Mac OS X|Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux computer";
  return "Passkey";
}

/**
 * The desktop apps on macOS and Linux are web views that cannot reach the
 * system's passkeys (iCloud Keychain, Touch ID, phone nearby): the request
 * fails at once, as if cancelled. There the sign-in is handed to the system
 * browser instead. Windows' web views do have Windows Hello, so they stay put.
 */
export function passkeysNeedBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const shell = window as { huddle?: { desktop?: boolean }; __TAURI__?: unknown };
  return Boolean(shell.huddle?.desktop || shell.__TAURI__) && !/Windows/.test(navigator.userAgent);
}

/** Opens a page in the system browser from any of the desktop shells. */
function openInBrowser(url: string): void {
  const shellOpen = (window as { __TAURI__?: { shell?: { open?: (url: string) => Promise<void> } } }).__TAURI__?.shell?.open;
  if (shellOpen) void shellOpen(url).catch(() => window.open(url, "_blank"));
  else window.open(url, "_blank");
}

export interface PasskeyHandoff {
  /** The short code the browser page shows too, so the two can be matched. */
  code: string;
  /** Opens the browser page again, if it got closed. */
  reopen: () => void;
  /** Resolves with the signed-in user once the browser is done. */
  done: Promise<{ user: PublicUser }>;
}

const HANDOFF_POLL_MS = 2000;

/** Opens the browser page and asks `poll` every couple of seconds until it gives an answer. */
function waitOnBrowser<T>(
  path: string,
  code: string,
  signal: AbortSignal,
  poll: () => Promise<T | null>,
): { code: string; reopen: () => void; done: Promise<T> } {
  const url = `${window.location.origin}${path}`;
  openInBrowser(url);
  const done = (async () => {
    while (!signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, HANDOFF_POLL_MS));
      if (signal.aborted) break;
      const answer = await poll();
      if (answer) return answer;
    }
    throw new DOMException("Stopped waiting", "AbortError");
  })();
  return { code, reopen: () => openInBrowser(url), done };
}

/** Starts a passkey sign-in in the system browser; `signal` stops the waiting. */
export async function signInWithPasskeyInBrowser(signal: AbortSignal): Promise<PasskeyHandoff> {
  const { handoffId, secret, code } = await apiFetch<{ handoffId: string; secret: string; code: string }>(
    "/api/auth/passkey",
    { method: "POST", body: JSON.stringify({ action: "handoff-start" }) },
  );
  return waitOnBrowser(`/passkey-signin?h=${encodeURIComponent(handoffId)}`, code, signal, async () => {
    const data = await apiFetch<{ pending?: boolean; user?: PublicUser }>("/api/auth/passkey", {
      method: "POST",
      body: JSON.stringify({ action: "handoff-poll", handoffId, secret }),
    });
    return data.user ? { user: data.user } : null;
  });
}

/** Adding a passkey from a desktop app: the password is checked here, the key is made in the browser. */
export async function addPasskeyInBrowser(
  password: string,
  name: string,
  signal: AbortSignal,
): Promise<{ code: string; reopen: () => void; done: Promise<true> }> {
  const { handoffId, secret, code } = await apiFetch<{ handoffId: string; secret: string; code: string }>(
    "/api/settings/passkeys",
    { method: "POST", body: JSON.stringify({ action: "handoff-start", password, name }) },
  );
  return waitOnBrowser(`/passkey-signin?setup=${encodeURIComponent(handoffId)}`, code, signal, async () => {
    const data = await apiFetch<{ done?: boolean }>("/api/settings/passkeys", {
      method: "POST",
      body: JSON.stringify({ action: "handoff-poll", handoffId, secret }),
    });
    return data.done ? true : null;
  });
}

/** The browser side of adding a passkey: the code to show and the options to make it with. */
export function passkeySetupInfo(
  handoffId: string,
): Promise<{ code: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  return apiFetch("/api/settings/passkeys", { method: "POST", body: JSON.stringify({ action: "setup-info", handoffId }) });
}

/** The browser side of adding a passkey: makes it, which the waiting app then sees. */
export async function finishPasskeySetup(
  handoffId: string,
  options: PublicKeyCredentialCreationOptionsJSON,
): Promise<void> {
  const { startRegistration } = await browser();
  const response = await startRegistration({ optionsJSON: options });
  await apiFetch("/api/settings/passkeys", {
    method: "POST",
    body: JSON.stringify({ action: "setup-finish", handoffId, response }),
  });
}

/** The browser side of a hand-off: the code to show, or an error when it expired. */
export function passkeyHandoffCode(handoffId: string): Promise<{ code: string }> {
  return apiFetch("/api/auth/passkey", { method: "POST", body: JSON.stringify({ action: "handoff-info", handoffId }) });
}

/** The browser side of a hand-off: the passkey ceremony, which signs the waiting app in. */
export async function approvePasskeyHandoff(handoffId: string): Promise<void> {
  const { startAuthentication } = await browser();
  const { options, challengeId } = await apiFetch<{
    options: PublicKeyCredentialRequestOptionsJSON;
    challengeId: string;
  }>("/api/auth/passkey", { method: "POST", body: JSON.stringify({ action: "options" }) });
  const response = await startAuthentication({ optionsJSON: options });
  await apiFetch("/api/auth/passkey", {
    method: "POST",
    body: JSON.stringify({ action: "verify", challengeId, response, handoffId }),
  });
}
