"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, KeyRound, LogOut, Monitor, ShieldCheck, Smartphone } from "lucide-react";
import { apiFetch, apiUrl } from "../../lib/client";
import {
  addPasskey,
  addPasskeyInBrowser,
  passkeyCancelled,
  passkeysNeedBrowser,
  passkeysSupported,
  suggestedPasskeyName,
} from "../../lib/passkeys";
import { currentLocale, tNow, useI18n } from "../../lib/i18n-context";
import type { MessageKey } from "@/lib/i18n";

interface SessionInfo {
  id: string;
  device: string;
  browser: string;
  os: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  current: boolean;
}

interface SecurityState {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
  passkeys: Array<{ id: string; name: string; createdAt: string; lastUsedAt: string | null }>;
}

function when(iso: string | null): string {
  if (!iso) return tNow("security.when.never");
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 15) return tNow("security.when.justNow");
  if (minutes < 60) return tNow("security.when.minutes", { count: minutes });
  if (minutes < 24 * 60) return tNow("security.when.hours", { count: Math.round(minutes / 60) });
  return date.toLocaleDateString(currentLocale(), { day: "numeric", month: "short", year: "numeric" });
}

function errorText(failure: unknown, fallback = tNow("security.failed")): string {
  return failure instanceof Error ? failure.message : fallback;
}

/** The generic names the server sends in English (lib/user-agent.ts). */
const GENERIC_DEVICES: Record<string, MessageKey> = {
  "Unknown device": "device.unknown",
  "Hoffle desktop app": "device.hoffleDesktop",
  "Hoffle app": "device.hoffleApp",
  "A script or bot": "device.script",
  "A browser": "device.browser",
};

function deviceName(session: SessionInfo): string {
  const generic = GENERIC_DEVICES[session.browser];
  const browser = generic ? tNow(generic) : session.browser;
  return session.os ? tNow("security.device", { browser, os: session.os }) : browser;
}

/**
 * Settings → Account & Password → Security: where you are signed in, two-step
 * sign-in with an authenticator app, and passkeys. Loads its own data so the
 * settings dialog does not have to carry it.
 */
export function SecuritySection() {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [state, setState] = useState<SecurityState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Two-factor setup: password → QR code → first code → recovery codes.
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [askPasswordFor, setAskPasswordFor] = useState<null | "setup" | "recovery" | "passkey" | string>(null);
  const [canPasskey, setCanPasskey] = useState(false);
  // A desktop app's new passkey, being made in the system browser.
  const [browserCode, setBrowserCode] = useState<{ code: string; reopen: () => void } | null>(null);
  const browserStop = useRef<AbortController | null>(null);
  useEffect(() => () => browserStop.current?.abort(), []);

  const load = useCallback(async () => {
    try {
      const [sessionData, securityData] = await Promise.all([
        apiFetch<{ sessions: SessionInfo[] }>("/api/settings/sessions"),
        apiFetch<SecurityState>("/api/settings/two-factor"),
      ]);
      setSessions(sessionData.sessions);
      setState(securityData);
    } catch (failure) {
      setError(errorText(failure, t("security.loadFailed")));
    }
  }, []);

  useEffect(() => {
    void load();
    setCanPasskey(passkeysSupported());
  }, [load]);

  async function run(task: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await task();
    } catch (failure) {
      if (!passkeyCancelled(failure)) setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  const signOut = (id: string) =>
    run(async () => {
      const data = await apiFetch<{ sessions: SessionInfo[] }>("/api/settings/sessions", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      setSessions(data.sessions);
    });

  const signOutOthers = () =>
    run(async () => {
      const data = await apiFetch<{ sessions: SessionInfo[] }>("/api/settings/sessions", {
        method: "DELETE",
        body: JSON.stringify({ others: true }),
      });
      setSessions(data.sessions);
      setNotice(t("security.signedOutOthers"));
    });

  const startSetup = () =>
    run(async () => {
      const data = await apiFetch<{ secret: string; uri: string }>("/api/settings/two-factor", {
        method: "POST",
        body: JSON.stringify({ action: "setup", password }),
      });
      const { renderSVG } = await import("uqr");
      setSetup({ ...data, qr: renderSVG(data.uri, { border: 2 }) });
      setPassword("");
      setAskPasswordFor(null);
      setCode("");
    });

  const confirmSetup = () =>
    run(async () => {
      const data = await apiFetch<{ recoveryCodes: string[] }>("/api/settings/two-factor", {
        method: "POST",
        body: JSON.stringify({ action: "enable", code }),
      });
      setSetup(null);
      setCode("");
      setRecoveryCodes(data.recoveryCodes);
      await load();
    });

  const newRecoveryCodes = () =>
    run(async () => {
      const data = await apiFetch<{ recoveryCodes: string[] }>("/api/settings/two-factor", {
        method: "POST",
        body: JSON.stringify({ action: "recovery", password }),
      });
      setPassword("");
      setAskPasswordFor(null);
      setRecoveryCodes(data.recoveryCodes);
      await load();
    });

  const turnOff = () =>
    run(async () => {
      await apiFetch("/api/settings/two-factor", {
        method: "POST",
        body: JSON.stringify({ action: "disable", password, code }),
      });
      setPassword("");
      setCode("");
      setDisabling(false);
      setNotice(t("security.twoStepOff"));
      await load();
    });

  const createPasskey = () =>
    run(async () => {
      if (passkeysNeedBrowser()) {
        browserStop.current?.abort();
        const stop = new AbortController();
        browserStop.current = stop;
        try {
          const started = await addPasskeyInBrowser(password, suggestedPasskeyName(), stop.signal);
          setPassword("");
          setBrowserCode(started);
          await started.done;
        } finally {
          setBrowserCode(null);
        }
      } else {
        await addPasskey(password, suggestedPasskeyName());
      }
      setPassword("");
      setAskPasswordFor(null);
      setNotice(t("security.passkeyAdded"));
      await load();
    });

  const removePasskey = (id: string) =>
    run(async () => {
      await apiFetch("/api/settings/passkeys", {
        method: "DELETE",
        body: JSON.stringify({ id, password }),
      });
      setPassword("");
      setAskPasswordFor(null);
      await load();
    });

  function copyCodes() {
    if (!recoveryCodes) return;
    void navigator.clipboard?.writeText(recoveryCodes.join("\n")).then(
      () => setNotice(t("security.codesCopied")),
      () => undefined,
    );
  }

  /** The password box shown before a change that needs it. */
  function passwordPrompt(label: string, action: () => void) {
    return (
      <div className="security-confirm">
        <label htmlFor="security-password">{t("security.passwordToConfirm")}</label>
        <input
          id="security-password"
          type="password"
          value={password}
          autoComplete="current-password"
          autoFocus
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && password) action();
          }}
        />
        <div className="security-actions">
          <button type="button" className="primary" disabled={!password || busy} onClick={action}>
            {label}
          </button>
          <button
            type="button"
            onClick={() => {
              setAskPasswordFor(null);
              setPassword("");
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="profile-studio-section security-section">
        <h3 className="profile-studio-section-title">{t("security.devices.title")}</h3>
        <p className="modal-hint">{t("security.devices.hint")}</p>
        {!sessions && !error && <p className="modal-hint">{t("common.loading")}</p>}
        {sessions && (
          <ul className="security-list">
            {sessions.map((session) => {
              const phone = /iPhone|Android|iPad/.test(session.os || "") || session.browser === "Hoffle app";
              return (
                <li key={session.id}>
                  {phone ? <Smartphone size={18} aria-hidden /> : <Monitor size={18} aria-hidden />}
                  <span className="security-list-main">
                    <strong>{deviceName(session)}</strong>
                    <span>
                      {session.current
                        ? t("security.devices.thisDevice")
                        : t("security.devices.lastActive", { when: when(session.lastUsedAt || session.createdAt) })}
                      {session.ip && session.ip !== "unknown" ? ` · ${session.ip}` : ""}
                    </span>
                  </span>
                  {!session.current && (
                    <button type="button" disabled={busy} onClick={() => void signOut(session.id)}>
                      {t("security.devices.signOut")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {sessions && sessions.length > 1 && (
          <button type="button" disabled={busy} onClick={() => void signOutOthers()}>
            <LogOut size={14} aria-hidden /> {t("security.devices.signOutOthers")}
          </button>
        )}
      </section>

      <section className="profile-studio-section security-section">
        <h3 className="profile-studio-section-title">
          <ShieldCheck size={16} aria-hidden /> {t("security.twoStep.title")}
        </h3>
        {state && !state.enabled && !setup && (
          <>
            <p className="modal-hint">{t("security.twoStep.about")}</p>
            {askPasswordFor === "setup" ? (
              passwordPrompt(t("gate.button.continue"), () => void startSetup())
            ) : (
              <button type="button" className="primary" onClick={() => setAskPasswordFor("setup")}>
                {t("security.twoStep.turnOn")}
              </button>
            )}
          </>
        )}

        {setup && (
          <div className="security-setup">
            <p className="modal-hint">{t("security.twoStep.scan")}</p>
            <div className="security-qr" dangerouslySetInnerHTML={{ __html: setup.qr }} />
            <p className="modal-hint">
              {t("security.twoStep.typeKey")} <code className="security-secret">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
            </p>
            <a className="security-open-app" href={setup.uri}>
              {t("security.twoStep.openInApp")}
            </a>
            <label htmlFor="security-first-code">{t("security.twoStep.codeFromApp")}</label>
            <input
              id="security-first-code"
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <div className="security-actions">
              <button type="button" className="primary" disabled={code.length !== 6 || busy} onClick={() => void confirmSetup()}>
                {t("security.twoStep.confirm")}
              </button>
              <button type="button" onClick={() => setSetup(null)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        {recoveryCodes && (
          <div className="security-recovery">
            <p>
              <strong>{t("security.twoStep.saveCodes")}</strong> {t("security.twoStep.codesAbout")}
            </p>
            <ol className="security-codes">
              {recoveryCodes.map((item) => (
                <li key={item}>
                  <code>{item}</code>
                </li>
              ))}
            </ol>
            <div className="security-actions">
              <button type="button" onClick={copyCodes}>
                {t("common.copy")}
              </button>
              <button type="button" className="primary" onClick={() => setRecoveryCodes(null)}>
                {t("security.twoStep.savedThem")}
              </button>
            </div>
          </div>
        )}

        {state?.enabled && !recoveryCodes && (
          <>
            <p className="modal-hint">
              {t("security.twoStep.onSince", { when: when(state.enabledAt) })}{" "}
              {t("security.twoStep.codesLeft", { count: state.recoveryCodesLeft })}
            </p>
            {askPasswordFor === "recovery" ? (
              passwordPrompt(t("security.twoStep.makeNewCodes"), () => void newRecoveryCodes())
            ) : disabling ? (
              <div className="security-confirm">
                <label htmlFor="security-password">{t("gate.label.password")}</label>
                <input
                  id="security-password"
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                />
                <label htmlFor="security-off-code">{t("security.twoStep.offCode")}</label>
                <input
                  id="security-off-code"
                  value={code}
                  autoComplete="one-time-code"
                  onChange={(event) => setCode(event.target.value.slice(0, 12))}
                />
                <div className="security-actions">
                  <button type="button" className="danger" disabled={!password || !code || busy} onClick={() => void turnOff()}>
                    {t("security.twoStep.turnOff")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDisabling(false);
                      setPassword("");
                      setCode("");
                    }}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="security-actions">
                <button type="button" onClick={() => setAskPasswordFor("recovery")}>
                  {t("security.twoStep.newCodes")}
                </button>
                <button type="button" className="danger" onClick={() => setDisabling(true)}>
                  {t("security.twoStep.turnOff")}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="profile-studio-section security-section">
        <h3 className="profile-studio-section-title">
          <KeyRound size={16} aria-hidden /> {t("security.passkeys.title")}
        </h3>
        <p className="modal-hint">{t("security.passkeys.about")}</p>
        {state && state.passkeys.length > 0 && (
          <ul className="security-list">
            {state.passkeys.map((key) => (
              <li key={key.id}>
                <KeyRound size={18} aria-hidden />
                <span className="security-list-main">
                  <strong>{key.name}</strong>
                  <span>{t("security.passkeys.added", { when: when(key.createdAt), used: when(key.lastUsedAt) })}</span>
                </span>
                {askPasswordFor !== key.id && (
                  <button type="button" onClick={() => setAskPasswordFor(key.id)}>
                    {t("common.remove")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {askPasswordFor && state?.passkeys.some((key) => key.id === askPasswordFor) &&
          passwordPrompt(t("security.passkeys.remove"), () => void removePasskey(askPasswordFor))}
        {browserCode ? (
          <>
            <p className="modal-hint">{t("security.passkeys.inBrowser", { code: browserCode.code })}</p>
            <button type="button" onClick={browserCode.reopen}>
              {t("gate.button.openBrowserAgain")}
            </button>
            <button type="button" onClick={() => browserStop.current?.abort()}>
              {t("security.passkeys.stopWaiting")}
            </button>
          </>
        ) : !canPasskey ? (
          <p className="modal-hint">{t("security.passkeys.unsupported")}</p>
        ) : askPasswordFor === "passkey" ? (
          passwordPrompt(t("security.passkeys.addConfirm"), () => void createPasskey())
        ) : (
          <button type="button" className="primary" onClick={() => setAskPasswordFor("passkey")}>
            {t("security.passkeys.add")}
          </button>
        )}
      </section>

      <section className="profile-studio-section security-section">
        <h3 className="profile-studio-section-title">
          <Download size={16} aria-hidden /> {t("security.data.title")}
        </h3>
        <p className="modal-hint">{t("security.data.about")}</p>
        <a className="security-download" href={apiUrl("/api/settings/export")} download>
          <Download size={14} aria-hidden /> {t("security.data.download")}
        </a>
      </section>

      {error && <p className="auth-error">{error}</p>}
      {notice && <p className="modal-hint">{notice}</p>}
    </>
  );
}
